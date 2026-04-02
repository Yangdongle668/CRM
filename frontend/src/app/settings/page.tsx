'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import AppLayout from '@/components/layout/AppLayout';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/contexts/auth-context';
import { usersApi, settingsApi, authApi, backupApi } from '@/lib/api';
import { ROLE_MAP } from '@/lib/constants';
import type { User, Role, EmailConfig } from '@/types';

type TabKey = 'users' | 'email' | 'system' | 'backup';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'users', label: '用户管理' },
  { key: 'email', label: '邮件配置' },
  { key: 'system', label: '系统参数' },
  { key: 'backup', label: '数据备份' },
];

const defaultUserForm = {
  name: '',
  email: '',
  password: '',
  role: 'SALESPERSON' as Role,
  phone: '',
};

const defaultEmailConfig: EmailConfig = {
  smtpHost: '',
  smtpPort: 465,
  smtpUser: '',
  smtpPass: '',
  smtpSecure: true,
  imapHost: '',
  imapPort: 993,
  imapUser: '',
  imapPass: '',
  imapSecure: true,
  fromName: '',
  signature: '',
};

export default function SettingsPage() {
  const { user: currentUser, isAdmin, loading: authLoading } = useAuth();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabKey>('users');

  // ==================== Users tab ====================
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState(defaultUserForm);
  const [userSubmitting, setUserSubmitting] = useState(false);

  // ==================== Email tab ====================
  const [emailConfig, setEmailConfig] = useState<EmailConfig>(defaultEmailConfig);
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSaving, setEmailSaving] = useState(false);
  const [emailTesting, setEmailTesting] = useState(false);

  // ==================== System tab ====================
  const [systemSettings, setSystemSettings] = useState<Record<string, string>>({});
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemSaving, setSystemSaving] = useState(false);
  const [newSettingKey, setNewSettingKey] = useState('');
  const [newSettingValue, setNewSettingValue] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);
  const [bankInfo, setBankInfo] = useState<any>({});
  const [bankInfoLoading, setBankInfoLoading] = useState(false);
  const [bankInfoSaving, setBankInfoSaving] = useState(false);

  // ==================== Backup tab ====================
  const [backupExporting, setBackupExporting] = useState(false);
  const [backupImporting, setBackupImporting] = useState(false);

  const handleExportBackup = async () => {
    setBackupExporting(true);
    try {
      const res: any = await backupApi.export();
      // The interceptor returns response.data, which is a Blob
      const blob = res instanceof Blob ? res : new Blob([JSON.stringify(res, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `crm-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('备份文件已导出');
    } catch {
      toast.error('导出失败，请重试');
    } finally {
      setBackupExporting(false);
    }
  };

  const handleImportBackup = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;

      if (!confirm('导入备份将覆盖所有现有数据，确定要继续吗？')) return;

      setBackupImporting(true);
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (!data.version || !data.data) {
          toast.error('无效的备份文件格式');
          setBackupImporting(false);
          return;
        }
        await backupApi.import(data);
        toast.success('备份数据已成功导入，页面将刷新');
        setTimeout(() => window.location.reload(), 1500);
      } catch (err: any) {
        toast.error(err?.response?.data?.message || '导入失败，请检查文件格式');
      } finally {
        setBackupImporting(false);
      }
    };
    input.click();
  };

  // Admin check
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      toast.error('仅管理员可访问系统设置');
      router.push('/dashboard');
    }
  }, [authLoading, isAdmin, router]);

  // ==================== Users API ====================
  const fetchUsers = useCallback(async () => {
    setUsersLoading(true);
    try {
      const res: any = await usersApi.list({ pageSize: 999 });
      setUsers(res.data?.items || res.data || []);
    } catch {
      // error handled by interceptor
    } finally {
      setUsersLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin && activeTab === 'users') fetchUsers();
  }, [isAdmin, activeTab, fetchUsers]);

  const openCreateUser = () => {
    setEditingUser(null);
    setUserForm(defaultUserForm);
    setUserModalOpen(true);
  };

  const openEditUser = (u: User) => {
    setEditingUser(u);
    setUserForm({
      name: u.name,
      email: u.email,
      password: '',
      role: u.role,
      phone: u.phone || '',
    });
    setUserModalOpen(true);
  };

  const handleUserSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userForm.name.trim() || !userForm.email.trim()) {
      toast.error('请填写姓名和邮箱');
      return;
    }
    if (!editingUser && !userForm.password) {
      toast.error('请输入密码');
      return;
    }

    setUserSubmitting(true);
    try {
      if (editingUser) {
        const payload: Record<string, any> = {
          name: userForm.name,
          email: userForm.email,
          role: userForm.role,
          phone: userForm.phone || undefined,
        };
        if (userForm.password) payload.password = userForm.password;
        await usersApi.update(editingUser.id, payload);
        toast.success('用户已更新');
      } else {
        await authApi.register({
          name: userForm.name,
          email: userForm.email,
          password: userForm.password,
          role: userForm.role,
          phone: userForm.phone || undefined,
        });
        toast.success('用户已创建');
      }
      setUserModalOpen(false);
      fetchUsers();
    } catch {
      // error handled by interceptor
    } finally {
      setUserSubmitting(false);
    }
  };

  const handleDeleteUser = async (id: string) => {
    if (id === currentUser?.id) {
      toast.error('不能删除自己的账户');
      return;
    }
    if (!confirm('确定要删除该用户吗？')) return;
    try {
      await usersApi.delete(id);
      toast.success('用户已删除');
      fetchUsers();
    } catch {
      // error handled by interceptor
    }
  };

  // ==================== Email Config API ====================
  const fetchEmailConfig = useCallback(async () => {
    setEmailLoading(true);
    try {
      const res: any = await settingsApi.getEmailConfig();
      if (res.data) {
        setEmailConfig({ ...defaultEmailConfig, ...res.data });
      }
    } catch {
      // error handled by interceptor
    } finally {
      setEmailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin && activeTab === 'email') fetchEmailConfig();
  }, [isAdmin, activeTab, fetchEmailConfig]);

  const handleEmailSave = async () => {
    setEmailSaving(true);
    try {
      // Auto-sync: IMAP credentials = SMTP credentials
      const configToSave = {
        ...emailConfig,
        imapUser: emailConfig.smtpUser,
        imapPass: emailConfig.smtpPass,
      };
      await settingsApi.updateEmailConfig(configToSave);
      toast.success('邮件配置已保存');
    } catch {
      // error handled by interceptor
    } finally {
      setEmailSaving(false);
    }
  };

  const handleEmailTest = async () => {
    setEmailTesting(true);
    try {
      const configToTest = {
        ...emailConfig,
        imapUser: emailConfig.smtpUser,
        imapPass: emailConfig.smtpPass,
      };
      await settingsApi.testEmailConfig(configToTest);
      toast.success('连接测试成功');
    } catch {
      // error handled by interceptor
    } finally {
      setEmailTesting(false);
    }
  };

  // ==================== System Settings API ====================
  const fetchSystemSettings = useCallback(async () => {
    setSystemLoading(true);
    try {
      const res: any = await settingsApi.getAll();
      const data = res.data;
      if (data && typeof data === 'object') {
        if (Array.isArray(data)) {
          const map: Record<string, string> = {};
          data.forEach((item: any) => {
            map[item.key] = item.value;
          });
          setSystemSettings(map);
        } else {
          setSystemSettings(data);
        }
      }
    } catch {
      // error handled by interceptor
    } finally {
      setSystemLoading(false);
    }
  }, []);

  const fetchLogo = useCallback(async () => {
    try {
      const res: any = await settingsApi.getLogo();
      setLogoUrl(res.data?.logoUrl || null);
    } catch {
      // ignore
    }
  }, []);

  const fetchBankInfo = useCallback(async () => {
    setBankInfoLoading(true);
    try {
      const res: any = await settingsApi.getBankInfo();
      setBankInfo(res.data || {});
    } catch {
      // ignore
    } finally {
      setBankInfoLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isAdmin && activeTab === 'system') {
      fetchSystemSettings();
      fetchLogo();
      fetchBankInfo();
    }
  }, [isAdmin, activeTab, fetchSystemSettings, fetchLogo, fetchBankInfo]);

  const handleLogoUpload = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setLogoUploading(true);
      try {
        const formData = new FormData();
        formData.append('logo', file);
        const res: any = await settingsApi.uploadLogo(formData);
        setLogoUrl(res.data?.logoUrl || null);
        toast.success('Logo上传成功');
      } catch {
        toast.error('Logo上传失败');
      } finally {
        setLogoUploading(false);
      }
    };
    input.click();
  };

  const handleSystemSave = async () => {
    setSystemSaving(true);
    try {
      await settingsApi.update(systemSettings);
      toast.success('系统参数已保存');
    } catch {
      // error handled by interceptor
    } finally {
      setSystemSaving(false);
    }
  };

  const handleBankInfoSave = async () => {
    setBankInfoSaving(true);
    try {
      await settingsApi.updateBankInfo(bankInfo);
      toast.success('银行信息已保存');
    } catch {
      toast.error('保存失败');
    } finally {
      setBankInfoSaving(false);
    }
  };

  const handleAddSetting = () => {
    if (!newSettingKey.trim()) {
      toast.error('请输入参数名');
      return;
    }
    setSystemSettings((prev) => ({ ...prev, [newSettingKey]: newSettingValue }));
    setNewSettingKey('');
    setNewSettingValue('');
  };

  const handleRemoveSetting = (key: string) => {
    setSystemSettings((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('zh-CN');
  };

  if (authLoading || !isAdmin) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <h1 className="text-2xl font-bold text-gray-900">系统设置</h1>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-6">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`border-b-2 pb-3 text-sm font-medium transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* ==================== Users Tab ==================== */}
        {activeTab === 'users' && (
          <div className="space-y-4">
            <div className="flex justify-end">
              <button
                onClick={openCreateUser}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
              >
                新建用户
              </button>
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">姓名</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">邮箱</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">角色</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">状态</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">创建时间</th>
                    <th className="px-4 py-3 text-left text-xs font-medium uppercase text-gray-500">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {usersLoading ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        加载中...
                      </td>
                    </tr>
                  ) : users.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                        暂无用户数据
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => (
                      <tr key={u.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{u.name}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{u.email}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {ROLE_MAP[u.role] || u.role}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                              u.isActive
                                ? 'bg-green-100 text-green-800'
                                : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {u.isActive ? '启用' : '禁用'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{formatDate(u.createdAt)}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => openEditUser(u)}
                              className="text-sm text-blue-600 hover:text-blue-800"
                            >
                              编辑
                            </button>
                            <button
                              onClick={() => handleDeleteUser(u.id)}
                              className="text-sm text-red-600 hover:text-red-800"
                            >
                              删除
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== Email Config Tab ==================== */}
        {activeTab === 'email' && (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            {emailLoading ? (
              <div className="flex h-32 items-center justify-center text-gray-500">加载中...</div>
            ) : (
              <div className="space-y-6">
                {/* Account credentials - unified */}
                <div>
                  <h3 className="mb-4 text-base font-semibold text-gray-900">邮箱账户</h3>
                  <p className="text-xs text-gray-500 mb-3">
                    邮箱账号和密码（授权码）将同时用于 SMTP 发件和 IMAP 收件
                  </p>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">邮箱账号</label>
                      <input
                        type="text"
                        value={emailConfig.smtpUser}
                        onChange={(e) => setEmailConfig({ ...emailConfig, smtpUser: e.target.value, imapUser: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="user@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">邮箱密码 / 授权码</label>
                      <input
                        type="password"
                        value={emailConfig.smtpPass}
                        onChange={(e) => setEmailConfig({ ...emailConfig, smtpPass: e.target.value, imapPass: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="密码或授权码"
                      />
                    </div>
                  </div>
                </div>

                {/* Server configuration */}
                <div>
                  <h3 className="mb-4 text-base font-semibold text-gray-900">服务器配置</h3>
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">SMTP 服务器</label>
                      <input
                        type="text"
                        value={emailConfig.smtpHost}
                        onChange={(e) => setEmailConfig({ ...emailConfig, smtpHost: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="smtp.example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">SMTP 端口</label>
                      <input
                        type="number"
                        value={emailConfig.smtpPort}
                        onChange={(e) => setEmailConfig({ ...emailConfig, smtpPort: Number(e.target.value) })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex items-end pb-2">
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={emailConfig.smtpSecure}
                          onChange={(e) => setEmailConfig({ ...emailConfig, smtpSecure: e.target.checked })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        SSL/TLS 加密
                      </label>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">IMAP 服务器</label>
                      <input
                        type="text"
                        value={emailConfig.imapHost}
                        onChange={(e) => setEmailConfig({ ...emailConfig, imapHost: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="imap.example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">IMAP 端口</label>
                      <input
                        type="number"
                        value={emailConfig.imapPort}
                        onChange={(e) => setEmailConfig({ ...emailConfig, imapPort: Number(e.target.value) })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex items-end pb-2">
                      <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={emailConfig.imapSecure}
                          onChange={(e) => setEmailConfig({ ...emailConfig, imapSecure: e.target.checked })}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        SSL/TLS 加密
                      </label>
                    </div>
                  </div>
                </div>

                {/* Other email settings */}
                <div>
                  <h3 className="mb-4 text-base font-semibold text-gray-900">其他设置</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">发件人名称</label>
                      <input
                        type="text"
                        value={emailConfig.fromName || ''}
                        onChange={(e) => setEmailConfig({ ...emailConfig, fromName: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="公司名称"
                      />
                    </div>
                  </div>
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-700 mb-1">邮件签名</label>
                    <textarea
                      value={emailConfig.signature || ''}
                      onChange={(e) => setEmailConfig({ ...emailConfig, signature: e.target.value })}
                      rows={4}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      placeholder="请输入邮件签名内容"
                    />
                  </div>
                </div>

                {/* Buttons */}
                <div className="flex items-center gap-3 border-t pt-4">
                  <button
                    onClick={handleEmailTest}
                    disabled={emailTesting}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {emailTesting ? '测试中...' : '测试连接'}
                  </button>
                  <button
                    onClick={handleEmailSave}
                    disabled={emailSaving}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {emailSaving ? '保存中...' : '保存配置'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ==================== System Settings Tab ==================== */}
        {activeTab === 'system' && (
          <div className="space-y-6">
            {/* Logo Upload Section */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">公司Logo</h3>
              <div className="flex items-center gap-6">
                <div className="flex h-20 w-20 items-center justify-center rounded-xl border-2 border-dashed border-gray-300 bg-gray-50 overflow-hidden">
                  {logoUrl ? (
                    <img src={logoUrl} alt="公司Logo" className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-sm text-gray-400">无Logo</span>
                  )}
                </div>
                <div>
                  <button
                    onClick={handleLogoUpload}
                    disabled={logoUploading}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
                  >
                    {logoUploading ? '上传中...' : '上传Logo'}
                  </button>
                  <p className="mt-2 text-xs text-gray-500">支持 JPG、PNG 格式，最大 5MB</p>
                </div>
              </div>
            </div>

            {/* Bank Info Section */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">银行信息</h3>
              {bankInfoLoading ? (
                <div className="flex h-32 items-center justify-center text-gray-500">加载中...</div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">账户号</label>
                      <input
                        type="text"
                        value={bankInfo.accountNumber || ''}
                        onChange={(e) => setBankInfo({ ...bankInfo, accountNumber: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">账户名</label>
                      <input
                        type="text"
                        value={bankInfo.holderName || ''}
                        onChange={(e) => setBankInfo({ ...bankInfo, holderName: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">银行名称</label>
                      <input
                        type="text"
                        value={bankInfo.bankName || ''}
                        onChange={(e) => setBankInfo({ ...bankInfo, bankName: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">支持币种</label>
                      <input
                        type="text"
                        value={bankInfo.currency || ''}
                        onChange={(e) => setBankInfo({ ...bankInfo, currency: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="USD, CNY 等"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">账户类型</label>
                      <input
                        type="text"
                        value={bankInfo.accountType || ''}
                        onChange={(e) => setBankInfo({ ...bankInfo, accountType: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="Checking, Savings 等"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">国家/地区</label>
                      <input
                        type="text"
                        value={bankInfo.country || ''}
                        onChange={(e) => setBankInfo({ ...bankInfo, country: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">银行地址</label>
                      <textarea
                        value={bankInfo.bankAddress || ''}
                        onChange={(e) => setBankInfo({ ...bankInfo, bankAddress: e.target.value })}
                        rows={2}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Swift / BIC</label>
                      <input
                        type="text"
                        value={bankInfo.swiftBic || ''}
                        onChange={(e) => setBankInfo({ ...bankInfo, swiftBic: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Routing Number</label>
                      <input
                        type="text"
                        value={bankInfo.routingNumber || ''}
                        onChange={(e) => setBankInfo({ ...bankInfo, routingNumber: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">付款备忘/说明</label>
                      <textarea
                        value={bankInfo.paymentMemo || ''}
                        onChange={(e) => setBankInfo({ ...bankInfo, paymentMemo: e.target.value })}
                        rows={3}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="付款时请注明收款人、发票号等信息"
                      />
                    </div>
                  </div>
                  <div className="border-t pt-4">
                    <button
                      onClick={handleBankInfoSave}
                      disabled={bankInfoSaving}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {bankInfoSaving ? '保存中...' : '保存银行信息'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* System Parameters Section */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
            {systemLoading ? (
              <div className="flex h-32 items-center justify-center text-gray-500">加载中...</div>
            ) : (
              <div className="space-y-4">
                {/* Existing settings */}
                {Object.entries(systemSettings).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-3">
                    <div className="w-48 flex-shrink-0">
                      <input
                        type="text"
                        value={key}
                        disabled
                        className="w-full rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-600"
                      />
                    </div>
                    <div className="flex-1">
                      <input
                        type="text"
                        value={value}
                        onChange={(e) =>
                          setSystemSettings((prev) => ({ ...prev, [key]: e.target.value }))
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      onClick={() => handleRemoveSetting(key)}
                      className="flex-shrink-0 text-sm text-red-600 hover:text-red-800"
                    >
                      删除
                    </button>
                  </div>
                ))}

                {/* Add new setting */}
                <div className="flex items-center gap-3 border-t pt-4">
                  <div className="w-48 flex-shrink-0">
                    <input
                      type="text"
                      value={newSettingKey}
                      onChange={(e) => setNewSettingKey(e.target.value)}
                      placeholder="参数名"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <div className="flex-1">
                    <input
                      type="text"
                      value={newSettingValue}
                      onChange={(e) => setNewSettingValue(e.target.value)}
                      placeholder="参数值"
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onClick={handleAddSetting}
                    className="flex-shrink-0 rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    添加
                  </button>
                </div>

                {/* Save button */}
                <div className="border-t pt-4">
                  <button
                    onClick={handleSystemSave}
                    disabled={systemSaving}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {systemSaving ? '保存中...' : '保存参数'}
                  </button>
                </div>
              </div>
            )}
            </div>
          </div>
        )}
        {/* ==================== Backup Tab ==================== */}
        {activeTab === 'backup' && (
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="space-y-6">
              {/* Export */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-2">导出备份</h3>
                <p className="text-sm text-gray-500 mb-4">
                  将所有系统数据（客户、联系人、线索、邮件、报价、订单、任务、活动记录等）导出为 JSON 文件。
                </p>
                <button
                  onClick={handleExportBackup}
                  disabled={backupExporting}
                  className="rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
                >
                  {backupExporting ? '导出中...' : '导出备份文件'}
                </button>
              </div>

              <div className="border-t border-gray-200" />

              {/* Import */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-2">导入备份</h3>
                <p className="text-sm text-gray-500 mb-2">
                  从之前导出的 JSON 备份文件恢复数据。
                </p>
                <p className="text-sm text-red-500 mb-4">
                  注意：导入操作将覆盖所有现有数据，请谨慎操作！
                </p>
                <button
                  onClick={handleImportBackup}
                  disabled={backupImporting}
                  className="rounded-lg border border-red-300 bg-white px-5 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  {backupImporting ? '导入中...' : '选择备份文件导入'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* User Create/Edit Modal */}
      <Modal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        title={editingUser ? '编辑用户' : '新建用户'}
      >
        <form onSubmit={handleUserSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              姓名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={userForm.name}
              onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="请输入姓名"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              邮箱 <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={userForm.email}
              onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="请输入邮箱"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              密码 {!editingUser && <span className="text-red-500">*</span>}
            </label>
            <input
              type="password"
              value={userForm.password}
              onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder={editingUser ? '留空则不修改密码' : '请输入密码'}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">角色</label>
            <select
              value={userForm.role}
              onChange={(e) => setUserForm({ ...userForm, role: e.target.value as Role })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {Object.entries(ROLE_MAP).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">手机号</label>
            <input
              type="text"
              value={userForm.phone}
              onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              placeholder="请输入手机号"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setUserModalOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={userSubmitting}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {userSubmitting ? '提交中...' : editingUser ? '保存修改' : '创建用户'}
            </button>
          </div>
        </form>
      </Modal>
    </AppLayout>
  );
}
