'use client';

import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { HiOutlineXMark } from 'react-icons/hi2';

interface ModalProps {
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | '5xl';
  // 默认 true：点遮罩 / 按 ESC 可关闭。
  // 编辑类表单传 false，避免误点空白或误按 ESC 丢失正在编辑的内容。
  dismissible?: boolean;
}

const maxWidthClasses: Record<string, string> = {
  sm: 'max-w-sm',
  md: 'max-w-md',
  lg: 'max-w-lg',
  xl: 'max-w-xl',
  '2xl': 'max-w-2xl',
  '3xl': 'max-w-3xl',
  '4xl': 'max-w-4xl',
  '5xl': 'max-w-5xl',
};

export function Modal({ open, isOpen, onClose, title, children, maxWidth, size, dismissible = true }: ModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const visible = open ?? isOpen ?? false;
  const width = maxWidth ?? size ?? 'lg';

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    if (visible) {
      // 仅在可关闭的弹窗上监听 ESC，避免编辑表单被误关。
      if (dismissible) {
        document.addEventListener('keydown', handleEsc);
      }
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEsc);
      document.body.style.overflow = '';
    };
  }, [visible, dismissible, onClose]);

  if (!visible || !mounted) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (!dismissible) return;
    if (e.target === overlayRef.current) onClose();
  };

  // 用 Portal 挂到 body：彻底避开页面内 fixed 层造成的 stacking context 遮挡。
  // z-[120] 高于顶栏 z-[100] 与邮件详情 slide-in z-[110]。
  return createPortal(
    <div
      ref={overlayRef}
      onClick={handleOverlayClick}
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/30 backdrop-blur-sm p-2 sm:p-4 animate-fade-in"
    >
      <div
        className={`w-full ${maxWidthClasses[width]} rounded-xl sm:rounded-2xl bg-white/95 backdrop-blur-xl shadow-apple-xl animate-scale-in`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-100 px-4 sm:px-6 py-3 sm:py-4">
          <h2 className="text-[15px] sm:text-[17px] font-semibold tracking-tight text-gray-900 truncate pr-2">
            {title}
          </h2>
          <button
            onClick={onClose}
            aria-label="关闭"
            className="flex-shrink-0 rounded-full p-1.5 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
          >
            <HiOutlineXMark className="h-5 w-5" />
          </button>
        </div>

        {/* Content —— 移动端给更多可用高度（头部更矮，边距更小） */}
        <div className="max-h-[calc(100vh-6rem)] sm:max-h-[80vh] overflow-y-auto px-4 sm:px-6 py-4 sm:py-5">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default Modal;
