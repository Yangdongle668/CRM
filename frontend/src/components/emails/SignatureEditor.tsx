'use client';

import React, { useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { emailsApi } from '@/lib/api';
import RichTextEditor, { RichTextEditorHandle } from './RichTextEditor';

interface SignatureAccount {
  id: string;
  emailAddr: string;
  fromName: string | null;
  signature: string | null;
}

/**
 * 每个邮箱账户单独的签名编辑器。
 *
 * 改造前是一个原始 HTML textarea（用户必须手敲 <p>、<a> 标签），
 * 现在换成所见即所得的 RichTextEditor —— 界面上"看到什么、发出去就是什么"。
 *
 * 签名在数据库里仍然存 HTML，服务器端外发时把它拼到正文后面
 * （EmailsService.deliverPendingEmail），所以这里输出的 html 跟旧的一致。
 */
export default function SignatureEditor({
  account,
  onSaved,
}: {
  account: { id: string; emailAddr: string };
  onSaved?: (signature: string | null) => void;
}) {
  const [data, setData] = useState<SignatureAccount | null>(null);
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);
  const editorRef = useRef<RichTextEditorHandle | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res: any = await emailsApi.getSignature(account.id);
      const cfg: SignatureAccount = res.data?.config;
      setData(cfg);
      const sig = cfg?.signature || '';
      setValue(sig);
      // 编辑器内容是通过 ref 覆盖设置的，避免 value prop 与 contenteditable
      // 的 re-render 冲突。
      editorRef.current?.setHtml(sig);
    } catch {
      /* toast by interceptor */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (account?.id) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account?.id]);

  const save = async () => {
    setSaving(true);
    try {
      const res: any = await emailsApi.updateSignature(account.id, value);
      toast.success('签名已保存');
      const cfg: SignatureAccount = res.data?.config;
      setData(cfg);
      onSaved?.(cfg?.signature || null);
    } catch {
      /* toast */
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    const orig = data?.signature || '';
    setValue(orig);
    editorRef.current?.setHtml(orig);
  };

  const dirty = (data?.signature || '') !== value;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">邮件签名</h3>
          <p className="mt-0.5 text-xs text-gray-500">
            为邮箱 <span className="font-mono text-gray-700">{account.emailAddr}</span> 单独配置。
            每封外发邮件会在正文后自动附上此签名。可视化编辑，所见即所得。
          </p>
        </div>
        {loading && <div className="text-xs text-gray-400">加载中...</div>}
      </div>

      <RichTextEditor
        ref={editorRef}
        value={value}
        onChange={setValue}
        placeholder="在这里设计你的签名，例如姓名、职位、联系方式、公司 Logo 等"
        minHeight={260}
      />

      <div className="text-[11px] text-gray-400">
        提示：签名里的链接会被自动转换为追踪链接，可以统计客户点击情况。
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={reset}
          disabled={!dirty || saving}
          className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-50 disabled:opacity-40"
        >
          撤销
        </button>
        <button
          onClick={save}
          disabled={!dirty || saving}
          className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-40"
        >
          {saving ? '保存中...' : '保存签名'}
        </button>
      </div>
    </div>
  );
}
