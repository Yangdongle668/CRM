'use client';

import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '@/lib/api';

const endpoint = '/settings/email-ai';
const presets = {
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
};

type Config = { baseUrl: string; model: string; autoAnalyze: boolean; hasKey: boolean };

export default function EmailAiSettings() {
  const [config, setConfig] = useState<Config>();
  const [key, setKey] = useState('');
  const [clearKey, setClearKey] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let active = true;
    api.get<unknown, { data: Config }>(endpoint).then(({ data: value }) => {
      if (active) setConfig(value);
    }).catch(() => {});
    return () => { active = false; };
  }, []);

  if (!config) return null;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const { data: value } = await api.put<unknown, { data: Config }>(endpoint, {
        ...config, apiKey: key || undefined, clearKey,
      });
      setConfig(value);
      setKey('');
      setClearKey(false);
      toast.success('邮件 AI 设置已保存');
    } catch {
      // The shared API interceptor displays the error.
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4 rounded-lg border border-gray-200 bg-white p-6 text-sm">
      <h3 className="text-base font-semibold">邮件 AI</h3>
      <p className="text-gray-600">符合条件的客户邮件正文会提交给这里配置的服务进行分析。</p>
      <fieldset disabled={saving} className="space-y-3">
        <div className="flex flex-wrap gap-2">
          {Object.entries(presets).map(([name, preset]) => (
            <button type="button" key={name} className="rounded border px-3 py-1 capitalize"
              onClick={() => { setConfig({ ...config, ...preset }); setKey(''); }}>
              {name === 'deepseek' ? 'DeepSeek' : 'OpenAI'}
            </button>
          ))}
        </div>
        <label className="block">
          API 基础地址（支持 OpenAI Chat Completions 兼容接口）
          <input required type="url" className="mt-1 block w-full rounded border p-2"
            value={config.baseUrl} onChange={(event) => setConfig({ ...config, baseUrl: event.target.value })} />
        </label>
        <label className="block">
          模型名称
          <input required className="mt-1 block w-full rounded border p-2"
            value={config.model} onChange={(event) => setConfig({ ...config, model: event.target.value })} />
        </label>
        <label className="block">
          API Key
          <input type="password" autoComplete="new-password" disabled={clearKey}
            className="mt-1 block w-full rounded border p-2"
            placeholder={config.hasKey ? '已配置，留空保留' : '输入 API Key'}
            value={key} onChange={(event) => setKey(event.target.value)} />
        </label>
        {config.hasKey && (
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={clearKey}
              onChange={(event) => {
                setClearKey(event.target.checked);
                if (event.target.checked) setConfig({ ...config, autoAnalyze: false });
              }} />
            清除已保存的 API Key
          </label>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={config.autoAnalyze} disabled={clearKey}
            onChange={(event) => setConfig({ ...config, autoAnalyze: event.target.checked })} />
          自动分析新收到和成功发出的客户邮件
        </label>
        <button type="submit" className="rounded bg-blue-600 px-3 py-2 text-white">
          {saving ? '保存中…' : '保存邮件 AI 设置'}
        </button>
      </fieldset>
    </form>
  );
}
