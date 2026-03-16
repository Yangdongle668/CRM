'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import AppLayout from '@/components/layout/AppLayout';
import { Modal } from '@/components/ui/Modal';
import { useAuth } from '@/contexts/auth-context';
import { usersApi, settingsApi, authApi } from '@/lib/api';
import { ROLE_MAP } from '@/lib/constants';
import type { User, Role, EmailConfig } from '@/types';

type TabKey = 'users' | 'email' | 'system';

const TABS: { key: TabKey; label: string }[] = [
  { key: 'users', label: '用户管理' },
  { key: 'email', label: '邮件配置' },
  { key: 'system', label: '系统参数' },
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
      await settingsApi.updateEmailConfig(emailConfig);
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
      await settingsApi.testEmailConfig(emailConfig);
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

  useEffect(() => {
    if (isAdmin && activeTab === 'system') fetchSystemSettings();
  }, [isAdmin, activeTab, fetchSystemSettings]);

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
                {/* SMTP */}
                <div>
                  <h3 className="mb-4 text-base font-semibold text-gray-900">SMTP 发件配置</h3>
                  <div className="grid grid-cols-2 gap-4">
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
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">SMTP 用户名</label>
                      <input
                        type="text"
                        value={emailConfig.smtpUser}
                        onChange={(e) => setEmailConfig({ ...emailConfig, smtpUser: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="user@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">SMTP 密码</label>
                      <input
                        type="password"
                        value={emailConfig.smtpPass}
                        onChange={(e) => setEmailConfig({ ...emailConfig, smtpPass: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
                    </div>
                  </div>
                </div>

                {/* IMAP */}
                <div>
                  <h3 className="mb-4 text-base font-semibold text-gray-900">IMAP 收件配置</h3>
                  <div className="grid grid-cols-2 gap-4">
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
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">IMAP 用户名</label>
                      <input
                        type="text"
                        value={emailConfig.imapUser}
                        onChange={(e) => setEmailConfig({ ...emailConfig, imapUser: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                        placeholder="user@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">IMAP 密码</label>
                      <input
                        type="password"
                        value={emailConfig.imapPass}
                        onChange={(e) => setEmailConfig({ ...emailConfig, imapPass: e.target.value })}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                      />
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
