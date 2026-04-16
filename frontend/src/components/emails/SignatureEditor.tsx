'use client';

import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { emailsApi } from '@/lib/api';

interface SignatureAccount {
  id: string;
  emailAddr: string;
  fromName: string | null;
  signature: string | null;
}

/**
 * Per-account signature editor.
 *
 * HTML is allowed (raw) — the textarea is monospace so users can see their
 * tags. We render a live preview on the right so they know what the
 * recipient will see. Signature is appended to outgoing emails server-side
 * by EmailsService.deliverPendingEmail (after the body, above tracking
 * pixel).
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

  const load = async () => {
    setLoading(true);
    try {
      const res: any = await emailsApi.getSignature(account.id);
      const cfg: SignatureAccount = res.data?.config;
      setData(cfg);
      setValue(cfg?.signature || '');
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

  const dirty = (data?.signature || '') !== value;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-gray-900">邮件签名</h3>
          <p className="text-xs text-gray-500 mt-0.5">
            为邮箱 <span className="font-mono text-gray-700">{account.emailAddr}</span> 单独配置。
            每封外发邮件会在正文后自动附上该签名。支持 HTML。
          </p>
        </div>
        {loading && <div className="text-xs text-gray-400">加载中...</div>}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        {/* Editor */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            HTML 源码
          </label>
          <textarea
            value={value}
            onChange={(e) => setValue(e.target.value)}
            rows={10}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            placeholder={`示例：\n<p><strong>张三</strong> · 外贸销售</p>\n<p>📧 sales@company.com · 📱 +86 138 0000 0000</p>\n<p><a href="https://company.com">company.com</a></p>`}
            spellCheck={false}
          />
          <div className="mt-1 text-[11px] text-gray-400">
            提示：签名内的链接也会被自动转换为追踪链接。
          </div>
        </div>

        {/* Preview */}
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            预览
          </label>
          <div className="min-h-[240px] rounded-lg border border-gray-200 bg-white p-3 text-sm overflow-auto">
            <div className="text-gray-400 text-xs mb-1">... 邮件正文 ...</div>
            <hr className="my-2" />
            {value ? (
              <div
                // Trusted: signature only comes from the authenticated account owner
                dangerouslySetInnerHTML={{ __html: value }}
              />
            ) : (
              <div className="text-gray-400 text-xs italic">（未设置签名）</div>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => setValue(data?.signature || '')}
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
