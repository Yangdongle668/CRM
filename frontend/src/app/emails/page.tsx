'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import { emailsApi, customersApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import type { Email, EmailTemplate, EmailThreadItem, Customer } from '@/types';
import toast from 'react-hot-toast';

type FolderType = 'inbox' | 'unread' | 'sent' | 'customer' | 'advertisement' | 'templates' | 'settings';

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

interface AccountForm {
  emailAddr: string;
  fromName: string;
  signature: string;
  smtpHost: string;
  smtpPort: string;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: string;
  imapUser: string;
  imapPass: string;
  imapSecure: boolean;
}

const emptyAccountForm: AccountForm = {
  emailAddr: '',
  fromName: '',
  signature: '',
  smtpHost: '',
  smtpPort: '465',
  smtpUser: '',
  smtpPass: '',
  smtpSecure: true,
  imapHost: '',
  imapPort: '993',
  imapUser: '',
  imapPass: '',
  imapSecure: true,
};

export default function EmailsPage() {
  const { user } = useAuth();
  const [activeFolder, setActiveFolder] = useState<FolderType>('inbox');
  const [emails, setEmails] = useState<Email[]>([]);
  const [threads, setThreads] = useState<EmailThreadItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [loading, setLoading] = useState(false);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [templates, setTemplates] = useState<EmailTemplate[]>([]);
  const [signature, setSignature] = useState<string>('');

  // Multi-account support
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [showAccountManager, setShowAccountManager] = useState(false);

  // Detail panel (split-pane, not modal)
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [threadEmails, setThreadEmails] = useState<Email[]>([]);
  const [viewingThreadEmailId, setViewingThreadEmailId] = useState<string | null>(null);
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

  // Account manager form
  const [accountForm, setAccountForm] = useState<AccountForm>(emptyAccountForm);
  const [accountSaving, setAccountSaving] = useState(false);
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);
  const [testingAccountId, setTestingAccountId] = useState<string | null>(null);

  // Unread count for notification
  const [unreadCount, setUnreadCount] = useState(0);
  const prevUnreadRef = useRef(0);
  const accountsInitialized = useRef(false);

  // Load email accounts
  const loadAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try {
      const res: any = await emailsApi.listAccounts();
      const accts = res.data?.accounts || [];
      setAccounts(accts);
      if (!accountsInitialized.current && accts.length > 0) {
        setSelectedAccountId(accts[0].id);
        accountsInitialized.current = true;
      }
    } catch {
      // handled by interceptor
    } finally {
      setAccountsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAccounts();
  }, [loadAccounts]);

  // Fetch emails with account filter
  const fetchEmails = useCallback(async () => {
    if (activeFolder === 'templates' || activeFolder === 'settings') return;
    setLoading(true);
    try {
      const params: Record<string, any> = {
        page,
        pageSize,
        grouped: 'true',
        emailConfigId: selectedAccountId || undefined,
      };

      switch (activeFolder) {
        case 'inbox':
          params.category = 'inbox';
          params.direction = 'INBOUND';
          break;
        case 'unread':
          params.status = 'RECEIVED';
          params.category = 'inbox';
          params.direction = 'INBOUND';
          break;
        case 'sent':
          params.direction = 'OUTBOUND';
          break;
        case 'customer':
          params.category = 'customer';
          break;
        case 'advertisement':
          params.category = 'advertisement';
          break;
      }

      const res: any = await emailsApi.list(params);
      const data = res.data;
      const items = Array.isArray(data.items) ? data.items : [];
      setThreads(items);
      setEmails(items.map((t: EmailThreadItem) => t.latestEmail).filter(Boolean));
      setTotal(data.total || 0);
    } catch {
      // handled by interceptor
    } finally {
      setLoading(false);
    }
  }, [activeFolder, page, pageSize, selectedAccountId]);

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
    if (activeFolder === 'templates') {
      fetchTemplates();
    } else if (activeFolder !== 'settings') {
      fetchEmails();
    }
  }, [activeFolder, fetchEmails, fetchTemplates]);

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
        if (activeFolder === 'inbox' || activeFolder === 'unread') {
          fetchEmails();
        }
      }
      prevUnreadRef.current = count;
    }, 60000);

    return () => clearInterval(interval);
  }, [fetchUnreadCount, activeFolder, fetchEmails]);

  // View email detail (with thread loading)
  const handleViewEmail = async (email: Email, threadId?: string | null) => {
    setDetailLoading(true);
    setReplyOpen(false);
    setThreadEmails([]);
    setViewingThreadEmailId(null);
    try {
      const res: any = await emailsApi.getById(email.id);
      const emailData = res.data;
      setSelectedEmail(emailData);
      setViewingThreadEmailId(emailData.id);

      // Load thread emails if this email belongs to a thread
      const tId = threadId || emailData.threadId;
      if (tId) {
        try {
          const threadRes: any = await emailsApi.getThreadEmails(tId);
          const tEmails = Array.isArray(threadRes.data) ? threadRes.data : [];
          setThreadEmails(tEmails);
        } catch {
          // thread load failed, ignore
        }
      }

      // Mark as read if inbound and unread
      if (email.direction === 'INBOUND' && email.status === 'RECEIVED') {
        await emailsApi.markAsRead(email.id);
        // Update local thread list
        setThreads((prev) =>
          prev.map((t) => {
            if (t.latestEmail?.id === email.id) {
              return { ...t, latestEmail: { ...t.latestEmail, status: 'READ' as const } };
            }
            return t;
          })
        );
        setEmails((prev) =>
          prev.map((e) =>
            e.id === email.id ? { ...e, status: 'READ' as const } : e
          )
        );
        setUnreadCount((prev) => Math.max(0, prev - 1));
        prevUnreadRef.current = Math.max(0, prevUnreadRef.current - 1);
      }
    } catch {
      setSelectedEmail(email);
    } finally {
      setDetailLoading(false);
    }
  };

  // Switch to a different email within a thread
  const handleViewThreadEmail = async (email: Email) => {
    setViewingThreadEmailId(email.id);
    try {
      const res: any = await emailsApi.getById(email.id);
      setSelectedEmail(res.data);
    } catch {
      setSelectedEmail(email);
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

    const sigBlock = signature ? `<br/><br/>--<br/>${signature}` : '';
    setReplyForm({
      toAddr: replyTo,
      cc: '',
      bcc: '',
      subject,
      bodyHtml: sigBlock,
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
      if (activeFolder === 'sent') {
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
      if (activeFolder === 'sent') {
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
      const res: any = await emailsApi.fetch();
      const data = res.data;
      const total = data?.totalFetched ?? 0;
      const accountResults: any[] = data?.accounts || [];
      const errored = accountResults.filter((a: any) => a.error);
      if (errored.length > 0) {
        toast.error(`${errored.length} 个账户收取失败，共收取 ${total} 封`, { id: 'fetch-email' });
      } else {
        toast.success(`邮件收取完成，共收取 ${total} 封新邮件`, { id: 'fetch-email' });
      }
      fetchEmails();
      fetchUnreadCount();
    } catch {
      toast.error('邮件收取失败', { id: 'fetch-email' });
    }
  };

  // Mark all as read
  const handleMarkAllRead = async () => {
    try {
      await emailsApi.markAllAsRead();
      toast.success('已全部标记为已读');
      setUnreadCount(0);
      prevUnreadRef.current = 0;
      fetchEmails();
    } catch {
      toast.error('操作失败');
    }
  };

  // Save email account (create or update)
  const handleSaveAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountForm.emailAddr.trim()) { toast.error('请输入邮箱地址'); return; }
    if (!accountForm.smtpHost.trim()) { toast.error('请输入 SMTP 服务器地址'); return; }
    if (!accountForm.smtpUser.trim()) { toast.error('请输入 SMTP 用户名'); return; }
    if (!editingAccountId && !accountForm.smtpPass.trim()) { toast.error('请输入 SMTP 密码'); return; }
    if (!accountForm.imapHost.trim()) { toast.error('请输入 IMAP 服务器地址'); return; }
    if (!accountForm.imapUser.trim()) { toast.error('请输入 IMAP 用户名'); return; }
    if (!editingAccountId && !accountForm.imapPass.trim()) { toast.error('请输入 IMAP 密码'); return; }

    setAccountSaving(true);
    try {
      const payload = {
        ...accountForm,
        smtpPort: Number(accountForm.smtpPort) || 465,
        imapPort: Number(accountForm.imapPort) || 993,
      };
      if (editingAccountId) {
        await emailsApi.updateAccount(editingAccountId, payload);
        toast.success('邮箱账户已更新');
      } else {
        await emailsApi.createAccount(payload);
        toast.success('邮箱账户已添加');
      }
      setShowAccountManager(false);
      setAccountForm(emptyAccountForm);
      setEditingAccountId(null);
      await loadAccounts();
    } catch {
      // handled by interceptor
    } finally {
      setAccountSaving(false);
    }
  };

  // Test SMTP connection for an account
  const handleTestAccount = async (id: string) => {
    setTestingAccountId(id);
    try {
      const res: any = await emailsApi.testAccount(id);
      const data = res.data;
      if (data?.success) {
        toast.success('SMTP 连接测试成功');
      } else {
        toast.error(data?.message || 'SMTP 连接失败');
      }
    } catch {
      // handled by interceptor
    } finally {
      setTestingAccountId(null);
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

  // ==================== Sidebar Folders ====================
  const folders: { key: FolderType; label: string; icon: string; badge?: number }[] = [
    { key: 'inbox', label: '收件箱', icon: 'inbox', badge: unreadCount > 0 ? unreadCount : undefined },
    { key: 'unread', label: '未读邮件', icon: 'unread' },
    { key: 'sent', label: '已发送', icon: 'sent' },
    { key: 'customer', label: '客户', icon: 'customer' },
    { key: 'advertisement', label: '广告邮件', icon: 'advertisement' },
    { key: 'templates', label: '邮件模板', icon: 'templates' },
    { key: 'settings', label: '邮箱设置', icon: 'settings' },
  ];

  const folderIcons: Record<string, React.ReactNode> = {
    inbox: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
    ),
    unread: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    ),
    sent: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
      </svg>
    ),
    templates: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
    ),
    customer: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.856-1.487M15 6a3 3 0 11-6 0 3 3 0 016 0zM15 13H9m4 0h6m-6 0a6 6 0 11-12 0 6 6 0 0112 0z" />
      </svg>
    ),
    advertisement: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
    settings: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  };

  // ==================== Thread List Item ====================
  const renderThreadListItem = (thread: EmailThreadItem) => {
    const email = thread.latestEmail;
    if (!email) return null;
    const isSelected = selectedEmail?.id === email.id;
    const isUnread = email.status === 'RECEIVED';
    const addr = (activeFolder === 'inbox' || activeFolder === 'unread') ? email.fromAddr : email.toAddr;
    const time = email.sentAt || email.receivedAt || email.createdAt;

    return (
      <div
        key={thread.threadId || email.id}
        onClick={() => handleViewEmail(email, thread.threadId)}
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
          <div className="flex items-center gap-1.5 flex-shrink-0 ml-2">
            {thread.emailCount > 1 && (
              <span className="inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-semibold text-gray-500 bg-gray-100 rounded-full min-w-[20px]">
                {thread.emailCount}
              </span>
            )}
            <span className="text-xs text-gray-400">{formatShortTime(time)}</span>
          </div>
        </div>
        <div className={`text-sm truncate ${isUnread ? 'font-semibold text-gray-900' : 'text-gray-600'}`}>
          {thread.threadSubject || email.subject || '(无主题)'}
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

        {/* Email body - scrollable, with thread conversation */}
        <div className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50">
          {/* Thread conversation list */}
          {threadEmails.length > 1 && (
            <div className="mb-4">
              <div className="text-xs font-medium text-gray-500 mb-2">
                此会话共 {threadEmails.length} 封邮件
              </div>
              <div className="space-y-1">
                {threadEmails.map((te) => {
                  const isViewing = viewingThreadEmailId === te.id;
                  const teTime = te.sentAt || te.receivedAt || te.createdAt;
                  const isInbound = te.direction === 'INBOUND';
                  return (
                    <div
                      key={te.id}
                      onClick={() => handleViewThreadEmail(te)}
                      className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer text-sm transition-colors ${
                        isViewing
                          ? 'bg-blue-50 border border-blue-200'
                          : 'bg-white border border-gray-100 hover:bg-gray-50'
                      }`}
                    >
                      <span className={`inline-block w-1.5 h-1.5 rounded-full flex-shrink-0 ${isInbound ? 'bg-blue-400' : 'bg-green-400'}`} />
                      <span className={`truncate flex-1 ${isViewing ? 'font-medium text-gray-900' : 'text-gray-600'}`}>
                        {isInbound ? te.fromAddr : te.toAddr}
                      </span>
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {formatShortTime(teTime)}
                      </span>
                      {te.status === 'RECEIVED' && (
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-600 flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Current email body */}
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

  // ==================== Account Manager Modal ====================
  const renderAccountManagerModal = () => (
    <Modal
      isOpen={showAccountManager}
      onClose={() => {
        setShowAccountManager(false);
        setAccountForm(emptyAccountForm);
        setEditingAccountId(null);
      }}
      title={editingAccountId ? '编辑邮箱账户' : '添加邮箱账户'}
      size="3xl"
    >
      <form onSubmit={handleSaveAccount} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              邮箱地址 <span className="text-red-500">*</span>
            </label>
            <input
              type="email"
              value={accountForm.emailAddr}
              onChange={(e) => setAccountForm({ ...accountForm, emailAddr: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50"
              placeholder="your@email.com"
              disabled={!!editingAccountId}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">发件人名称</label>
            <input
              type="text"
              value={accountForm.fromName}
              onChange={(e) => setAccountForm({ ...accountForm, fromName: e.target.value })}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              placeholder="例如：张三"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">邮件签名</label>
          <textarea
            value={accountForm.signature}
            onChange={(e) => setAccountForm({ ...accountForm, signature: e.target.value })}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            rows={2}
            placeholder="发送邮件时自动附加的签名内容"
          />
        </div>

        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">SMTP 发件服务器</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                服务器地址 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={accountForm.smtpHost}
                onChange={(e) => setAccountForm({ ...accountForm, smtpHost: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="smtp.example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">端口</label>
              <input
                type="number"
                value={accountForm.smtpPort}
                onChange={(e) => setAccountForm({ ...accountForm, smtpPort: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="465"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                用户名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={accountForm.smtpUser}
                onChange={(e) => setAccountForm({ ...accountForm, smtpUser: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="your@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                密码{editingAccountId ? '（留空则保持不变）' : <span className="text-red-500"> *</span>}
              </label>
              <input
                type="password"
                value={accountForm.smtpPass}
                onChange={(e) => setAccountForm({ ...accountForm, smtpPass: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
          </div>
          <div className="mt-2">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={accountForm.smtpSecure}
                onChange={(e) => setAccountForm({ ...accountForm, smtpSecure: e.target.checked })}
                className="rounded border-gray-300"
              />
              使用 SSL/TLS 加密（推荐）
            </label>
          </div>
        </div>

        <div className="border-t pt-4">
          <h3 className="text-sm font-semibold text-gray-800 mb-3">IMAP 收件服务器</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                服务器地址 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={accountForm.imapHost}
                onChange={(e) => setAccountForm({ ...accountForm, imapHost: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="imap.example.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">端口</label>
              <input
                type="number"
                value={accountForm.imapPort}
                onChange={(e) => setAccountForm({ ...accountForm, imapPort: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="993"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                用户名 <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={accountForm.imapUser}
                onChange={(e) => setAccountForm({ ...accountForm, imapUser: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="your@email.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                密码{editingAccountId ? '（留空则保持不变）' : <span className="text-red-500"> *</span>}
              </label>
              <input
                type="password"
                value={accountForm.imapPass}
                onChange={(e) => setAccountForm({ ...accountForm, imapPass: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="••••••••"
              />
            </div>
          </div>
          <div className="mt-2">
            <label className="inline-flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={accountForm.imapSecure}
                onChange={(e) => setAccountForm({ ...accountForm, imapSecure: e.target.checked })}
                className="rounded border-gray-300"
              />
              使用 SSL/TLS 加密（推荐）
            </label>
          </div>
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t">
          <button
            type="button"
            onClick={() => {
              setShowAccountManager(false);
              setAccountForm(emptyAccountForm);
              setEditingAccountId(null);
            }}
            className="px-4 py-2 text-sm text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
          >
            取消
          </button>
          <button
            type="submit"
            disabled={accountSaving}
            className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {accountSaving ? '保存中...' : '保存账户'}
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
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900">邮件中心</h1>
            {accounts.length > 0 && (
              <select
                value={selectedAccountId || ''}
                onChange={(e) => {
                  setSelectedAccountId(e.target.value);
                  setPage(1);
                  setSelectedEmail(null);
                }}
                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">全部账户</option>
                {accounts.map((acct: any) => (
                  <option key={acct.id} value={acct.id}>
                    {acct.emailAddr}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleFetchImap}
              className="px-4 py-2 text-sm text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
            >
              收取邮件
            </button>
            <button
              onClick={() => {
                const body = signature ? `<br/><br/>--<br/>${signature}` : '';
                setComposeForm({ ...emptyComposeForm, bodyHtml: body });
                setComposeOpen(true);
              }}
              className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              写邮件
            </button>
          </div>
        </div>

        {/* Main 3-column layout: sidebar | email list | detail */}
        <div className="flex flex-1 bg-white rounded-lg shadow overflow-hidden border">
          {/* Folder sidebar */}
          <aside className="w-[200px] bg-gray-50 border-r flex-shrink-0 flex flex-col">
            <nav className="py-2 flex-1">
              {folders.map((folder) => (
                <button
                  key={folder.key}
                  onClick={() => {
                    setActiveFolder(folder.key);
                    setPage(1);
                    setSelectedEmail(null);
                    setReplyOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-sm transition-colors ${
                    activeFolder === folder.key
                      ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <span className="flex-shrink-0">{folderIcons[folder.icon]}</span>
                  <span className="flex-1 text-left truncate">{folder.label}</span>
                  {folder.badge && folder.badge > 0 && (
                    <span className="text-[11px] bg-red-500 text-white rounded-full px-1.5 py-0.5 min-w-[18px] text-center font-bold">
                      {folder.badge > 99 ? '99+' : folder.badge}
                    </span>
                  )}
                </button>
              ))}
            </nav>
          </aside>

          {/* Content area */}
          {activeFolder === 'settings' ? (
            <div className="flex-1 overflow-y-auto p-6">
              <div className="max-w-2xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-semibold text-gray-900">邮箱账户管理</h2>
                  <button
                    onClick={() => setShowAccountManager(true)}
                    className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                  >
                    + 添加邮箱账户
                  </button>
                </div>
                {accountsLoading ? (
                  <div className="text-center py-12 text-gray-400">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mx-auto mb-2" />
                    加载中...
                  </div>
                ) : accounts.length === 0 ? (
                  <div className="text-center py-12 text-gray-400">
                    <p className="mb-4">暂无邮箱账户</p>
                    <button
                      onClick={() => setShowAccountManager(true)}
                      className="px-4 py-2 text-sm text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                    >
                      添加第一个邮箱
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {accounts.map((acct: any) => (
                      <div key={acct.id} className="bg-white rounded-lg border p-4 flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="font-medium text-gray-900">{acct.emailAddr}</p>
                            {selectedAccountId === acct.id && (
                              <span className="text-[10px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded font-medium">当前使用</span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">{acct.fromName || '(未设置发件人名称)'}</p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleTestAccount(acct.id)}
                            disabled={testingAccountId === acct.id}
                            className="px-3 py-1 text-xs text-gray-600 hover:text-gray-800 border border-gray-200 rounded hover:bg-gray-50 disabled:opacity-50"
                          >
                            {testingAccountId === acct.id ? '测试中...' : '测试连接'}
                          </button>
                          <button
                            onClick={() => {
                              setAccountForm({
                                ...emptyAccountForm,
                                emailAddr: acct.emailAddr,
                                fromName: acct.fromName || '',
                              });
                              setEditingAccountId(acct.id);
                              setShowAccountManager(true);
                            }}
                            className="px-3 py-1 text-xs text-blue-600 hover:text-blue-800"
                          >
                            编辑
                          </button>
                          <button
                            onClick={() => {
                              setSelectedAccountId(acct.id);
                              setActiveFolder('inbox');
                            }}
                            className="px-3 py-1 text-xs text-green-600 hover:text-green-800"
                          >
                            使用
                          </button>
                          <button
                            onClick={() =>
                              emailsApi.deleteAccount(acct.id).then(() => {
                                setAccounts(accounts.filter((a: any) => a.id !== acct.id));
                                if (selectedAccountId === acct.id) setSelectedAccountId(null);
                                toast.success('账户已删除');
                              })
                            }
                            className="px-3 py-1 text-xs text-red-600 hover:text-red-800"
                          >
                            删除
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : activeFolder === 'templates' ? (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex justify-end mb-3">
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
              {renderTemplates()}
            </div>
          ) : (
            <>
              {/* Email list panel */}
              <div className="w-[350px] flex flex-col border-r bg-white flex-shrink-0">
                {/* List header with mark-all-read */}
                {(activeFolder === 'inbox' || activeFolder === 'unread') && unreadCount > 0 && (
                  <div className="flex items-center justify-end px-3 py-2 border-b flex-shrink-0">
                    <button
                      onClick={handleMarkAllRead}
                      className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800 font-medium"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      全部标记已读
                    </button>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto">
                  {loading ? (
                    <div className="text-center py-12 text-gray-400">
                      <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent mx-auto mb-2" />
                      加载中...
                    </div>
                  ) : threads.length === 0 ? (
                    <div className="text-center py-12 text-gray-400 text-sm">
                      暂无邮件
                    </div>
                  ) : (
                    threads.map((thread) => renderThreadListItem(thread))
                  )}
                </div>

                {/* Pagination */}
                {total > pageSize && (
                  <div className="flex items-center justify-between px-3 py-2 border-t text-xs flex-shrink-0">
                    <span className="text-gray-500">共 {total} 个会话</span>
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

              {/* Detail panel */}
              <div className="flex-1 flex flex-col overflow-hidden bg-gray-50">
                {renderDetailPanel()}
              </div>
            </>
          )}
        </div>

        {/* Modals */}
        {renderComposeModal()}
        {renderTemplateModal()}
        {renderAccountManagerModal()}
      </div>
    </AppLayout>
  );
}
