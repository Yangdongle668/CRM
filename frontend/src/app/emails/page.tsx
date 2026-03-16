'use client';

import React, { useState, useEffect, useCallback } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { emailsApi, customersApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import type { Email, EmailTemplate, Customer, PaginatedData, EmailDirection } from '@/types';
import toast from 'react-hot-toast';

type TabType = 'INBOUND' | 'OUTBOUND' | 'TEMPLATES';

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  DRAFT: { label: '草稿', color: 'bg-gray-100 text-gray-800' },
  SENT: { label: '已发送', color: 'bg-green-100 text-green-800' },
  RECEIVED: { label: '已接收', color: 'bg-blue-100 text-blue-800' },
  FAILED: { label: '发送失败', color: 'bg-red-100 text-red-800' },
  READ: { label: '已读', color: 'bg-purple-100 text-purple-800' },
};

interface ComposeForm {
  toAddr: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyHtml: string;
  customerId: string;
}

const emptyComposeForm: ComposeForm = {
  toAddr: '',
  cc: '',
  bcc: '',
  subject: '',
  bodyHtml: '',
  customerId: '',
};

interface TemplateForm {
  name: string;
  subject: string;
  bodyHtml: string;
  category: string;
}

const emptyTemplateForm: TemplateForm = {
  name: '',
  subject: '',
  bodyHtml: '',
  category: '',
};

export default function EmailsPage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('INBOUND');
  const [emails, setEmails] = useState<Email[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);

  // Detail panel
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Compose modal
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeForm, setComposeForm] = useState<ComposeForm>(emptyComposeForm);
  const [sending, setSending] = useState(false);

  // Template modal
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState<TemplateForm>(emptyTemplateForm);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Fetch emails
  const fetchEmails = useCallback(async () => {
    if (activeTab === 'TEMPLATES') return;
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page,
        pageSize,
        direction: activeTab as EmailDirection,
      };
      const res: any = await emailsApi.list(params);
      const data: PaginatedData<Email> = res.data;
      setEmails(data.items);
      setTotal(data.total);
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, pageSize]);

  const fetchTemplates = useCallback(async () => {
    try {
      const res: any = await emailsApi.getTemplates();
      setTemplates(res.data || []);
    } catch {
      // handled by interceptor
    }
  }, []);

  const fetchCustomers = useCallback(async () => {
    try {
      const res: any = await customersApi.list({ page: 1, pageSize: 200 });
      setCustomers(res.data.items || []);
    } catch {
      // handled by interceptor
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'TEMPLATES') {
      fetchTemplates();
    } else {
      fetchEmails();
    }
  }, [activeTab, fetchEmails, fetchTemplates]);

  useEffect(() => {
    fetchCustomers();
  }, [fetchCustomers]);

  // View email detail
  const handleViewEmail = async (email: Email) => {
    try {
      const res: any = await emailsApi.getById(email.id);
      setSelectedEmail(res.data);
      setDetailOpen(true);
    } catch {
      setSelectedEmail(email);
      setDetailOpen(true);
    }
  };

  // Send email
  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!composeForm.toAddr.trim()) {
      toast.error('请输入收件人地址');
      return;
    }
    if (!composeForm.subject.trim()) {
      toast.error('请输入邮件主题');
      return;
    }
    setSending(true);
    try {
      const payload: any = {
        toAddr: composeForm.toAddr,
        subject: composeForm.subject,
        bodyHtml: composeForm.bodyHtml,
      };
      if (composeForm.cc) payload.cc = composeForm.cc;
      if (composeForm.bcc) payload.bcc = composeForm.bcc;
      if (composeForm.customerId) payload.customerId = composeForm.customerId;

      await emailsApi.send(payload);
      toast.success('邮件已发送');
      setComposeOpen(false);
      setComposeForm(emptyComposeForm);
      if (activeTab === 'OUTBOUND') {
        fetchEmails();
      }
    } catch {
      // handled by interceptor
    } finally {
      setSending(false);
    }
  };

  // Fetch IMAP
  const handleFetchImap = async () => {
    try {
      toast.loading('正在收取邮件...', { id: 'fetch-email' });
      await emailsApi.fetch();
      toast.success('邮件收取完成', { id: 'fetch-email' });
      if (activeTab === 'INBOUND') {
        fetchEmails();
      }
    } catch {
      toast.error('邮件收取失败', { id: 'fetch-email' });
    }
  };

  // Create template
  const handleCreateTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!templateForm.name.trim()) {
      toast.error('请输入模板名称');
      return;
    }
    setSavingTemplate(true);
    try {
      await emailsApi.createTemplate({
        name: templateForm.name,
        subject: templateForm.subject,
        bodyHtml: templateForm.bodyHtml,
        category: templateForm.category || undefined,
      });
      toast.success('模板已创建');
      setTemplateModalOpen(false);
      setTemplateForm(emptyTemplateForm);
      fetchTemplates();
    } catch {
      // handled by interceptor
    } finally {
      setSavingTemplate(false);
    }
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleString('zh-CN');
  };

  // ==================== Tabs ====================
  const tabs: { key: TabType; label: string }[] = [
    { key: 'INBOUND', label: '收件箱' },
    { key: 'OUTBOUND', label: '已发送' },
    { key: 'TEMPLATES', label: '邮件模板' },
  ];

  // ==================== Email List ====================
  const renderEmailList = () => (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                {activeTab === 'INBOUND' ? '发件人' : '收件人'}
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                主题
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                关联客户
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                时间
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                状态
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {emails.map((email) => (
              <tr
                key={email.id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => handleViewEmail(email)}
              >
                <td className="px-4 py-3 text-sm text-gray-900">
                  {activeTab === 'INBOUND' ? email.fromAddr : email.toAddr}
                </td>
                <td className="px-4 py-3 text-sm text-gray-900 font-medium">
                  {email.subject || '(无主题)'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {email.customer?.companyName || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {formatTime(email.sentAt || email.receivedAt || email.createdAt)}
                </td>
                <td className="px-4 py-3">
                  <Badge className={STATUS_MAP[email.status]?.color || 'bg-gray-100 text-gray-800'}>
                    {STATUS_MAP[email.status]?.label || email.status}
                  </Badge>
                </td>
              </tr>
            ))}
            {!loading && emails.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  暂无邮件
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {total > pageSize && (
        <div className="flex items-center justify-between px-4 py-3 border-t">
          <span className="text-sm text-gray-500">共 {total} 封邮件</span>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              上一页
            </button>
            <span className="px-3 py-1 text-sm text-gray-600">
              第 {page} 页
            </span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * pageSize >= total}
              className="px-3 py-1 text-sm border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              下一页
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // ==================== Templates List ====================
  const renderTemplates = () => (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                模板名称
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                主题
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                分类
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                操作
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {templates.map((tpl) => (
              <tr key={tpl.id} className="hover:bg-gray-50">
                <td className="px-4 py-3 text-sm font-medium text-gray-900">
                  {tpl.name}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">{tpl.subject}</td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {tpl.category || '-'}
                </td>
                <td className="px-4 py-3 text-sm">
                  <button
                    onClick={() => {
                      setComposeForm({
                        ...emptyComposeForm,
                        subject: tpl.subject,
                        bodyHtml: tpl.bodyHtml,
                      });
                      setComposeOpen(true);
                    }}
                    className="text-blue-600 hover:text-blue-800"
                  >
                    使用模板
                  </button>
                </td>
              </tr>
            ))}
            {templates.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                  暂无模板
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );

  // ==================== Email Detail Modal ====================
  const renderDetailModal = () => (
    <Modal
      isOpen={detailOpen}
      onClose={() => {
        setDetailOpen(false);
        setSelectedEmail(null);
      }}
      title="邮件详情"
      size="xl"
    >
      {selectedEmail && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="font-medium text-gray-500">发件人：</span>
              <span className="text-gray-900">{selectedEmail.fromAddr}</span>
            </div>
            <div>
              <span className="font-medium text-gray-500">收件人：</span>
              <span className="text-gray-900">{selectedEmail.toAddr}</span>
            </div>
            {selectedEmail.cc && (
              <div>
                <span className="font-medium text-gray-500">抄送：</span>
                <span className="text-gray-900">{selectedEmail.cc}</span>
              </div>
            )}
            {selectedEmail.bcc && (
              <div>
                <span className="font-medium text-gray-500">密送：</span>
                <span className="text-gray-900">{selectedEmail.bcc}</span>
              </div>
            )}
            <div>
              <span className="font-medium text-gray-500">时间：</span>
              <span className="text-gray-900">
                {formatTime(selectedEmail.sentAt || selectedEmail.receivedAt || selectedEmail.createdAt)}
              </span>
            </div>
            <div>
              <span className="font-medium text-gray-500">状态：</span>
              <Badge className={STATUS_MAP[selectedEmail.status]?.color || ''}>
                {STATUS_MAP[selectedEmail.status]?.label || selectedEmail.status}
              </Badge>
            </div>
            {selectedEmail.customer && (
              <div>
                <span className="font-medium text-gray-500">关联客户：</span>
                <span className="text-gray-900">
                  {selectedEmail.customer.companyName}
                </span>
              </div>
            )}
          </div>

          <div className="border-t pt-4">
            <h4 className="font-medium text-gray-700 mb-2">
              主题：{selectedEmail.subject || '(无主题)'}
            </h4>
            <div className="border rounded-lg p-4 bg-gray-50 min-h-[200px] max-h-[400px] overflow-y-auto">
              {selectedEmail.bodyHtml ? (
                <div
                  dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }}
                  className="prose prose-sm max-w-none"
                />
              ) : (
                <pre className="text-sm text-gray-700 whitespace-pre-wrap">
                  {selectedEmail.bodyText || '(无内容)'}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </Modal>
  );

  // ==================== Compose Modal ====================
  const renderComposeModal = () => (
    <Modal
      isOpen={composeOpen}
      onClose={() => setComposeOpen(false)}
      title="写邮件"
      size="lg"
    >
      <form onSubmit={handleSendEmail} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            收件人 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={composeForm.toAddr}
            onChange={(e) => setComposeForm({ ...composeForm, toAddr: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="请输入收件人邮箱"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">抄送</label>
            <input
              type="text"
              value={composeForm.cc}
              onChange={(e) => setComposeForm({ ...composeForm, cc: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="抄送邮箱"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">密送</label>
            <input
              type="text"
              value={composeForm.bcc}
              onChange={(e) => setComposeForm({ ...composeForm, bcc: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="密送邮箱"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            主题 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={composeForm.subject}
            onChange={(e) => setComposeForm({ ...composeForm, subject: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="请输入邮件主题"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            关联客户
          </label>
          <select
            value={composeForm.customerId}
            onChange={(e) => setComposeForm({ ...composeForm, customerId: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">不关联客户</option>
            {customers.map((c) => (
              <option key={c.id} value={c.id}>
                {c.companyName}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">正文</label>
          <textarea
            value={composeForm.bodyHtml}
            onChange={(e) => setComposeForm({ ...composeForm, bodyHtml: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={8}
            placeholder="请输入邮件内容（支持 HTML）"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            type="button"
            onClick={() => setComposeOpen(false)}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={sending}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? '发送中...' : '发送'}
          </button>
        </div>
      </form>
    </Modal>
  );

  // ==================== Template Modal ====================
  const renderTemplateModal = () => (
    <Modal
      isOpen={templateModalOpen}
      onClose={() => setTemplateModalOpen(false)}
      title="新建邮件模板"
      size="lg"
    >
      <form onSubmit={handleCreateTemplate} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            模板名称 <span className="text-red-500">*</span>
          </label>
          <input
            type="text"
            value={templateForm.name}
            onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="请输入模板名称"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">主题</label>
          <input
            type="text"
            value={templateForm.subject}
            onChange={(e) => setTemplateForm({ ...templateForm, subject: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="请输入邮件主题"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">分类</label>
          <input
            type="text"
            value={templateForm.category}
            onChange={(e) => setTemplateForm({ ...templateForm, category: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            placeholder="例如：开发信、跟进、报价等"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            模板内容
          </label>
          <textarea
            value={templateForm.bodyHtml}
            onChange={(e) => setTemplateForm({ ...templateForm, bodyHtml: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            rows={8}
            placeholder="请输入模板内容（支持 HTML）"
          />
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            type="button"
            onClick={() => setTemplateModalOpen(false)}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={savingTemplate}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {savingTemplate ? '保存中...' : '保存'}
          </button>
        </div>
      </form>
    </Modal>
  );

  return (
    <AppLayout>
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">邮件中心</h1>
          <div className="flex items-center gap-3">
            <button
              onClick={handleFetchImap}
              className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              收取邮件
            </button>
            <button
              onClick={() => {
                setComposeForm(emptyComposeForm);
                setComposeOpen(true);
              }}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              写邮件
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px space-x-6">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setPage(1);
                }}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Template actions */}
        {activeTab === 'TEMPLATES' && (
          <div className="flex justify-end">
            <button
              onClick={() => {
                setTemplateForm(emptyTemplateForm);
                setTemplateModalOpen(true);
              }}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              + 新建模板
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="text-center py-8 text-gray-500">加载中...</div>
        )}

        {/* Content */}
        {!loading && activeTab !== 'TEMPLATES' && renderEmailList()}
        {activeTab === 'TEMPLATES' && renderTemplates()}

        {/* Modals */}
        {renderDetailModal()}
        {renderComposeModal()}
        {renderTemplateModal()}
      </div>
    </AppLayout>
  );
}
