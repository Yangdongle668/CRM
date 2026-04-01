'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
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
  RECEIVED: { label: '未读', color: 'bg-blue-100 text-blue-800' },
  FAILED: { label: '发送失败', color: 'bg-red-100 text-red-800' },
  READ: { label: '已读', color: 'bg-purple-100 text-purple-800' },
  VIEWED: { label: '客户已读', color: 'bg-green-100 text-green-800' },
};

interface ComposeForm {
  toAddr: string;
  cc: string;
  bcc: string;
  subject: string;
  bodyHtml: string;
  customerId: string;
  inReplyTo: string;
}

const emptyComposeForm: ComposeForm = {
  toAddr: '',
  cc: '',
  bcc: '',
  subject: '',
  bodyHtml: '',
  customerId: '',
  inReplyTo: '',
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

  // Detail panel (split-pane, not modal)
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  // Reply state
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyForm, setReplyForm] = useState<ComposeForm>(emptyComposeForm);
  const [replySending, setReplySending] = useState(false);

  // Compose modal (for new emails)
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeForm, setComposeForm] = useState<ComposeForm>(emptyComposeForm);
  const [sending, setSending] = useState(false);

  // Template modal
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState<TemplateForm>(emptyTemplateForm);
  const [savingTemplate, setSavingTemplate] = useState(false);

  // Unread count for notification
  const [unreadCount, setUnreadCount] = useState(0);
  const prevUnreadRef = useRef(0);

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
      setEmails(Array.isArray(data.items) ? data.items : []);
      setTotal(data.total || 0);
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [activeTab, page, pageSize]);

  const fetchTemplates = useCallback(async () => {
    try {
      const res: any = await emailsApi.getTemplates();
      setTemplates(Array.isArray(res.data) ? res.data : []);
    } catch {
      // handled by interceptor
    }
  }, []);

  const fetchCustomers = useCallback(async () => {
    try {
      const res: any = await customersApi.list({ page: 1, pageSize: 200 });
      setCustomers(Array.isArray(res.data?.items) ? res.data.items : []);
    } catch {
      // handled by interceptor
    }
  }, []);

  // Poll unread count
  const fetchUnreadCount = useCallback(async () => {
    try {
      const res: any = await emailsApi.getUnreadCount();
      const count = res.data?.count ?? 0;
      setUnreadCount(count);
      return count;
    } catch {
      return 0;
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

  // Initial unread count fetch
  useEffect(() => {
    fetchUnreadCount().then((count) => {
      prevUnreadRef.current = count;
    });
  }, [fetchUnreadCount]);

  // Poll for new emails every 60 seconds
  useEffect(() => {
    const interval = setInterval(async () => {
      const count = await fetchUnreadCount();
      if (count > prevUnreadRef.current) {
        const newCount = count - prevUnreadRef.current;
        toast(
          `📬 您有 ${newCount} 封新邮件`,
          {
            duration: 5000,
            style: {
              background: '#3B82F6',
              color: '#fff',
              fontWeight: 600,
              padding: '12px 20px',
              borderRadius: '10px',
              fontSize: '14px',
            },
            icon: '📬',
          }
        );
        // Auto-refresh inbox if currently viewing
        if (activeTab === 'INBOUND') {
          fetchEmails();
        }
      }
      prevUnreadRef.current = count;
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchUnreadCount, activeTab, fetchEmails]);

  // View email detail
  const handleViewEmail = async (email: Email) => {
    setDetailLoading(true);
    setReplyOpen(false);
    try {
      const res: any = await emailsApi.getById(email.id);
      setSelectedEmail(res.data);
      // Mark as read if inbound and unread
      if (email.direction === 'INBOUND' && email.status === 'RECEIVED') {
        await emailsApi.markAsRead(email.id);
        // Update local list
        setEmails((prev) =>
          prev.map((e) =>
            e.id === email.id ? { ...e, status: 'READ' as const } : e
          )
        );
        // Update unread count
        setUnreadCount((prev) => Math.max(0, prev - 1));
        prevUnreadRef.current = Math.max(0, prevUnreadRef.current - 1);
      }
    } catch {
      setSelectedEmail(email);
    } finally {
      setDetailLoading(false);
    }
  };

  // Handle reply
  const handleReply = () => {
    if (!selectedEmail) return;
    const replyTo = selectedEmail.direction === 'INBOUND'
      ? selectedEmail.fromAddr
      : selectedEmail.toAddr;
    const subject = selectedEmail.subject.startsWith('Re:')
      ? selectedEmail.subject
      : `Re: ${selectedEmail.subject}`;

    const quotedContent = `
<br/><br/>
<div style="border-left: 2px solid #ccc; padding-left: 12px; margin-left: 0; color: #666;">
  <p><strong>${selectedEmail.fromAddr}</strong> 于 ${formatTime(selectedEmail.sentAt || selectedEmail.receivedAt || selectedEmail.createdAt)} 写道：</p>
  ${selectedEmail.bodyHtml || `<pre>${selectedEmail.bodyText || ''}</pre>`}
</div>`;

    setReplyForm({
      toAddr: replyTo,
      cc: '',
      bcc: '',
      subject,
      bodyHtml: '',
      customerId: selectedEmail.customerId || '',
      inReplyTo: selectedEmail.id,
    });
    setReplyOpen(true);
  };

  // Send reply
  const handleSendReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replyForm.toAddr.trim()) {
      toast.error('请输入收件人地址');
      return;
    }
    setReplySending(true);

    // Build the reply body with quoted content
    const quotedContent = selectedEmail
      ? `<br/><br/><div style="border-left: 2px solid #ccc; padding-left: 12px; margin-left: 0; color: #666;"><p><strong>${selectedEmail.fromAddr}</strong> 于 ${formatTime(selectedEmail.sentAt || selectedEmail.receivedAt || selectedEmail.createdAt)} 写道：</p>${selectedEmail.bodyHtml || `<pre>${selectedEmail.bodyText || ''}</pre>`}</div>`
      : '';

    try {
      const payload: any = {
        toAddr: replyForm.toAddr,
        subject: replyForm.subject,
        bodyHtml: replyForm.bodyHtml + quotedContent,
        inReplyTo: replyForm.inReplyTo || undefined,
      };
      if (replyForm.cc) payload.cc = replyForm.cc;
      if (replyForm.bcc) payload.bcc = replyForm.bcc;
      if (replyForm.customerId) payload.customerId = replyForm.customerId;

      await emailsApi.send(payload);
      toast.success('回复已发送');
      setReplyOpen(false);
      setReplyForm(emptyComposeForm);
      // Refresh if on outbound
      if (activeTab === 'OUTBOUND') {
        fetchEmails();
      }
    } catch {
      // handled by interceptor
    } finally {
      setReplySending(false);
    }
  };

  // Send new email
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
      fetchUnreadCount();
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

  const formatShortTime = (dateStr?: string) => {
    if (!dateStr) return '-';
    const d = new Date(dateStr);
    const now = new Date();
    const isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString('zh-CN', { month: '2-digit', day: '2-digit' });
  };

  // ==================== Tabs ====================
  const tabs: { key: TabType; label: string; badge?: number }[] = [
    { key: 'INBOUND', label: '收件箱', badge: unreadCount > 0 ? unreadCount : undefined },
    { key: 'OUTBOUND', label: '已发送' },
    { key: 'TEMPLATES', label: '邮件模板' },
  ];

  // ==================== Email List Item ====================
  const renderEmailListItem = (email: Email) => {
    const isSelected = selectedEmail?.id === email.id;
    const isUnread = email.status === 'RECEIVED';
    const addr = activeTab === 'INBOUND' ? email.fromAddr : email.toAddr;
    const time = email.sentAt || email.receivedAt || email.createdAt;

    return (
      <div
        key={email.id}
        onClick={() => handleViewEmail(email)}
        className={`px-4 py-3 cursor-pointer border-b border-gray-100 transition-colors ${
          isSelected
            ? 'bg-blue-50 border-l-2 border-l-blue-600'
            : 'hover:bg-gray-50 border-l-2 border-l-transparent'
        }`}
      >
        <div className="flex items-center justify-between mb-1">
          <span className={`text-sm truncate max-w-[200px] ${isUnread ? 'font-bold text-gray-900' : 'text-gray-700'}`}>
            {addr}
          </span>
          <span className="text-xs text-gray-400 flex-shrink-0 ml-2">{formatShortTime(time)}</span>
        </div>
        <div className={`text-sm truncate ${isUnread ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
          {email.subject || '(无主题)'}
        </div>
        <div className="flex items-center justify-between mt-1">
          <span className="text-xs text-gray-400 truncate max-w-[180px]">
            {email.customer?.companyName || ''}
          </span>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            {isUnread && (
              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
            )}
            {email.direction === 'OUTBOUND' && email.viewedAt && (
              <span className="inline-flex items-center gap-0.5 text-[11px] text-green-600 font-medium">
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                </svg>
                已读
              </span>
            )}
          </div>
        </div>
      </div>
    );
  };

  // ==================== Email Detail Panel ====================
  const renderDetailPanel = () => {
    if (!selectedEmail) {
      return (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <svg className="mx-auto h-16 w-16 text-gray-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <p className="text-sm">选择一封邮件查看详情</p>
          </div>
        </div>
      );
    }

    if (detailLoading) {
      return (
        <div className="flex-1 flex items-center justify-center text-gray-400">
          <div className="text-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent mx-auto mb-3" />
            <p className="text-sm">加载中...</p>
          </div>
        </div>
      );
    }

    return (
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Email header */}
        <div className="px-6 py-4 border-b bg-white flex-shrink-0">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">
            {selectedEmail.subject || '(无主题)'}
          </h2>
          <div className="flex items-start justify-between">
            <div className="space-y-1 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-gray-500 w-16 flex-shrink-0">发件人：</span>
                <span className="font-medium text-gray-900">{selectedEmail.fromAddr}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-gray-500 w-16 flex-shrink-0">收件人：</span>
                <span className="text-gray-700">{selectedEmail.toAddr}</span>
              </div>
              {selectedEmail.cc && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 w-16 flex-shrink-0">抄送：</span>
                  <span className="text-gray-700">{selectedEmail.cc}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <span className="text-gray-500 w-16 flex-shrink-0">时间：</span>
                <span className="text-gray-700">
                  {formatTime(selectedEmail.sentAt || selectedEmail.receivedAt || selectedEmail.createdAt)}
                </span>
              </div>
              {selectedEmail.customer && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 w-16 flex-shrink-0">客户：</span>
                  <span className="text-blue-600">{selectedEmail.customer.companyName}</span>
                </div>
              )}
              {selectedEmail.direction === 'OUTBOUND' && selectedEmail.viewedAt && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 w-16 flex-shrink-0">已读：</span>
                  <span className="text-green-600 font-medium">
                    收件人已读 · {formatTime(selectedEmail.viewedAt)}
                    {selectedEmail.viewCount && selectedEmail.viewCount > 1
                      ? ` · 共打开 ${selectedEmail.viewCount} 次`
                      : ''}
                  </span>
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <Badge className={STATUS_MAP[selectedEmail.status]?.color || 'bg-gray-100 text-gray-800'}>
                {STATUS_MAP[selectedEmail.status]?.label || selectedEmail.status}
              </Badge>
              {selectedEmail.direction === 'OUTBOUND' && selectedEmail.viewedAt && (
                <span className="inline-flex items-center gap-1 text-xs text-green-600 font-medium">
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  对方已读
                </span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 mt-3 pt-3 border-t">
            <button
              onClick={handleReply}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              回复
            </button>
            <button
              onClick={() => {
                if (!selectedEmail) return;
                const fwdSubject = selectedEmail.subject.startsWith('Fwd:')
                  ? selectedEmail.subject
                  : `Fwd: ${selectedEmail.subject}`;
                const fwdBody = `<br/><br/>---------- 转发的邮件 ----------<br/>发件人: ${selectedEmail.fromAddr}<br/>日期: ${formatTime(selectedEmail.sentAt || selectedEmail.receivedAt || selectedEmail.createdAt)}<br/>主题: ${selectedEmail.subject}<br/>收件人: ${selectedEmail.toAddr}<br/><br/>${selectedEmail.bodyHtml || selectedEmail.bodyText || ''}`;
                setComposeForm({
                  ...emptyComposeForm,
                  subject: fwdSubject,
                  bodyHtml: fwdBody,
                  customerId: selectedEmail.customerId || '',
                });
                setComposeOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
              转发
            </button>
          </div>
        </div>

        {/* Email body - scrollable */}
        <div className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50">
          <div className="bg-white rounded-lg border p-6 min-h-[300px]">
            {selectedEmail.bodyHtml ? (
              <div
                dangerouslySetInnerHTML={{ __html: selectedEmail.bodyHtml }}
                className="prose prose-sm max-w-none"
              />
            ) : (
              <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                {selectedEmail.bodyText || '(无内容)'}
              </pre>
            )}
          </div>
        </div>

        {/* Inline reply form */}
        {replyOpen && (
          <div className="border-t bg-white flex-shrink-0 px-6 py-4">
            <form onSubmit={handleSendReply} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold text-gray-700">回复邮件</h3>
                <button
                  type="button"
                  onClick={() => setReplyOpen(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center gap-4 text-sm">
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-gray-500 flex-shrink-0">收件人：</span>
                  <input
                    type="text"
                    value={replyForm.toAddr}
                    onChange={(e) => setReplyForm({ ...replyForm, toAddr: e.target.value })}
                    className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex items-center gap-2 flex-1">
                  <span className="text-gray-500 flex-shrink-0">抄送：</span>
                  <input
                    type="text"
                    value={replyForm.cc}
                    onChange={(e) => setReplyForm({ ...replyForm, cc: e.target.value })}
                    className="flex-1 border border-gray-300 rounded px-2 py-1 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="可选"
                  />
                </div>
              </div>

              <textarea
                value={replyForm.bodyHtml}
                onChange={(e) => setReplyForm({ ...replyForm, bodyHtml: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-1 focus:ring-blue-500 focus:border-blue-500 resize-none"
                rows={4}
                placeholder="输入回复内容..."
                autoFocus
              />

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setReplyOpen(false)}
                  className="px-3 py-1.5 text-sm text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200"
                >
                  取消
                </button>
                <button
                  type="submit"
                  disabled={replySending}
                  className="px-4 py-1.5 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {replySending ? '发送中...' : '发送回复'}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  };

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

  // ==================== Compose Modal ====================
  const renderComposeModal = () => (
    <Modal
      isOpen={composeOpen}
      onClose={() => setComposeOpen(false)}
      title="写邮件"
      size="3xl"
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
            rows={12}
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
      size="3xl"
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
            rows={10}
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
      <div className="flex flex-col h-[calc(100vh-64px)]">
        {/* Header */}
        <div className="flex items-center justify-between px-0 py-4 flex-shrink-0">
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
        <div className="border-b border-gray-200 flex-shrink-0">
          <nav className="flex -mb-px space-x-6">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => {
                  setActiveTab(tab.key);
                  setPage(1);
                  setSelectedEmail(null);
                  setReplyOpen(false);
                }}
                className={`pb-3 px-1 text-sm font-medium border-b-2 transition-colors relative ${
                  activeTab === tab.key
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                {tab.label}
                {tab.badge && (
                  <span className="ml-1.5 inline-flex items-center justify-center px-1.5 py-0.5 text-xs font-bold text-white bg-red-500 rounded-full min-w-[18px]">
                    {tab.badge > 99 ? '99+' : tab.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        </div>

        {/* Template actions */}
        {activeTab === 'TEMPLATES' && (
          <div className="flex justify-end py-3 flex-shrink-0">
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

        {/* Content */}
        {activeTab === 'TEMPLATES' ? (
          <div className="flex-1 overflow-y-auto py-2">
            {renderTemplates()}
          </div>
        ) : (
          /* Split pane layout for inbox/outbound */
          <div className="flex flex-1 mt-3 bg-white rounded-lg shadow overflow-hidden border">
            {/* Left panel: email list */}
            <div className="w-[380px] flex flex-col border-r bg-white flex-shrink-0">
              {/* List */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="text-center py-12 text-gray-400">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mx-auto mb-2" />
                    加载中...
                  </div>
                ) : emails.length === 0 ? (
                  <div className="text-center py-12 text-gray-400 text-sm">
                    暂无邮件
                  </div>
                ) : (
                  emails.map((email) => renderEmailListItem(email))
                )}
              </div>

              {/* Pagination */}
              {total > pageSize && (
                <div className="flex items-center justify-between px-3 py-2 border-t text-xs flex-shrink-0">
                  <span className="text-gray-500">共 {total} 封</span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page <= 1}
                      className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      上一页
                    </button>
                    <span className="px-2 py-1 text-gray-500">
                      {page}/{Math.ceil(total / pageSize)}
                    </span>
                    <button
                      onClick={() => setPage((p) => p + 1)}
                      disabled={page * pageSize >= total}
                      className="px-2 py-1 border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      下一页
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right panel: email detail */}
            <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
              {renderDetailPanel()}
            </div>
          </div>
        )}

        {/* Modals */}
        {renderComposeModal()}
        {renderTemplateModal()}
      </div>
    </AppLayout>
  );
}
