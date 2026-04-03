'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import AppLayout from '@/components/layout/AppLayout';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import ConfirmDialog from '@/components/ui/ConfirmDialog';
import { useAuth } from '@/contexts/auth-context';
import { customersApi, contactsApi, activitiesApi, documentsApi, emailsApi } from '@/lib/api';
import {
  CUSTOMER_STATUS_MAP,
  CUSTOMER_SOURCES,
  INDUSTRIES,
  ACTIVITY_TYPE_MAP,
  COUNTRIES,
} from '@/lib/constants';
import type {
  Customer,
  CustomerStatus,
  Contact,
  Activity,
  ActivityType,
  Document,
  Email,
} from '@/types';

const TABS = [
  { key: 'info', label: '基本信息' },
  { key: 'contacts', label: '联系人' },
  { key: 'activities', label: '时间线' },
  { key: 'files', label: '文件' },
  { key: 'emails', label: '邮件' },
] as const;

type TabKey = (typeof TABS)[number]['key'];

const initialContactForm = {
  name: '',
  title: '',
  email: '',
  phone: '',
  wechat: '',
  whatsapp: '',
  isPrimary: false,
  remark: '',
};

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { isAdmin } = useAuth();
  const customerId = params.id as string;

  const [customer, setCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabKey>('info');

  // Edit customer modal
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Customer>>({});
  const [saving, setSaving] = useState(false);

  // Contacts
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactForm, setContactForm] = useState(initialContactForm);
  const [editingContactId, setEditingContactId] = useState<string | null>(null);
  const [contactSaving, setContactSaving] = useState(false);

  // Activities
  const [activities, setActivities] = useState<Activity[]>([]);
  const [activityType, setActivityType] = useState<ActivityType>('NOTE');
  const [activityContent, setActivityContent] = useState('');
  const [activitySaving, setActivitySaving] = useState(false);

  // Files
  const [documents, setDocuments] = useState<Document[]>([]);
  const [uploading, setUploading] = useState(false);

  // Emails
  const [emails, setEmails] = useState<Email[]>([]);

  // Delete contact
  const [deleteContactId, setDeleteContactId] = useState<string | null>(null);
  const [deletingContact, setDeletingContact] = useState(false);

  const fetchCustomer = useCallback(async () => {
    try {
      const res: any = await customersApi.getById(customerId);
      setCustomer(res.data);
    } catch {
      toast.error('加载客户信息失败');
      router.push('/customers');
    } finally {
      setLoading(false);
    }
  }, [customerId, router]);

  const fetchContacts = useCallback(async () => {
    try {
      const res: any = await contactsApi.list({ customerId });
      setContacts(res.data?.items || res.data || []);
    } catch {
      // handled by interceptor
    }
  }, [customerId]);

  const fetchActivities = useCallback(async () => {
    try {
      // Sync unlinked emails to activities first
      await customersApi.syncEmails(customerId).catch(() => {});
      const res: any = await activitiesApi.list({ customerId });
      setActivities(res.data?.items || res.data || []);
    } catch {
      // handled by interceptor
    }
  }, [customerId]);

  const fetchDocuments = useCallback(async () => {
    try {
      const res: any = await documentsApi.list({ customerId });
      setDocuments(res.data?.items || res.data || []);
    } catch {
      // handled by interceptor
    }
  }, [customerId]);

  const fetchEmails = useCallback(async () => {
    try {
      const res: any = await emailsApi.list({ customerId });
      setEmails(res.data?.items || res.data || []);
    } catch {
      // handled by interceptor
    }
  }, [customerId]);

  useEffect(() => {
    fetchCustomer();
  }, [fetchCustomer]);

  useEffect(() => {
    if (activeTab === 'contacts') fetchContacts();
    if (activeTab === 'activities') fetchActivities();
    if (activeTab === 'files') fetchDocuments();
    if (activeTab === 'emails') fetchEmails();
  }, [activeTab, fetchContacts, fetchActivities, fetchDocuments, fetchEmails]);

  // Edit customer
  const openEditModal = () => {
    if (!customer) return;
    setEditForm({
      companyName: customer.companyName,
      country: customer.country || '',
      address: customer.address || '',
      website: customer.website || '',
      industry: customer.industry || '',
      scale: customer.scale || '',
      source: customer.source || '',
      status: customer.status,
      remark: customer.remark || '',
    });
    setEditOpen(true);
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await customersApi.update(customerId, editForm);
      toast.success('客户信息已更新');
      setEditOpen(false);
      fetchCustomer();
    } catch {
      // handled by interceptor
    } finally {
      setSaving(false);
    }
  };

  // Contacts CRUD
  const openAddContact = () => {
    setEditingContactId(null);
    setContactForm(initialContactForm);
    setContactModalOpen(true);
  };

  const openEditContact = (contact: Contact) => {
    setEditingContactId(contact.id);
    setContactForm({
      name: contact.name,
      title: contact.title || '',
      email: contact.email || '',
      phone: contact.phone || '',
      wechat: contact.wechat || '',
      whatsapp: contact.whatsapp || '',
      isPrimary: contact.isPrimary,
      remark: contact.remark || '',
    });
    setContactModalOpen(true);
  };

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactForm.name.trim()) {
      toast.error('请输入联系人姓名');
      return;
    }
    setContactSaving(true);
    try {
      const payload = { ...contactForm, customerId };
      if (editingContactId) {
        await contactsApi.update(editingContactId, payload);
        toast.success('联系人已更新');
      } else {
        await contactsApi.create(payload);
        toast.success('联系人已添加');
      }
      setContactModalOpen(false);
      fetchContacts();
    } catch {
      // handled by interceptor
    } finally {
      setContactSaving(false);
    }
  };

  const handleDeleteContact = async () => {
    if (!deleteContactId) return;
    setDeletingContact(true);
    try {
      await contactsApi.delete(deleteContactId);
      toast.success('联系人已删除');
      setDeleteContactId(null);
      fetchContacts();
    } catch {
      // handled by interceptor
    } finally {
      setDeletingContact(false);
    }
  };

  // Activities
  const handleAddActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activityContent.trim()) {
      toast.error('请输入活动内容');
      return;
    }
    setActivitySaving(true);
    try {
      await activitiesApi.create({
        type: activityType,
        content: activityContent,
        customerId,
      });
      toast.success('活动记录已添加');
      setActivityContent('');
      fetchActivities();
    } catch {
      // handled by interceptor
    } finally {
      setActivitySaving(false);
    }
  };

  // Files
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('customerId', customerId);
      await documentsApi.upload(formData);
      toast.success('文件上传成功');
      fetchDocuments();
    } catch {
      // handled by interceptor
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleDownload = async (doc: Document) => {
    try {
      const res: any = await documentsApi.download(doc.id);
      const url = window.URL.createObjectURL(new Blob([res]));
      const link = document.createElement('a');
      link.href = url;
      link.download = doc.fileName;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch {
      toast.error('下载失败');
    }
  };

  const handleDeleteFile = async (id: string) => {
    try {
      await documentsApi.delete(id);
      toast.success('文件已删除');
      fetchDocuments();
    } catch {
      // handled by interceptor
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex h-64 items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
        </div>
      </AppLayout>
    );
  }

  if (!customer) return null;

  const statusInfo = CUSTOMER_STATUS_MAP[customer.status];

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/customers')}
              className="text-gray-500 hover:text-gray-700"
            >
              &larr; 返回
            </button>
            <h1 className="text-2xl font-bold text-gray-900">{customer.companyName}</h1>
            <Badge className={statusInfo?.color || ''}>
              {statusInfo?.label || customer.status}
            </Badge>
          </div>
          <button
            onClick={openEditModal}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
          >
            编辑
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex space-x-8">
            {TABS.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
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

        {/* Tab Content */}
        <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
          {/* Basic Info Tab */}
          {activeTab === 'info' && (
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <InfoField label="公司名称" value={customer.companyName} />
              <InfoField label="国家" value={customer.country} />
              <InfoField label="地址" value={customer.address} />
              <InfoField label="网站" value={customer.website} isLink />
              <InfoField label="行业" value={customer.industry} />
              <InfoField label="规模" value={customer.scale} />
              <InfoField label="来源" value={customer.source} />
              <InfoField
                label="状态"
                value={CUSTOMER_STATUS_MAP[customer.status]?.label || customer.status}
              />
              <InfoField label="负责人" value={customer.owner?.name} />
              <InfoField
                label="创建时间"
                value={new Date(customer.createdAt).toLocaleString('zh-CN')}
              />
              <div className="sm:col-span-2">
                <InfoField label="备注" value={customer.remark} />
              </div>
            </div>
          )}

          {/* Contacts Tab */}
          {activeTab === 'contacts' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button
                  onClick={openAddContact}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  添加联系人
                </button>
              </div>
              {contacts.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">暂无联系人</p>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">姓名</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">职位</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">邮箱</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">电话</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">微信</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">WhatsApp</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">主要联系人</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {contacts.map((contact) => (
                      <tr key={contact.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">
                          {contact.name}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">{contact.title || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{contact.email || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{contact.phone || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{contact.wechat || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{contact.whatsapp || '-'}</td>
                        <td className="px-4 py-3 text-sm">
                          {contact.isPrimary ? (
                            <Badge className="bg-green-100 text-green-800">是</Badge>
                          ) : (
                            <span className="text-gray-400">否</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          <button
                            onClick={() => openEditContact(contact)}
                            className="mr-3 text-blue-600 hover:text-blue-800"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => setDeleteContactId(contact.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Activities Tab - Timeline */}
          {activeTab === 'activities' && (
            <div className="space-y-6">
              <form onSubmit={handleAddActivity} className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/30 p-4">
                <div className="flex items-center gap-4">
                  <select
                    value={activityType}
                    onChange={(e) => setActivityType(e.target.value as ActivityType)}
                    className="rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none bg-white"
                  >
                    {Object.entries(ACTIVITY_TYPE_MAP).map(([key, val]) => (
                      <option key={key} value={key}>
                        {val.icon} {val.label}
                      </option>
                    ))}
                  </select>
                  <span className="text-sm text-gray-500">添加时间线记录</span>
                </div>
                <textarea
                  value={activityContent}
                  onChange={(e) => setActivityContent(e.target.value)}
                  rows={3}
                  placeholder="请输入活动内容..."
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={activitySaving}
                    className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {activitySaving ? '添加中...' : '添加记录'}
                  </button>
                </div>
              </form>

              {activities.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">暂无活动记录</p>
              ) : (
                <div className="relative space-y-0">
                  <div className="absolute left-5 top-0 bottom-0 w-px bg-gray-200" />
                  {activities.map((activity) => {
                    const typeInfo = ACTIVITY_TYPE_MAP[activity.type];
                    return (
                      <div key={activity.id} className="relative flex gap-4 pb-6">
                        <div className="relative z-10 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full bg-white border-2 border-gray-200 text-lg">
                          {typeInfo?.icon || '📌'}
                        </div>
                        <div className="flex-1 rounded-lg border border-gray-200 bg-gray-50 p-4">
                          <div className="mb-1 flex items-center gap-2">
                            <Badge className="bg-blue-100 text-blue-800">
                              {typeInfo?.label || activity.type}
                            </Badge>
                            <span className="text-xs text-gray-500">
                              {activity.owner?.name} &middot;{' '}
                              {new Date(activity.createdAt).toLocaleString('zh-CN')}
                            </span>
                          </div>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{activity.content}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Files Tab */}
          {activeTab === 'files' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <label className="cursor-pointer rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
                  {uploading ? '上传中...' : '上传文件'}
                  <input
                    type="file"
                    className="hidden"
                    onChange={handleFileUpload}
                    disabled={uploading}
                  />
                </label>
              </div>
              {documents.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">暂无文件</p>
              ) : (
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">文件名</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">大小</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">上传者</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">上传时间</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {documents.map((doc) => (
                      <tr key={doc.id} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm font-medium text-gray-900">{doc.fileName}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{formatFileSize(doc.fileSize)}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">{doc.owner?.name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {new Date(doc.createdAt).toLocaleString('zh-CN')}
                        </td>
                        <td className="px-4 py-3 text-right text-sm">
                          <button
                            onClick={() => handleDownload(doc)}
                            className="mr-3 text-blue-600 hover:text-blue-800"
                          >
                            下载
                          </button>
                          <button
                            onClick={() => handleDeleteFile(doc.id)}
                            className="text-red-600 hover:text-red-800"
                          >
                            删除
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Emails Tab */}
          {activeTab === 'emails' && (
            <div className="space-y-4">
              {emails.length === 0 ? (
                <p className="py-8 text-center text-sm text-gray-500">暂无邮件记录</p>
              ) : (
                <div className="divide-y divide-gray-200">
                  {emails.map((email) => (
                    <div key={email.id} className="py-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge
                            className={
                              email.direction === 'INBOUND'
                                ? 'bg-green-100 text-green-800'
                                : 'bg-blue-100 text-blue-800'
                            }
                          >
                            {email.direction === 'INBOUND' ? '收件' : '发件'}
                          </Badge>
                          <span className="text-sm font-medium text-gray-900">{email.subject}</span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {new Date(email.sentAt || email.receivedAt || email.createdAt).toLocaleString(
                            'zh-CN'
                          )}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        <span>发件人: {email.fromAddr}</span>
                        <span className="mx-2">&rarr;</span>
                        <span>收件人: {email.toAddr}</span>
                      </div>
                      {email.bodyText && (
                        <p className="mt-2 text-sm text-gray-600 line-clamp-2">{email.bodyText}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Edit Customer Modal */}
      <Modal open={editOpen} onClose={() => setEditOpen(false)} title="编辑客户信息" maxWidth="2xl">
        <form onSubmit={handleUpdateCustomer} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">
                公司名称 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={editForm.companyName || ''}
                onChange={(e) => setEditForm((f) => ({ ...f, companyName: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">国家</label>
              <select
                value={editForm.country || ''}
                onChange={(e) => setEditForm((f) => ({ ...f, country: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">请选择</option>
                {COUNTRIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">行业</label>
              <select
                value={editForm.industry || ''}
                onChange={(e) => setEditForm((f) => ({ ...f, industry: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">请选择</option>
                {INDUSTRIES.map((ind) => (
                  <option key={ind} value={ind}>{ind}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">地址</label>
              <input
                type="text"
                value={editForm.address || ''}
                onChange={(e) => setEditForm((f) => ({ ...f, address: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">网站</label>
              <input
                type="text"
                value={editForm.website || ''}
                onChange={(e) => setEditForm((f) => ({ ...f, website: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">规模</label>
              <input
                type="text"
                value={editForm.scale || ''}
                onChange={(e) => setEditForm((f) => ({ ...f, scale: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">来源</label>
              <select
                value={editForm.source || ''}
                onChange={(e) => setEditForm((f) => ({ ...f, source: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                <option value="">请选择</option>
                {CUSTOMER_SOURCES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">状态</label>
              <select
                value={editForm.status || ''}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, status: e.target.value as CustomerStatus }))
                }
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none"
              >
                {Object.entries(CUSTOMER_STATUS_MAP).map(([key, val]) => (
                  <option key={key} value={key}>{val.label}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="mb-1 block text-sm font-medium text-gray-700">备注</label>
              <textarea
                value={editForm.remark || ''}
                onChange={(e) => setEditForm((f) => ({ ...f, remark: e.target.value }))}
                rows={3}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Contact Modal */}
      <Modal
        open={contactModalOpen}
        onClose={() => setContactModalOpen(false)}
        title={editingContactId ? '编辑联系人' : '添加联系人'}
      >
        <form onSubmit={handleSaveContact} className="space-y-4">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              姓名 <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={contactForm.name}
              onChange={(e) => setContactForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">职位</label>
            <input
              type="text"
              value={contactForm.title}
              onChange={(e) => setContactForm((f) => ({ ...f, title: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">邮箱</label>
              <input
                type="email"
                value={contactForm.email}
                onChange={(e) => setContactForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">电话</label>
              <input
                type="text"
                value={contactForm.phone}
                onChange={(e) => setContactForm((f) => ({ ...f, phone: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">微信</label>
              <input
                type="text"
                value={contactForm.wechat}
                onChange={(e) => setContactForm((f) => ({ ...f, wechat: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-700">WhatsApp</label>
              <input
                type="text"
                value={contactForm.whatsapp}
                onChange={(e) => setContactForm((f) => ({ ...f, whatsapp: e.target.value }))}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isPrimary"
              checked={contactForm.isPrimary}
              onChange={(e) => setContactForm((f) => ({ ...f, isPrimary: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <label htmlFor="isPrimary" className="text-sm text-gray-700">
              设为主要联系人
            </label>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">备注</label>
            <textarea
              value={contactForm.remark}
              onChange={(e) => setContactForm((f) => ({ ...f, remark: e.target.value }))}
              rows={2}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setContactModalOpen(false)}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={contactSaving}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {contactSaving ? '保存中...' : '保存'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Delete Contact Confirm */}
      <ConfirmDialog
        open={!!deleteContactId}
        onClose={() => setDeleteContactId(null)}
        onConfirm={handleDeleteContact}
        title="删除联系人"
        message="确定要删除该联系人吗？此操作不可撤销。"
        confirmText="删除"
        loading={deletingContact}
      />
    </AppLayout>
  );
}

// Helper component for displaying info fields
function InfoField({
  label,
  value,
  isLink,
}: {
  label: string;
  value?: string | null;
  isLink?: boolean;
}) {
  return (
    <div>
      <dt className="text-sm font-medium text-gray-500">{label}</dt>
      <dd className="mt-1 text-sm text-gray-900">
        {value ? (
          isLink ? (
            <a
              href={value.startsWith('http') ? value : `https://${value}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:underline"
            >
              {value}
            </a>
          ) : (
            value
          )
        ) : (
          <span className="text-gray-400">-</span>
        )}
      </dd>
    </div>
  );
}
