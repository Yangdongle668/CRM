'use client';

/**
 * 所见即所得富文本编辑器。
 *
 * 基于 contenteditable + document.execCommand —— 虽然 execCommand 已被标记
 * 为"废弃"，但目前所有浏览器仍然正常支持，并且它是构建轻量 WYSIWYG
 * 编辑器而不引入重型依赖（TipTap / Lexical）的最实用选择。
 *
 * 父组件通过 `ref.current.insertHtml(...)` 手动插入签名 / 模板等内容，
 * 避免 React 受控导致的光标跳动问题（innerHTML 只有在外部 value prop
 * 真的换了时才重写）。
 */

import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  HiOutlinePaperClip,
  HiOutlinePlus,
  HiOutlineDocumentText,
  HiOutlineSparkles,
  HiOutlinePencilSquare,
  HiBars3BottomLeft,
  HiListBullet,
  HiArrowLongRight,
  HiArrowUturnLeft,
  HiArrowUturnRight,
  HiOutlineTrash,
  HiChevronDown,
  HiOutlineLink,
  HiOutlinePhoto,
} from 'react-icons/hi2';
import toast from 'react-hot-toast';
import { documentsApi } from '@/lib/api';

export interface RichTextEditorHandle {
  /** 在光标处插入一段 HTML（会保留当前选区；若无选区则追加到末尾） */
  insertHtml: (html: string) => void;
  /** 直接覆盖整个编辑器内容 */
  setHtml: (html: string) => void;
  /** 返回当前 HTML */
  getHtml: () => string;
  /** 聚焦编辑器 */
  focus: () => void;
  /** 选择并上传本地图片 */
  insertImage: () => void;
  isUploading: () => boolean;
}

interface RichTextEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** 编辑区最小高度 */
  minHeight?: number | string;
  /** 是否自适应填满父容器高度（用于写信弹窗的全屏模式） */
  flex?: boolean;
  /** 工具栏上额外的自定义按钮（例如"跟单模板"/"AI 写信"触发器） */
  extraToolbar?: React.ReactNode;
  className?: string;
  onUploadingChange?: (uploading: boolean) => void;
}

const FONT_FAMILIES = [
  { label: '微软雅黑', value: '"Microsoft YaHei", "微软雅黑"' },
  { label: '宋体', value: 'SimSun, "宋体"' },
  { label: '黑体', value: 'SimHei, "黑体"' },
  { label: '楷体', value: 'KaiTi, "楷体"' },
  { label: 'Arial', value: 'Arial, sans-serif' },
  { label: 'Times New Roman', value: '"Times New Roman", serif' },
  { label: 'Courier New', value: '"Courier New", monospace' },
  { label: 'Georgia', value: 'Georgia, serif' },
];

const FONT_SIZES = [12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 36, 48];
const LINE_HEIGHTS = ['1', '1.15', '1.5', '1.75', '2', '2.5', '3'];

const TEXT_COLORS = [
  '#000000', '#434343', '#666666', '#999999', '#b7b7b7', '#cccccc', '#d9d9d9', '#efefef', '#ffffff',
  '#980000', '#ff0000', '#ff9900', '#ffff00', '#00ff00', '#00ffff', '#4a86e8', '#0000ff', '#9900ff', '#ff00ff',
  '#e6b8af', '#f4cccc', '#fce5cd', '#fff2cc', '#d9ead3', '#d0e0e3', '#c9daf8', '#cfe2f3', '#d9d2e9', '#ead1dc',
  '#cc0000', '#e69138', '#f1c232', '#6aa84f', '#45818e', '#3d85c6', '#674ea7', '#a64d79',
];

const HIGHLIGHT_COLORS = [
  'transparent',
  '#ffff00', '#00ff00', '#00ffff', '#ff99cc', '#ff6600',
  '#ffccff', '#c9daf8', '#d9ead3', '#fff2cc', '#f4cccc',
  '#ffd966', '#e69138', '#6d9eeb', '#8e7cc3', '#dd7e6b',
];

const RichTextEditor = forwardRef<RichTextEditorHandle, RichTextEditorProps>(function RichTextEditor(
  { value, onChange, placeholder, minHeight = 240, flex = false, extraToolbar, className = '', onUploadingChange },
  ref,
) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const lastSelectionRef = useRef<Range | null>(null);
  // 初始为 null：挂载时第一次同步一定把 value 写进编辑器。以前初始化成
  // value，导致带初始内容打开（回复时的引用原文、重新打开的草稿）编辑器是空的。
  const lastExternalValueRef = useRef<string | null>(null);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const pendingUploadsRef = useRef(0);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [selectedImage, setSelectedImage] = useState<HTMLImageElement | null>(null);
  const [imageWidth, setImageWidth] = useState(320);

  useEffect(() => {
    onUploadingChange?.(uploadingImages);
  }, [uploadingImages, onUploadingChange]);

  // 用 execCommand 前先确保 styleWithCSS —— 这样产生的是 <span style>
  // 而不是 <font> 标签，HTML 更干净也更容易被邮件客户端兼容。
  // 同时把默认段落分隔改为 <p>：Chrome 默认会插 <div>，和收件客户端
  // 按 <p> 渲染的预期不一致，"编辑里紧、收件端松"的视觉差主要就是
  // 这个原因。
  useEffect(() => {
    try {
      document.execCommand('styleWithCSS', false, 'true');
      document.execCommand('defaultParagraphSeparator', false, 'p');
    } catch {
      /* 某些浏览器（Firefox）可能报错，忽略 */
    }
  }, []);

  // 只有 value 从外部真正变化时才重写 innerHTML —— 避免父组件 re-render
  // 导致 caret 跳到开头。
  useEffect(() => {
    if (!editorRef.current) return;
    if (value !== lastExternalValueRef.current && value !== editorRef.current.innerHTML) {
      editorRef.current.innerHTML = value || '';
      lastExternalValueRef.current = value;
      lastSelectionRef.current = null;
      setSelectedImage(null);
    }
  }, [value]);

  // 点击工具栏外部时关闭下拉框
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!wrapperRef.current?.contains(e.target as Node)) {
        setOpenDropdown(null);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  // 记住光标位置 —— 点击工具栏按钮会让 contenteditable 失焦，
  // 所以每次选区变化都记一下，操作前再恢复。
  const saveSelection = useCallback(() => {
    const sel = window.getSelection();
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      lastSelectionRef.current = sel.getRangeAt(0).cloneRange();
    }
  }, []);

  const restoreSelection = useCallback(() => {
    const sel = window.getSelection();
    if (!sel) return;
    sel.removeAllRanges();
    if (lastSelectionRef.current && editorRef.current?.contains(lastSelectionRef.current.commonAncestorContainer)) {
      sel.addRange(lastSelectionRef.current);
    } else if (editorRef.current) {
      // 没有保存的选区 —— 把光标放到末尾
      const range = document.createRange();
      range.selectNodeContents(editorRef.current);
      range.collapse(false);
      sel.addRange(range);
    }
    editorRef.current?.focus();
  }, []);

  const emitChange = useCallback(() => {
    if (!editorRef.current) return;
    const html = editorRef.current.innerHTML;
    lastExternalValueRef.current = html;
    onChange(html);
  }, [onChange]);

  const exec = useCallback(
    (cmd: string, arg?: string) => {
      restoreSelection();
      try {
        document.execCommand(cmd, false, arg);
      } catch {
        /* noop */
      }
      saveSelection();
      emitChange();
    },
    [restoreSelection, saveSelection, emitChange],
  );

  // line-height 没有 execCommand —— 直接对选区所在的块级元素设 style。
  const applyLineHeight = useCallback(
    (lh: string) => {
      restoreSelection();
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || !editorRef.current) return;
      const range = sel.getRangeAt(0);

      // 找到选区内涉及的所有块级元素。没有块就用整个编辑器。
      const blocks = new Set<HTMLElement>();
      const collect = (node: Node) => {
        let el: Node | null = node;
        while (el && el !== editorRef.current) {
          if (el.nodeType === 1) {
            const tag = (el as HTMLElement).tagName;
            if (['P', 'DIV', 'LI', 'BLOCKQUOTE', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(tag)) {
              blocks.add(el as HTMLElement);
              return;
            }
          }
          el = (el as Node).parentNode;
        }
      };
      collect(range.startContainer);
      collect(range.endContainer);
      if (blocks.size === 0) blocks.add(editorRef.current);
      blocks.forEach((b) => {
        b.style.lineHeight = lh;
      });
      emitChange();
    },
    [restoreSelection, emitChange],
  );

  const insertHtml = useCallback(
    (html: string) => {
      if (!editorRef.current) return;
      const sel = window.getSelection();
      // 如果当前没有在编辑器内的选区，就追加到末尾
      if (!sel || sel.rangeCount === 0 || !editorRef.current.contains(sel.anchorNode)) {
        editorRef.current.insertAdjacentHTML('beforeend', html);
      } else {
        restoreSelection();
        document.execCommand('insertHTML', false, html);
      }
      emitChange();
    },
    [restoreSelection, emitChange],
  );

  const chooseImage = () => {
    saveSelection();
    imageInputRef.current?.click();
  };

  const uploadImages = async (files: File[]) => {
    // 保存发起上传时的光标，异步完成后仍插入原来的位置。
    let range = lastSelectionRef.current?.cloneRange();
    pendingUploadsRef.current += 1;
    setUploadingImages(true);
    try {
      for (const file of files) {
        if (!/^image\/(png|jpeg|gif|webp)$/i.test(file.type)) {
          toast.error('请选择 PNG、JPG、GIF 或 WebP 图片');
          continue;
        }
        if (file.size > 10 * 1024 * 1024) {
          toast.error(`${file.name} 超过 10MB，无法上传`);
          continue;
        }
        try {
          const form = new FormData();
          form.append('file', file);
          form.append('category', 'email-inline-image');
          const res: any = await documentsApi.upload(form);
          const doc = res.data;
          if (!doc?.id || !doc?.url) throw new Error('上传未返回图片地址');
          const editor = editorRef.current;
          if (!editor) return;
          if (!range || !editor.contains(range.commonAncestorContainer)) {
            range = document.createRange();
            range.selectNodeContents(editor);
            range.collapse(false);
          }
          const img = document.createElement('img');
          img.setAttribute('src', doc.url);
          img.alt = file.name;
          img.width = 320;
          img.style.cssText = 'width:320px;max-width:100%;height:auto;';
          // Range 插入不依赖焦点：窗口最小化期间上传完成也不会丢图。
          range.deleteContents();
          range.insertNode(img);
          range.setStartAfter(img);
          range.collapse(true);
          lastSelectionRef.current = range.cloneRange();
          if (editor.getClientRects().length) {
            editor.focus();
            const selection = window.getSelection();
            selection?.removeAllRanges();
            selection?.addRange(range.cloneRange());
          }
          emitChange();
        } catch {
          toast.error(`${file.name} 图片上传失败，请重试`);
        }
      }
    } finally {
      pendingUploadsRef.current -= 1;
      setUploadingImages(pendingUploadsRef.current > 0);
    }
  };

  const resizeImage = (width: number) => {
    if (!selectedImage || !editorRef.current?.contains(selectedImage) || !Number.isFinite(width)) return;
    const next = Math.max(20, Math.min(1600, Math.round(width)));
    selectedImage.setAttribute('width', String(next));
    if (selectedImage.naturalWidth && selectedImage.naturalHeight) {
      selectedImage.setAttribute('height', String(Math.round(next * selectedImage.naturalHeight / selectedImage.naturalWidth)));
    } else {
      selectedImage.removeAttribute('height');
    }
    selectedImage.style.width = `${next}px`;
    selectedImage.style.maxWidth = '100%';
    selectedImage.style.height = 'auto';
    setImageWidth(next);
    emitChange();
  };

  useImperativeHandle(
    ref,
    () => ({
      insertHtml,
      setHtml: (html: string) => {
        if (editorRef.current) {
          editorRef.current.innerHTML = html || '';
          lastExternalValueRef.current = html;
          lastSelectionRef.current = null;
          setSelectedImage(null);
          emitChange();
        }
      },
      getHtml: () => editorRef.current?.innerHTML || '',
      focus: () => editorRef.current?.focus(),
      insertImage: chooseImage,
      isUploading: () => pendingUploadsRef.current > 0,
    }),
    [insertHtml, emitChange, saveSelection],
  );

  const toggleDropdown = (name: string) => {
    setOpenDropdown((cur) => (cur === name ? null : name));
    saveSelection();
  };

  // ============== 工具栏按钮 ==============
  const ToolbarBtn: React.FC<{
    onClick?: () => void;
    title: string;
    children: React.ReactNode;
    active?: boolean;
  }> = ({ onClick, title, children, active }) => (
    <button
      type="button"
      title={title}
      onMouseDown={(e) => e.preventDefault() /* 防止失焦 */}
      onClick={onClick}
      className={`inline-flex h-8 items-center justify-center gap-1 rounded px-1.5 text-sm transition-colors ${
        active ? 'bg-blue-100 text-blue-700' : 'text-gray-700 hover:bg-gray-100'
      }`}
    >
      {children}
    </button>
  );

  const Divider = () => <div className="mx-0.5 h-5 w-px bg-gray-200" />;

  // ============== 插入图片 / 链接 ==============
  const handleInsertImage = chooseImage;

  const handleInsertLink = () => {
    const url = window.prompt('请输入链接地址');
    if (url) exec('createLink', url);
  };

  const handleClearFormat = () => {
    exec('removeFormat');
    exec('unlink');
  };

  return (
    <div
      ref={wrapperRef}
      className={`flex flex-col rounded-lg border border-gray-300 bg-white ${flex ? 'flex-1 min-h-0' : ''} ${className}`}
    >
      <input
        ref={imageInputRef}
        type="file"
        accept="image/png,image/jpeg,image/gif,image/webp"
        multiple
        className="hidden"
        aria-label="上传本地图片"
        onChange={(e) => {
          const files = Array.from(e.target.files || []);
          e.target.value = '';
          if (files.length) void uploadImages(files);
        }}
      />
      {/* ============== 工具栏 ============== */}
      <div className="flex flex-wrap items-center gap-0.5 border-b border-gray-200 px-2 py-1.5">
        {extraToolbar}
        {extraToolbar && <Divider />}

        {/* 字体 */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleDropdown('font')}
            className="inline-flex h-8 items-center gap-1 rounded px-2 text-sm text-gray-700 hover:bg-gray-100"
            title="字体"
          >
            <span>微软雅黑</span>
            <HiChevronDown className="h-3 w-3" />
          </button>
          {openDropdown === 'font' && (
            <div className="absolute left-0 top-full z-20 mt-1 w-44 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
              {FONT_FAMILIES.map((f) => (
                <button
                  key={f.label}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    exec('fontName', f.value);
                    setOpenDropdown(null);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
                  style={{ fontFamily: f.value }}
                >
                  {f.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 字号 */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleDropdown('size')}
            className="inline-flex h-8 items-center gap-1 rounded px-2 text-sm text-gray-700 hover:bg-gray-100"
            title="字号"
          >
            <span>15px</span>
            <HiChevronDown className="h-3 w-3" />
          </button>
          {openDropdown === 'size' && (
            <div className="absolute left-0 top-full z-20 mt-1 w-24 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
              {FONT_SIZES.map((s) => (
                <button
                  key={s}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    // fontSize execCommand 只接受 1-7。为了拿到确定性的
                    // <font size="7"> 结构以便后续替换成精确的 px 值，
                    // 这里临时关掉 styleWithCSS，执行完再恢复。
                    restoreSelection();
                    try {
                      document.execCommand('styleWithCSS', false, 'false');
                      document.execCommand('fontSize', false, '7');
                      document.execCommand('styleWithCSS', false, 'true');
                    } catch {
                      /* noop */
                    }
                    if (editorRef.current) {
                      editorRef.current
                        .querySelectorAll('font[size="7"]')
                        .forEach((f) => {
                          const span = document.createElement('span');
                          span.style.fontSize = `${s}px`;
                          span.innerHTML = (f as HTMLElement).innerHTML;
                          f.replaceWith(span);
                        });
                    }
                    saveSelection();
                    emitChange();
                    setOpenDropdown(null);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
                >
                  {s}px
                </button>
              ))}
            </div>
          )}
        </div>

        <Divider />

        {/* 文字颜色 */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleDropdown('foreColor')}
            className="inline-flex h-8 items-center gap-0.5 rounded px-1.5 text-sm hover:bg-gray-100"
            title="文字颜色"
          >
            <span className="font-bold text-red-600">A</span>
            <HiChevronDown className="h-3 w-3 text-gray-500" />
          </button>
          {openDropdown === 'foreColor' && (
            <div className="absolute left-0 top-full z-20 mt-1 w-[min(280px,calc(100vw-2rem))] rounded-md border border-gray-200 bg-white p-3 shadow-lg">
              <div className="mb-1.5 text-[11px] text-gray-500">文字颜色</div>
              <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 gap-1.5">
                {TEXT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      exec('foreColor', c);
                      setOpenDropdown(null);
                    }}
                    className="h-6 w-6 rounded border border-gray-200 transition-transform hover:scale-110 hover:ring-2 hover:ring-blue-400/40"
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
              </div>
              {/* 自定义颜色：原生颜色选择器 */}
              <div className="mt-2 flex items-center gap-2 border-t border-gray-100 pt-2">
                <span className="text-[11px] text-gray-500">自定义：</span>
                <input
                  type="color"
                  onChange={(e) => {
                    exec('foreColor', e.target.value);
                  }}
                  className="h-6 w-10 cursor-pointer rounded border border-gray-200"
                  onMouseDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}
        </div>

        {/* 背景色 */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleDropdown('hiliteColor')}
            className="inline-flex h-8 items-center gap-0.5 rounded px-1.5 text-sm hover:bg-gray-100"
            title="背景颜色"
          >
            <span className="inline-flex h-4 w-4 items-center justify-center rounded bg-yellow-300 text-[10px] font-bold">A</span>
            <HiChevronDown className="h-3 w-3 text-gray-500" />
          </button>
          {openDropdown === 'hiliteColor' && (
            <div className="absolute left-0 top-full z-20 mt-1 w-[min(260px,calc(100vw-2rem))] rounded-md border border-gray-200 bg-white p-3 shadow-lg">
              <div className="mb-1.5 text-[11px] text-gray-500">背景颜色</div>
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-1.5">
                {HIGHLIGHT_COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      // hiliteColor 在 Chrome 下有时失效，backColor 更稳
                      exec('hiliteColor', c);
                      exec('backColor', c);
                      setOpenDropdown(null);
                    }}
                    className="h-6 w-6 rounded border border-gray-200 transition-transform hover:scale-110 hover:ring-2 hover:ring-blue-400/40"
                    style={{
                      backgroundColor: c === 'transparent' ? 'white' : c,
                      backgroundImage:
                        c === 'transparent'
                          ? 'linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%), linear-gradient(45deg, #ccc 25%, transparent 25%, transparent 75%, #ccc 75%)'
                          : undefined,
                      backgroundSize: c === 'transparent' ? '6px 6px' : undefined,
                      backgroundPosition: c === 'transparent' ? '0 0, 3px 3px' : undefined,
                    }}
                    title={c === 'transparent' ? '无' : c}
                  />
                ))}
              </div>
              <div className="mt-2 flex items-center gap-2 border-t border-gray-100 pt-2">
                <span className="text-[11px] text-gray-500">自定义：</span>
                <input
                  type="color"
                  onChange={(e) => {
                    exec('hiliteColor', e.target.value);
                    exec('backColor', e.target.value);
                  }}
                  className="h-6 w-10 cursor-pointer rounded border border-gray-200"
                  onMouseDown={(e) => e.stopPropagation()}
                />
              </div>
            </div>
          )}
        </div>

        <Divider />

        <ToolbarBtn title="加粗 (Ctrl+B)" onClick={() => exec('bold')}>
          <span className="font-bold">B</span>
        </ToolbarBtn>
        <ToolbarBtn title="斜体 (Ctrl+I)" onClick={() => exec('italic')}>
          <span className="italic">I</span>
        </ToolbarBtn>
        <ToolbarBtn title="下划线 (Ctrl+U)" onClick={() => exec('underline')}>
          <span className="underline">U</span>
        </ToolbarBtn>
        <ToolbarBtn title="删除线" onClick={() => exec('strikeThrough')}>
          <span className="line-through">S</span>
        </ToolbarBtn>

        <Divider />

        {/* 对齐 */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleDropdown('align')}
            className="inline-flex h-8 items-center gap-0.5 rounded px-1.5 hover:bg-gray-100"
            title="对齐"
          >
            <HiBars3BottomLeft className="h-4 w-4 text-gray-600" />
            <HiChevronDown className="h-3 w-3 text-gray-500" />
          </button>
          {openDropdown === 'align' && (
            <div className="absolute left-0 top-full z-20 mt-1 w-28 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
              {[
                { cmd: 'justifyLeft', label: '左对齐' },
                { cmd: 'justifyCenter', label: '居中' },
                { cmd: 'justifyRight', label: '右对齐' },
                { cmd: 'justifyFull', label: '两端对齐' },
              ].map((a) => (
                <button
                  key={a.cmd}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    exec(a.cmd);
                    setOpenDropdown(null);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 列表 */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleDropdown('list')}
            className="inline-flex h-8 items-center gap-0.5 rounded px-1.5 hover:bg-gray-100"
            title="列表"
          >
            <HiListBullet className="h-4 w-4 text-gray-600" />
            <HiChevronDown className="h-3 w-3 text-gray-500" />
          </button>
          {openDropdown === 'list' && (
            <div className="absolute left-0 top-full z-20 mt-1 w-28 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  exec('insertUnorderedList');
                  setOpenDropdown(null);
                }}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
              >
                • 无序列表
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  exec('insertOrderedList');
                  setOpenDropdown(null);
                }}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
              >
                1. 有序列表
              </button>
            </div>
          )}
        </div>

        {/* 缩进 */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleDropdown('indent')}
            className="inline-flex h-8 items-center gap-0.5 rounded px-1.5 hover:bg-gray-100"
            title="缩进"
          >
            <HiArrowLongRight className="h-4 w-4 text-gray-600" />
            <HiChevronDown className="h-3 w-3 text-gray-500" />
          </button>
          {openDropdown === 'indent' && (
            <div className="absolute left-0 top-full z-20 mt-1 w-28 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  exec('indent');
                  setOpenDropdown(null);
                }}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
              >
                增加缩进
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  exec('outdent');
                  setOpenDropdown(null);
                }}
                className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
              >
                减少缩进
              </button>
            </div>
          )}
        </div>

        {/* 行高 */}
        <div className="relative">
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => toggleDropdown('lineHeight')}
            className="inline-flex h-8 items-center gap-0.5 rounded px-1.5 text-xs text-gray-600 hover:bg-gray-100"
            title="行间距"
          >
            <span>行距</span>
            <HiChevronDown className="h-3 w-3" />
          </button>
          {openDropdown === 'lineHeight' && (
            <div className="absolute left-0 top-full z-20 mt-1 w-20 rounded-md border border-gray-200 bg-white py-1 shadow-lg">
              {LINE_HEIGHTS.map((lh) => (
                <button
                  key={lh}
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    applyLineHeight(lh);
                    setOpenDropdown(null);
                  }}
                  className="block w-full px-3 py-1.5 text-left text-sm hover:bg-gray-100"
                >
                  {lh}
                </button>
              ))}
            </div>
          )}
        </div>

        <Divider />

        <ToolbarBtn title="撤销 (Ctrl+Z)" onClick={() => exec('undo')}>
          <HiArrowUturnLeft className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn title="重做 (Ctrl+Y)" onClick={() => exec('redo')}>
          <HiArrowUturnRight className="h-4 w-4" />
        </ToolbarBtn>

        <Divider />

        <ToolbarBtn title="插入链接" onClick={handleInsertLink}>
          <HiOutlineLink className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn title="插入图片" onClick={handleInsertImage}>
          <HiOutlinePhoto className="h-4 w-4" />
        </ToolbarBtn>
        <ToolbarBtn title="清除格式" onClick={handleClearFormat}>
          <HiOutlineTrash className="h-4 w-4" />
        </ToolbarBtn>
      </div>

      {uploadingImages && <div role="status" className="border-b px-3 py-2 text-xs text-blue-600">图片上传中，请稍候…</div>}
      {selectedImage && (
        <div className="flex flex-wrap items-center gap-2 border-b bg-blue-50 px-3 py-2 text-xs text-gray-700">
          <label>图片宽度
            <input aria-label="图片宽度" type="number" min={20} max={1600} value={imageWidth}
              onChange={(e) => resizeImage(e.target.valueAsNumber)} className="ml-2 w-20 rounded border px-2 py-1" />
            <span className="ml-1">px</span>
          </label>
          <input aria-label="等比例缩放图片" type="range" min={20} max={1600} value={imageWidth}
            onChange={(e) => resizeImage(e.target.valueAsNumber)} />
          <span>等比例缩放</span>
          <button type="button" onClick={() => resizeImage(selectedImage.naturalWidth || 320)} className="rounded border px-2 py-1">原始尺寸</button>
          <button type="button" onClick={() => setSelectedImage(null)} className="ml-auto rounded px-2 py-1">完成</button>
        </div>
      )}

      {/* ============== 编辑区 ==============
          字号 / 行距 / 段落间距 / 内边距都按"收件人邮箱客户端默认渲染"
          对齐：Gmail、Outlook、Apple Mail 对 <p> 都是 margin: 1em 0，
          正文字号约 14~15px、行高约 1.6、四周留白 20~24px。
          之前 text-sm + leading-relaxed + p{margin:0.25em} 是"编辑里挤、
          发出去松"的主要原因，现在直接用真实渲染的节奏。 */}
      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-label={placeholder || '邮件正文'}
        aria-multiline="true"
        onInput={emitChange}
        onClick={(e) => {
          const img = e.target instanceof HTMLImageElement ? e.target : null;
          setSelectedImage(img);
          if (img) setImageWidth(Math.round(img.getBoundingClientRect().width) || img.width || 320);
        }}
        onPaste={(e) => {
          const files = Array.from(e.clipboardData.files);
          if (!files.length) return;
          e.preventDefault();
          saveSelection();
          void uploadImages(files);
        }}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) e.preventDefault();
        }}
        onDrop={(e) => {
          const files = Array.from(e.dataTransfer.files);
          if (!files.length) return;
          e.preventDefault();
          // 拖到哪就插到哪；不支持坐标选区的浏览器回退到当前光标。
          const range = document.caretRangeFromPoint?.(e.clientX, e.clientY);
          if (range && editorRef.current?.contains(range.commonAncestorContainer)) {
            lastSelectionRef.current = range;
          } else {
            saveSelection();
          }
          void uploadImages(files);
        }}
        onKeyUp={saveSelection}
        onMouseUp={saveSelection}
        onBlur={saveSelection}
        data-placeholder={placeholder}
        className={`rich-text-content flex-1 overflow-auto px-5 py-4 text-[15px] text-gray-900 outline-none ${
          flex ? 'min-h-0' : ''
        }`}
        style={{
          minHeight: flex ? undefined : typeof minHeight === 'number' ? `${minHeight}px` : minHeight,
          fontFamily: '"Microsoft YaHei", "微软雅黑", Arial, sans-serif',
          lineHeight: 1.6,
        }}
      />

      <style jsx global>{`
        .rich-text-content:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
        .rich-text-content {
          word-break: break-word;
        }
        /* 段落：匹配收件端默认 <p> 外边距，编辑所见=收件所得 */
        .rich-text-content p {
          margin: 0 0 1em 0;
        }
        .rich-text-content p:last-child { margin-bottom: 0; }
        /* Shift+Enter 产生的 <div> 只占一行，不再额外加外边距 */
        .rich-text-content div { margin: 0; }
        .rich-text-content ul,
        .rich-text-content ol {
          padding-left: 1.8em;
          margin: 0 0 1em 0;
        }
        .rich-text-content ul { list-style: disc; }
        .rich-text-content ol { list-style: decimal; }
        .rich-text-content li { margin: 0.25em 0; }
        .rich-text-content blockquote {
          border-left: 3px solid #cbd5e1;
          padding-left: 12px;
          color: #475569;
          margin: 0 0 1em 0;
        }
        .rich-text-content a { color: #2563eb; text-decoration: underline; }
        .rich-text-content img { max-width: 100%; height: auto; }
        .rich-text-content h1,
        .rich-text-content h2,
        .rich-text-content h3,
        .rich-text-content h4 { margin: 1em 0 0.5em; font-weight: 600; }
      `}</style>
    </div>
  );
});

/** 导出一些常用的工具栏预设按钮，方便父组件放到 extraToolbar 里。 */
export const ToolbarIcons = {
  Attach: HiOutlinePaperClip,
  Insert: HiOutlinePlus,
  Template: HiOutlineDocumentText,
  AI: HiOutlineSparkles,
  Signature: HiOutlinePencilSquare,
};

export default RichTextEditor;
