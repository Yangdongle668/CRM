'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import AppLayout from '@/components/layout/AppLayout';
import { Modal } from '@/components/ui/Modal';
import {
  getEmailLinkPreference,
  setEmailLinkPreference,
  type EmailLinkPreference,
} from '@/components/ui/EmailLink';
import BankAccountsPanel from '@/components/settings/BankAccountsPanel';
import PITemplatesPanel from '@/components/settings/PITemplatesPanel';
import { useAuth } from '@/contexts/auth-context';
import { useLogo } from '@/contexts/logo-context';
import { usersApi, settingsApi, authApi, backupApi } from '@/lib/api';
import { ROLE_MAP } from '@/lib/constants';
import type { User, Role } from '@/types';

type TabKey = 'profile' | 'users' | 'system' | 'backup';

const ADMIN_TABS: { key: TabKey; label: string }[] = [
  { key: 'profile', label: '个人资料' },
  { key: 'users', label: '用户管理' },
  { key: 'system', label: '系统参数' },
  { key: 'backup', label: '数据备份' },
];

const USER_TABS: { key: TabKey; label: string }[] = [
  { key: 'profile', label: '个人资料' },
];

const defaultUserForm = {
  name: '',
  email: '',
  password: '',
  role: 'SALESPERSON' as Role,
  phone: '',
};

export default function SettingsPage() {
  const { user: currentUser, isAdmin, refreshUser, loading: authLoading } = useAuth();
  const { refreshLogo } = useLogo();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<TabKey>('profile');

  // 邮箱链接跳转偏好：保存在 User.preferences（服务器），登录后同步到
  // localStorage 作为 EmailLink 的读取缓存。本组件初始值优先用服务器
  // 返回的，没有就 fallback 到本地 cache。
  const [emailPref, setEmailPref] = useState<EmailLinkPreference>('ask');
  const [emailPrefSaving, setEmailPrefSaving] = useState(false);
  useEffect(() => {
    const fromServer = (currentUser as any)?.preferences?.emailLinkPreference;
    if (fromServer === 'ask' || fromServer === 'external' || fromServer === 'internal') {
      setEmailPref(fromServer);
    } else {
      setEmailPref(getEmailLinkPreference());
    }
  }, [currentUser]);
  const updateEmailPref = async (v: EmailLinkPreference) => {
    const prev = emailPref;
    setEmailPref(v);
    setEmailPrefSaving(true);
    // 先落本地，UI 立即生效
    setEmailLinkPreference(v);
    try {
      await authApi.updateProfile({ preferences: { emailLinkPreference: v } } as any);
      await refreshUser();
      toast.success('偏好已保存');
    } catch {
      // 回滚
      setEmailPref(prev);
      setEmailLinkPreference(prev);
      toast.error('保存失败，请重试');
    } finally {
      setEmailPrefSaving(false);
    }
  };


  // ==================== Profile tab ====================
  const [profileForm, setProfileForm] = useState({ phone: '', bio: '', password: '', confirmPassword: '' });
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // ==================== Users tab ====================
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userForm, setUserForm] = useState(defaultUserForm);
  const [userSubmitting, setUserSubmitting] = useState(false);

  // ==================== Company Info ====================
  const [companyInfo, setCompanyInfo] = useState({
    companyName: '',
    companyAddress: '',
    companyPhone: '',
    companyEmail: '',
    companyWebsite: '',
  });
  const [companyInfoSaving, setCompanyInfoSaving] = useState(false);

  // ==================== System tab ====================
  const [systemSettings, setSystemSettings] = useState<Record<string, string>>({});
  const [systemLoading, setSystemLoading] = useState(false);
  const [systemSaving, setSystemSaving] = useState(false);
  const [newSettingKey, setNewSettingKey] = useState('');
  const [newSettingValue, setNewSettingValue] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoUploading, setLogoUploading] = useState(false);

  // ==================== Backup tab ====================
  const [backupExporting, setBackupExporting] = useState(false);
  const [backupImporting, setBackupImporting] = useState(false);
  const [backupImportResult, setBackupImportResult] = useState<any>(null);

  const handleExportBackup = async () => {
    setBackupExporting(true);
    try {
      const res: any = await backupApi.export();
      // axios interceptor returns response.data, which is a Blob for
      // responseType: 'blob'.
      const blob =
        res instanceof Blob
          ? res
          : new Blob([res], { type: 'application/zip' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `crm-backup-${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success('备份压缩包已导出');
    } catch {
      toast.error('导出失败，请重试');
    } finally {
      setBackupExporting(false);
    }
  };

  const handleImportBackup = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.zip,application/zip,application/x-zip-compressed';
    input.onchange = async (e: any) => {
      const file = e.target.files?.[0] as File | undefined;
      if (!file) return;

      if (
        !window.confirm(
          `确认要从备份文件「${file.name}」恢复数据吗？\n\n` +
            '⚠️ 此操作将覆盖现有的客户、联系人、线索、报价、订单、任务、跟进记录，\n' +
            '    并清除与之关联的邮件、形式发票、文档、备忘录、系统消息等数据。\n' +
            '    系统设置、角色权限、审计日志会保留。\n' +
            '    当前登录账号也会保留以免你被登出。\n\n' +
            '此操作不可撤销！',
        )
      ) {
        return;
      }

      setBackupImporting(true);
      setBackupImportResult(null);
      try {
        const res: any = await backupApi.import(file);
        setBackupImportResult(res.data || res);
        toast.success('数据已成功恢复');
      } catch (err: any) {
        const msg = err?.response?.data?.message || '恢复失败，请检查文件格式';
        toast.error(typeof msg === 'string' ? msg : msg[0] || '恢复失败');
      } finally {
        setBackupImporting(false);
      }
    };
    input.click();
  };

  // Redirect unauthenticated users only
  useEffect(() => {
    if (!authLoading && !currentUser) {
      router.push('/login');
    }
  }, [authLoading, currentUser, router]);

  // Sync profile form when user loads
  useEffect(() => {
    if (currentUser) {
      setProfileForm({ phone: currentUser.phone || '', bio: currentUser.bio || '', password: '', confirmPassword: '' });
    }
  }, [currentUser]);

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
    if (
      !confirm(
        '确定要删除该用户吗？\n\n该用户名下的客户、订单、线索、PI 等数据会自动转移到超级管理员名下，不会丢失。',
      )
    ) {
      return;
    }
    try {
      await usersApi.delete(id);
      toast.success('用户已删除');
      fetchUsers();
    } catch {
      // error handled by interceptor
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

  const fetchCompanyInfo = useCallback(async () => {
    try {
      const res: any = await settingsApi.getCompanyInfo();
      if (res.data) setCompanyInfo((prev) => ({ ...prev, ...res.data }));
    } catch {
      // ignore
    }
  }, []);

  const handleCompanyInfoSave = async () => {
    setCompanyInfoSaving(true);
    try {
      await settingsApi.updateCompanyInfo(companyInfo);
      toast.success('公司信息已保存');
    } catch {
      toast.error('保存失败');
    } finally {
      setCompanyInfoSaving(false);
    }
  };

  useEffect(() => {
    if (isAdmin && activeTab === 'system') {
      fetchSystemSettings();
      fetchLogo();
      fetchCompanyInfo();
    }
  }, [isAdmin, activeTab, fetchSystemSettings, fetchLogo, fetchCompanyInfo]);

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
        await refreshLogo();
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

  // ==================== Profile handlers ====================
  const handleProfileSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (profileForm.password && profileForm.password !== profileForm.confirmPassword) {
      toast.error('两次密码输入不一致');
      return;
    }
    if (profileForm.password && profileForm.password.length < 6) {
      toast.error('密码至少6位');
      return;
    }
    setProfileSaving(true);
    try {
      const payload: any = { phone: profileForm.phone, bio: profileForm.bio };
      if (profileForm.password) payload.password = profileForm.password;
      await authApi.updateProfile(payload);
      await refreshUser();
      setProfileForm((prev) => ({ ...prev, password: '', confirmPassword: '' }));
      toast.success('个人资料已更新');
    } catch {
      // handled by interceptor
    } finally {
      setProfileSaving(false);
    }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      toast.error('头像文件不能超过 2MB');
      return;
    }
    setAvatarUploading(true);
    try {
      const fd = new FormData();
      fd.append('avatar', file);
      await authApi.uploadAvatar(fd);
      await refreshUser();
      toast.success('头像已更新');
    } catch {
      // handled by interceptor
    } finally {
      setAvatarUploading(false);
      e.target.value = '';
    }
  };

  if (authLoading || !currentUser) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  const tabs = isAdmin ? ADMIN_TABS : USER_TABS;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <h1 className="text-2xl font-bold text-gray-900">设置</h1>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-6">
            {tabs.map((tab) => (
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

        {/* ==================== Profile Tab ==================== */}
        {activeTab === 'profile' && (
          <div className="max-w-lg space-y-6">
            {/* Avatar */}
            <div className="flex items-center gap-5">
              <div className="relative">
                {currentUser.avatar ? (
                  <img
                    src={currentUser.avatar}
                    alt="头像"
                    className="h-20 w-20 rounded-full object-cover ring-2 ring-gray-200"
                  />
                ) : (
                  <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-blue-400 to-indigo-500 text-2xl font-bold text-white">
                    {currentUser.name.charAt(0)}
                  </div>
                )}
                {avatarUploading && (
                  <div className="absolute inset-0 flex items-center justify-center rounded-full bg-black/40">
                    <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  </div>
                )}
              </div>
              <div>
                <label className="cursor-pointer rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 transition-colors">
                  {avatarUploading ? '上传中...' : '更换头像'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={avatarUploading}
                    onChange={handleAvatarUpload}
                  />
                </label>
                <p className="mt-1.5 text-xs text-gray-400">支持 JPG、PNG，最大 2MB</p>
              </div>
            </div>

            {/* Read-only info */}
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-gray-500">姓名</span>
                <span className="font-medium text-gray-900">{currentUser.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">角色</span>
                <span className="font-medium text-gray-900">{ROLE_MAP[currentUser.role] || currentUser.role}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">邮箱</span>
                <span className="font-medium text-gray-900">{currentUser.email}</span>
              </div>
            </div>

            {/* Editable fields */}
            <form onSubmit={handleProfileSave} className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">手机号</label>
                <input
                  type="text"
                  value={profileForm.phone}
                  onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="请输入手机号"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">个性签名</label>
                <textarea
                  value={profileForm.bio}
                  onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                  placeholder="写点什么介绍自己..."
                />
              </div>
              <div className="border-t pt-4">
                <p className="mb-3 text-sm font-medium text-gray-700">修改密码 <span className="font-normal text-gray-400">（不修改请留空）</span></p>
                <div className="space-y-3">
                  <input
                    type="password"
                    value={profileForm.password}
                    onChange={(e) => setProfileForm({ ...profileForm, password: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="新密码（至少6位）"
                    autoComplete="new-password"
                  />
                  <input
                    type="password"
                    value={profileForm.confirmPassword}
                    onChange={(e) => setProfileForm({ ...profileForm, confirmPassword: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
                    placeholder="确认新密码"
                    autoComplete="new-password"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {profileSaving ? '保存中...' : '保存修改'}
                </button>
              </div>
            </form>

            {/* 邮箱链接跳转偏好 */}
            <div className="mt-8 border-t border-gray-100 pt-6">
              <h3 className="text-sm font-semibold text-gray-900">
                邮箱链接跳转偏好
              </h3>
              <p className="mt-1 text-xs text-gray-500">
                在线索、联系人等页面点击邮箱地址时的默认行为。
              </p>
              <div className="mt-3 space-y-2">
                {[
                  { key: 'ask', label: '每次询问', desc: '弹窗选择，并可勾选"记住选择"' },
                  { key: 'internal', label: '系统邮件', desc: '直接在当前系统打开撰写窗口' },
                  { key: 'external', label: '外部邮箱', desc: '调用系统默认邮件客户端（mailto:）' },
                ].map((opt) => (
                  <label
                    key={opt.key}
                    className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50"
                  >
                    <input
                      type="radio"
                      name="email-link-pref"
                      checked={emailPref === opt.key}
                      disabled={emailPrefSaving}
                      onChange={() => updateEmailPref(opt.key as EmailLinkPreference)}
                      className="mt-0.5 h-4 w-4"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900">
                        {opt.label}
                      </div>
                      <div className="text-xs text-gray-500">{opt.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </div>
        )}

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
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          <div className="flex items-center gap-1.5">
                            {u.name}
                            {u.isSuperAdmin && (
                              <span
                                title="超级管理员：系统首次部署创建的账号，不可删除"
                                className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700"
                              >
                                超级管理员
                              </span>
                            )}
                          </div>
                        </td>
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
                            {u.isSuperAdmin ? (
                              <span
                                title="超级管理员不可删除"
                                className="text-sm text-gray-300 cursor-not-allowed"
                              >
                                删除
                              </span>
                            ) : (
                              <button
                                onClick={() => handleDeleteUser(u.id)}
                                className="text-sm text-red-600 hover:text-red-800"
                              >
                                删除
                              </button>
                            )}
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

        {/* ==================== System Settings Tab ==================== */}
        {activeTab === 'system' && (
          <div className="space-y-6">
            {/* Company Info Section */}
            <div className="rounded-lg border border-gray-200 bg-white p-6">
              <h3 className="text-base font-semibold text-gray-900 mb-4">公司信息</h3>
              <p className="text-xs text-gray-500 mb-4">公司信息将自动同步到形式发票（PI）的卖方信息中</p>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">公司名称</label>
                  <input
                    type="text"
                    value={companyInfo.companyName}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, companyName: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="公司名称"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">公司电话</label>
                  <input
                    type="text"
                    value={companyInfo.companyPhone}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, companyPhone: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="公司电话"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">公司邮箱</label>
                  <input
                    type="text"
                    value={companyInfo.companyEmail}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, companyEmail: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="公司邮箱"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">公司网站</label>
                  <input
                    type="text"
                    value={companyInfo.companyWebsite}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, companyWebsite: e.target.value })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="https://www.example.com"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-1">公司地址</label>
                  <textarea
                    value={companyInfo.companyAddress}
                    onChange={(e) => setCompanyInfo({ ...companyInfo, companyAddress: e.target.value })}
                    rows={3}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="公司详细地址（支持多行）"
                  />
                </div>
              </div>
              <div className="border-t pt-4 mt-4">
                <button
                  onClick={handleCompanyInfoSave}
                  disabled={companyInfoSaving}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {companyInfoSaving ? '保存中...' : '保存公司信息'}
                </button>
              </div>
            </div>

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

            {/* Bank accounts (multi) + PI templates */}
            <BankAccountsPanel />
            <PITemplatesPanel />

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
            <div className="space-y-8">
              {/* Export */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-2">
                  导出数据备份（CSV 压缩包）
                </h3>
                <p className="text-sm text-gray-500 mb-3">
                  将系统核心业务数据打包为 ZIP 下载，内部为一组 CSV 文件，Excel 可直接打开。
                </p>
                <div className="rounded-lg bg-gray-50 border border-gray-200 p-4 mb-4 text-sm text-gray-600 space-y-1">
                  <p className="font-medium text-gray-800">包含以下数据：</p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    <li>用户（作为客户 / 订单 / 线索 / 任务等数据的归属人）</li>
                    <li>客户、联系人、销售线索</li>
                    <li>报价单 + 报价单行项</li>
                    <li>订单 + 订单行项</li>
                    <li>任务、跟进记录</li>
                  </ul>
                  <p className="font-medium text-gray-800 mt-2">不包含：</p>
                  <ul className="list-disc pl-5 space-y-0.5 text-gray-500">
                    <li>邮件 / 邮箱配置 / 邮件模板 / 邮件线程</li>
                    <li>系统消息、备忘录、文档附件、审计日志、系统设置</li>
                  </ul>
                </div>
                <button
                  onClick={handleExportBackup}
                  disabled={backupExporting}
                  className="rounded-lg bg-primary-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-primary-600 disabled:opacity-50 transition-colors"
                >
                  {backupExporting ? '导出中...' : '导出 CSV 备份包'}
                </button>
              </div>

              <div className="border-t border-gray-200" />

              {/* Restore */}
              <div>
                <h3 className="text-base font-semibold text-gray-900 mb-2">
                  从备份恢复数据
                </h3>
                <p className="text-sm text-gray-500 mb-3">
                  上传之前导出的 ZIP 备份文件，系统会自动解析并恢复业务数据。
                </p>
                <div className="rounded-lg bg-red-50 border border-red-200 p-4 mb-4 text-sm text-red-700 space-y-1">
                  <p className="font-semibold">⚠️ 操作不可撤销，请务必先导出一份当前数据作为保险：</p>
                  <ul className="list-disc pl-5 space-y-0.5">
                    <li>
                      <strong>会被替换</strong>：客户、联系人、线索、报价、订单、任务、跟进记录
                    </li>
                    <li>
                      <strong>会被清空</strong>（因为引用关系）：邮件、邮箱配置、形式发票、文档、备忘录、系统消息
                    </li>
                    <li>
                      <strong>会被保留</strong>：系统设置、角色权限、审计日志、你当前登录的账号
                    </li>
                    <li>
                      新恢复出来的用户（非当前账号）需要走"忘记密码"流程重置密码
                    </li>
                  </ul>
                </div>
                <button
                  onClick={handleImportBackup}
                  disabled={backupImporting}
                  className="rounded-lg border border-red-300 bg-white px-5 py-2.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50 transition-colors"
                >
                  {backupImporting ? '恢复中，请稍候...' : '选择 ZIP 备份文件恢复'}
                </button>

                {backupImportResult && (
                  <div className="mt-4 rounded-lg bg-green-50 border border-green-200 p-4 text-sm text-green-800">
                    <p className="font-semibold mb-2">✅ 恢复成功</p>
                    {backupImportResult.imported && (
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-1">
                        {Object.entries(backupImportResult.imported as Record<string, number>).map(
                          ([k, v]) => (
                            <div key={k} className="flex justify-between">
                              <span className="text-green-700">{k}</span>
                              <span className="font-mono">{v}</span>
                            </div>
                          ),
                        )}
                      </div>
                    )}
                    {Array.isArray(backupImportResult.skipped) &&
                      backupImportResult.skipped.length > 0 && (
                        <p className="mt-2 text-xs text-green-700">
                          备份中未包含的表：{backupImportResult.skipped.join(', ')}
                        </p>
                      )}
                    <button
                      onClick={() => window.location.reload()}
                      className="mt-3 text-sm text-green-700 hover:text-green-900 underline"
                    >
                      刷新页面以查看新数据
                    </button>
                  </div>
                )}
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
