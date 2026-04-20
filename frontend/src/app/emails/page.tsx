'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/layout/AppLayout';
import Modal from '@/components/ui/Modal';
import Badge from '@/components/ui/Badge';
import EmailTrackingPanel from '@/components/emails/EmailTrackingPanel';
import SignatureEditor from '@/components/emails/SignatureEditor';
import ComposeWindow, { ComposeAttachment } from '@/components/emails/ComposeWindow';
import { emailsApi, customersApi, translateApi } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import type { Email, EmailAttachment, EmailTemplate, EmailThreadItem, Customer } from '@/types';
import toast from 'react-hot-toast';

type FolderType = 'inbox' | 'unread' | 'sent' | 'customer' | 'advertisement' | 'trash' | 'spam' | 'templates' | 'settings';

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
  attachments: ComposeAttachment[];
}

const emptyComposeForm: ComposeForm = {
  toAddr: '',
  cc: '',
  bcc: '',
  subject: '',
  bodyHtml: '',
  customerId: '',
  inReplyTo: '',
  attachments: [],
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

/**
 * 单独把 useSearchParams 封进一个子组件，父页面用 <Suspense> 包它。
 * Next.js 14 静态生成时遇到 useSearchParams 必须有 Suspense 边界，
 * 否则会在 build 阶段报 "missing-suspense-with-csr-bailout"。
 */
function ComposeToWatcher({ onOpen }: { onOpen: (to: string) => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  useEffect(() => {
    const to = searchParams.get('composeTo');
    if (!to) return;
    onOpen(to);
    // 清理 URL，避免刷新后重复弹出。
    router.replace('/emails');
    // 只在挂载时执行一次即可。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

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

  // Multi-account support
  const [accounts, setAccounts] = useState<any[]>([]);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [accountsLoading, setAccountsLoading] = useState(false);
  const [showAccountManager, setShowAccountManager] = useState(false);
  // Tree-view expansion state — which account branches are open in the
  // sidebar. Defaults to "all expanded" once accounts load.
  const [expandedAccounts, setExpandedAccounts] = useState<Set<string>>(new Set());

  // Detail panel (split-pane, not modal)
  const [selectedEmail, setSelectedEmail] = useState<Email | null>(null);
  const [threadEmails, setThreadEmails] = useState<Email[]>([]);
  const [viewingThreadEmailId, setViewingThreadEmailId] = useState<string | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  // Tracking + signature modals
  const [trackingForEmailId, setTrackingForEmailId] = useState<string | null>(null);
  const [signatureForAccount, setSignatureForAccount] =
    useState<{ id: string; emailAddr: string } | null>(null);

  // Translation — tracks which email has been translated inline.
  // When translated, the HTML body text nodes are replaced in-place.
  const [translatedEmailId, setTranslatedEmailId] = useState<string | null>(null);
  const [originalHtml, setOriginalHtml] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);

  // Compose window state（新邮件 + 回复 + 转发 都复用同一个窗口）
  const [composeOpen, setComposeOpen] = useState(false);
  const [composeForm, setComposeForm] = useState<ComposeForm>(emptyComposeForm);
  const [sending, setSending] = useState(false);

  // ?composeTo=xxx 的处理见 <ComposeToWatcher /> —— 单独放一层 Suspense
  // 以满足 Next.js 14 对 useSearchParams 的预渲染要求。

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
      // Expand all accounts in the sidebar tree by default, so the user
      // immediately sees their inboxes without having to click chevrons.
      setExpandedAccounts((prev) => {
        if (prev.size > 0) return prev; // preserve manual collapse state
        return new Set(accts.map((a: any) => a.id));
      });
      accountsInitialized.current = true;
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
        case 'trash':
          params.category = 'trash';
          break;
        case 'spam':
          params.category = 'spam';
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

  // Reset translation state when switching emails. If the previous email
  // was translated, restore its original HTML before leaving.
  useEffect(() => {
    setTranslatedEmailId(null);
    setOriginalHtml(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEmail?.id]);

  // Esc key closes the slide-in detail panel.
  useEffect(() => {
    if (!selectedEmail) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedEmail(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedEmail]);

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
    // Toggle: click the same item again to collapse it
    if (viewingThreadEmailId === email.id) {
      setViewingThreadEmailId(null);
      return;
    }
    setViewingThreadEmailId(email.id);
    try {
      const res: any = await emailsApi.getById(email.id);
      setSelectedEmail(res.data);
    } catch {
      setSelectedEmail(email);
    }
  };

  // 回复 —— 复用同一个 ComposeWindow，预先把被引用的原邮件放进正文
  // （用 data-role="quoted" 标记），之后 ComposeWindow 会自动在 quoted
  // 之前插入签名，布局是"回复正文 → 签名 → 引用原文"。
  const buildQuotedBlock = (email: Email) =>
    `<br/><br/><div data-role="quoted" style="border-left:2px solid #ccc;padding-left:12px;margin-left:0;color:#666;"><p><strong>${email.fromAddr}</strong> 于 ${formatTime(email.sentAt || email.receivedAt || email.createdAt)} 写道：</p>${email.bodyHtml || `<pre>${email.bodyText || ''}</pre>`}</div>`;

  const handleReply = () => {
    if (!selectedEmail) return;
    const replyTo =
      selectedEmail.direction === 'INBOUND'
        ? selectedEmail.fromAddr
        : selectedEmail.toAddr;
    const subject = selectedEmail.subject.startsWith('Re:')
      ? selectedEmail.subject
      : `Re: ${selectedEmail.subject}`;

    setComposeForm({
      toAddr: replyTo,
      cc: '',
      bcc: '',
      subject,
      bodyHtml: buildQuotedBlock(selectedEmail),
      customerId: selectedEmail.customerId || '',
      inReplyTo: selectedEmail.id,
      attachments: [],
    });
    setComposeOpen(true);
  };

  // 从 "Name <user@example.com>" 或 "user@example.com" 中提取纯邮箱地址。
  const extractEmailOnly = (raw: string): string => {
    const m = raw.match(/<([^>]+)>/);
    return (m ? m[1] : raw).trim();
  };

  // 原 To / Cc 里除主要回复人和我自己以外的所有去重收件人；
  // 用于判断是否要显示"回复所有"按钮，以及点了之后预填 Cc。
  const getReplyAllCc = (): { cc: string; primaryTo: string } | null => {
    if (!selectedEmail) return null;
    const myEmail = (user?.email || '').toLowerCase();
    const primaryTo =
      selectedEmail.direction === 'INBOUND'
        ? selectedEmail.fromAddr
        : selectedEmail.toAddr;
    const primaryEmail = extractEmailOnly(primaryTo || '').toLowerCase();

    const excluded = new Set<string>();
    if (primaryEmail) excluded.add(primaryEmail);
    if (myEmail) excluded.add(myEmail);

    const seen = new Set<string>(excluded);
    const keep: string[] = [];
    const pushFrom = (raw?: string | null) => {
      if (!raw) return;
      for (const part of raw.split(',')) {
        const addr = part.trim();
        if (!addr) continue;
        const e = extractEmailOnly(addr).toLowerCase();
        if (!e || seen.has(e)) continue;
        seen.add(e);
        keep.push(addr);
      }
    };
    // INBOUND 时 toAddr 里一般也只有我自己（会被 myEmail 过滤掉）；
    // OUTBOUND 时 toAddr 是对方，已经进了 primary，继续扫描只留 cc。
    pushFrom(selectedEmail.toAddr);
    pushFrom(selectedEmail.cc);

    return { cc: keep.join(', '), primaryTo };
  };

  const canReplyAll = (() => {
    const r = getReplyAllCc();
    return !!(r && r.cc.length > 0);
  })();

  const handleReplyAll = () => {
    const r = getReplyAllCc();
    if (!selectedEmail || !r) return;
    const subject = selectedEmail.subject.startsWith('Re:')
      ? selectedEmail.subject
      : `Re: ${selectedEmail.subject}`;

    setComposeForm({
      toAddr: r.primaryTo,
      cc: r.cc,
      bcc: '',
      subject,
      bodyHtml: buildQuotedBlock(selectedEmail),
      customerId: selectedEmail.customerId || '',
      inReplyTo: selectedEmail.id,
      attachments: [],
    });
    setComposeOpen(true);
  };

  // 发送新邮件的逻辑已经移到 ComposeWindow 的 onSend 回调里
  // （renderComposeModal），那边能直接访问最新的 composeForm 和
  // skipSignatureAppend 标志。

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

  /**
   * One-click translate: extract text segments from the currently
   * visible email's HTML (skipping images / tags), send as JSON to
   * the backend, then replace the original text nodes in-place.
   *
   * Works in BOTH views:
   *   - Single-email view: modifies `selectedEmail.bodyHtml`.
   *   - Thread (accordion) view: also updates the matching entry in
   *     `threadEmails`, since that's what actually renders in the UI.
   *
   * The "target" email is picked as:
   *   1. The expanded thread email (`viewingThreadEmailId`) when in
   *      thread view.
   *   2. Otherwise `selectedEmail`.
   * Click the button again to restore the original HTML.
   */
  const handleTranslate = async () => {
    if (!selectedEmail) return;

    // Figure out which email the button should act on. In thread view
    // it's the one the user currently has expanded.
    const inThreadView = threadEmails.length > 1;
    const targetId = inThreadView && viewingThreadEmailId
      ? viewingThreadEmailId
      : selectedEmail.id;
    const targetEmail = inThreadView
      ? threadEmails.find((e) => e.id === targetId) || selectedEmail
      : selectedEmail;

    // Toggle: restore original if this same email is already translated
    if (translatedEmailId === targetId && originalHtml) {
      applyHtmlToEmail(targetId, originalHtml);
      setTranslatedEmailId(null);
      setOriginalHtml(null);
      return;
    }

    const html = targetEmail.bodyHtml || '';
    const text = targetEmail.bodyText || '';
    if (!html && !text) {
      toast.error('邮件正文为空');
      return;
    }

    // Parse into a temporary DOM, extract text nodes, skip images etc.
    const parser = new DOMParser();
    const doc = parser.parseFromString(
      html || `<pre>${text}</pre>`,
      'text/html',
    );
    const segments: { index: number; text: string; node: Text }[] = [];
    let idx = 0;

    const walk = (node: Node) => {
      if (
        node.nodeType === Node.ELEMENT_NODE &&
        /^(img|style|script|svg|video|audio|iframe)$/i.test(
          (node as Element).tagName,
        )
      ) {
        return; // skip non-text elements
      }
      if (node.nodeType === Node.TEXT_NODE) {
        const t = (node.textContent || '').trim();
        if (t.length > 1) {
          segments.push({ index: idx++, text: t, node: node as Text });
        }
        return;
      }
      node.childNodes.forEach(walk);
    };
    walk(doc.body);

    if (segments.length === 0) {
      toast.error('没有可翻译的文字内容');
      return;
    }

    setTranslating(true);
    try {
      const res: any = await translateApi.translate(
        segments.map((s) => ({ index: s.index, text: s.text })),
      );
      const data = res.data || res;
      const translated: Record<number, string> = {};
      (data.segments || []).forEach((s: any) => {
        translated[s.index] = s.translated;
      });

      for (const seg of segments) {
        if (translated[seg.index]) {
          seg.node.textContent = translated[seg.index];
        }
      }

      setOriginalHtml(targetEmail.bodyHtml || targetEmail.bodyText || '');
      const newHtml = doc.body.innerHTML;
      applyHtmlToEmail(targetId, newHtml);
      setTranslatedEmailId(targetId);
      toast.success(
        `已翻译 ${segments.length} 段文字（${(data.sourceLang || 'auto').toUpperCase()} → 中文）`,
      );
    } catch (err: any) {
      toast.error(err?.response?.data?.message || '翻译失败，请稍后重试');
    } finally {
      setTranslating(false);
    }
  };

  /**
   * Apply an HTML body to both selectedEmail and the matching entry in
   * threadEmails so the thread view actually re-renders with the new
   * content (it reads from `threadEmails[i]`, not `selectedEmail`).
   */
  const applyHtmlToEmail = (emailId: string, newHtml: string) => {
    setSelectedEmail((prev) =>
      prev && prev.id === emailId ? { ...prev, bodyHtml: newHtml } : prev,
    );
    setThreadEmails((prev) =>
      prev.map((e) => (e.id === emailId ? { ...e, bodyHtml: newHtml } : e)),
    );
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

  // ==================== Sidebar structure ====================
  // Folders that live under each email account (tree children).
  const accountFolders: { key: FolderType; label: string; icon: string }[] = [
    { key: 'inbox', label: '收件箱', icon: 'inbox' },
    { key: 'customer', label: '客户', icon: 'customer' },
    { key: 'unread', label: '未读邮件', icon: 'unread' },
    { key: 'sent', label: '已发送', icon: 'sent' },
    { key: 'advertisement', label: '广告邮件', icon: 'advertisement' },
    { key: 'spam', label: '垃圾邮件', icon: 'spam' },
    { key: 'trash', label: '垃圾箱', icon: 'trash' },
  ];
  // Global sidebar entries — don't belong to any account.
  const globalFolders: { key: FolderType; label: string; icon: string }[] = [
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
    trash: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    ),
    spam: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4.5c-.77-.833-2.694-.833-3.464 0L3.34 16.5c-.77.833.192 2.5 1.732 2.5z" />
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

  // 头像颜色池 —— 根据发件人字符串哈希稳定选一个色，避免整屏全是一种色。
  const AVATAR_COLORS = [
    'bg-rose-400', 'bg-pink-400', 'bg-fuchsia-400', 'bg-purple-400',
    'bg-violet-400', 'bg-indigo-400', 'bg-blue-400', 'bg-sky-400',
    'bg-cyan-400', 'bg-teal-400', 'bg-emerald-400', 'bg-green-400',
    'bg-lime-500', 'bg-amber-500', 'bg-orange-400', 'bg-red-400',
  ];

  const avatarFor = (s: string) => {
    const src = (s || '?').trim();
    let hash = 0;
    for (let i = 0; i < src.length; i++) hash = (hash * 31 + src.charCodeAt(i)) >>> 0;
    return {
      letter: (src[0] || '?').toUpperCase(),
      color: AVATAR_COLORS[hash % AVATAR_COLORS.length],
    };
  };

  // 抠出正文预览 —— 后端 list 接口返回了 bodyText / bodyHtml，这里剥掉
  // 标签、折叠多余空白，截到 80 字符。
  const previewOf = (email: Email): string => {
    const raw = email.bodyText || email.bodyHtml || '';
    const stripped = raw.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
    // Shorter preview since the subject + preview now share a single line
    return stripped.length > 60 ? stripped.slice(0, 60) + '…' : stripped;
  };

  /**
   * Extract a human-readable name from a single address string.
   * Handles:  "Tom Harvey <tom@foo.com>"  →  "Tom Harvey"
   *           tom@foo.com                 →  "tom"
   *           "tom.harvey@foo.com"        →  "Tom Harvey" (dots → spaces)
   */
  const extractName = (raw: string): string => {
    const s = raw.trim();
    // "Display Name <email>" or Display Name <email>
    const m = s.match(/^"?([^"<]+)"?\s*</);
    if (m && m[1].trim()) return m[1].trim();
    // Bare address → take part before @, replace dots/underscores with spaces
    const addr = s.replace(/<|>/g, '').trim();
    const at = addr.indexOf('@');
    const local = at > 0 ? addr.slice(0, at) : addr;
    return local
      .replace(/[._]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());
  };

  /**
   * Parse a comma-separated address string into an array of display names.
   */
  const extractNames = (addrStr: string | null | undefined): string[] => {
    if (!addrStr) return [];
    return addrStr.split(',').map(extractName).filter(Boolean);
  };

  /**
   * Build the display name for an email list item.
   * - Inbound: prefer the stored `fromName` (e.g. "CES"); fall back to
   *   parsing the fromAddr.
   * - Outbound: show TO + CC display names.
   * Multiple names joined with "、" (Chinese enumeration comma).
   */
  const displayNameOf = (email: Email): string => {
    const isInbound = email.direction === 'INBOUND';
    if (isInbound) {
      if (email.fromName) return email.fromName;
      const names = extractNames(email.fromAddr);
      return names.join('、') || email.fromAddr;
    }
    const toNames = extractNames(email.toAddr);
    const ccNames = extractNames(email.cc);
    const all = [...toNames, ...ccNames];
    return all.join('、') || email.toAddr;
  };

  // ---- Attachments (lazy download) -----------------------------------------
  const [downloadingAttIds, setDownloadingAttIds] = useState<Set<string>>(new Set());

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const handleDownloadAttachment = async (att: EmailAttachment) => {
    if (downloadingAttIds.has(att.id)) return;
    setDownloadingAttIds((prev) => new Set(prev).add(att.id));
    const t = toast.loading(`正在下载 ${att.fileName} ...`);
    try {
      const res: any = await emailsApi.downloadAttachment(att.id);
      // axios 拦截器统一返回 response.data；responseType='blob' 时就是 Blob。
      const blob: Blob =
        res instanceof Blob
          ? res
          : new Blob([res], { type: att.mimeType || 'application/octet-stream' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = att.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success('下载完成', { id: t });
    } catch (err: any) {
      // 错误返回也会是 Blob（因为 responseType='blob'），需要先读成文本再尝试解析
      let msg = err?.message || '下载失败，请稍后重试';
      const errBody = err?.response?.data;
      if (errBody instanceof Blob) {
        try {
          const text = await errBody.text();
          try {
            const j = JSON.parse(text);
            msg = Array.isArray(j.message) ? j.message[0] : j.message || msg;
          } catch {
            if (text) msg = text;
          }
        } catch {
          /* ignore */
        }
      } else if (errBody?.message) {
        msg = Array.isArray(errBody.message) ? errBody.message[0] : errBody.message;
      }
      toast.error(msg, { id: t });
    } finally {
      setDownloadingAttIds((prev) => {
        const next = new Set(prev);
        next.delete(att.id);
        return next;
      });
    }
  };

  const renderAttachments = (attachments?: EmailAttachment[]) => {
    // 仅显示真正的附件；内嵌图片（isInline + contentId）不在附件区列出，
    // 它们会通过正文 HTML 的 cid: 引用渲染（日后可扩展）。
    const list = (attachments || []).filter((a) => !a.isInline);
    if (list.length === 0) return null;
    return (
      <div className="mt-4 pt-4 border-t border-gray-100">
        <div className="text-xs text-gray-500 mb-2">
          附件 ({list.length})
        </div>
        <div className="flex flex-wrap gap-2">
          {list.map((att) => {
            const loading = downloadingAttIds.has(att.id);
            return (
              <button
                key={att.id}
                type="button"
                onClick={() => handleDownloadAttachment(att)}
                disabled={loading}
                title={`${att.fileName} · ${formatFileSize(att.size)}`}
                className="inline-flex items-center gap-2 max-w-full px-3 py-1.5 rounded-md border border-gray-200 bg-gray-50 hover:bg-gray-100 text-xs text-gray-700 disabled:opacity-60"
              >
                <svg
                  className="w-3.5 h-3.5 flex-shrink-0 text-gray-400"
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                </svg>
                <span className="truncate max-w-[16rem]">{att.fileName}</span>
                <span className="text-gray-400 flex-shrink-0">
                  {formatFileSize(att.size)}
                </span>
                <span className="ml-1 flex-shrink-0 text-blue-600">
                  {loading ? '下载中…' : '下载'}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderThreadListItem = (thread: EmailThreadItem) => {
    const email = thread.latestEmail;
    if (!email) return null;
    const isSelected = selectedEmail?.id === email.id;

    // 读/未读判定
    //   - INBOUND：邮件对"我"是未读 => status === 'RECEIVED'
    //   - OUTBOUND：邮件对"收件人"是已读 => status === 'VIEWED'
    //
    // 注意 OUTBOUND 必须用 status 而不是 viewedAt —— email-tracking.service
    // 会把 Apple MPP / Gmail 代理这类 PREFETCH/BOT 的像素也写进 viewedAt，
    // 只有分类为 HUMAN / PROXY 的人类访问才会把 status 翻成 VIEWED
    // （见 email-tracking.service.ts:394 vs 401）。用 status 才能避开
    // "机器人预取 ≠ 收件人真读过" 的误报。
    const isInbound = email.direction === 'INBOUND';
    const isUnread = isInbound
      ? email.status === 'RECEIVED'
      : email.status !== 'VIEWED';

    const time = email.sentAt || email.receivedAt || email.createdAt;
    const name = displayNameOf(email);
    const { letter, color } = avatarFor(name);
    const preview = previewOf(email);
    const isReply = /^(re|回复)\s*[:：]/i.test(email.subject || '');

    return (
      <div
        key={thread.threadId || email.id}
        onClick={() => handleViewEmail(email, thread.threadId)}
        className={`group flex items-center gap-3 px-4 py-2.5 cursor-pointer border-b border-gray-100 transition-colors ${
          isSelected ? 'bg-rose-50' : 'hover:bg-gray-50'
        }`}
      >
        {/* Unread indicator — small dot on the very left */}
        <span
          className={`w-1.5 flex-shrink-0 h-1.5 rounded-full ${
            isUnread ? 'bg-rose-500' : 'bg-transparent'
          }`}
        />

        {/* Avatar — smaller now */}
        <div
          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full text-[13px] font-semibold text-white ${color}`}
        >
          {letter}
        </div>

        {/* Content — compact 2-line layout */}
        <div className="min-w-0 flex-1">
          {/* Line 1: sender + thread count on left, date on right */}
          <div className="flex items-center gap-1.5">
            {isReply && (
              <svg
                className="h-3 w-3 flex-shrink-0 text-gray-400"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
            )}
            <span
              className={`truncate text-[14px] ${
                isUnread ? 'font-semibold text-gray-900' : 'text-gray-700'
              }`}
            >
              {name}
            </span>
            {thread.emailCount > 1 && (
              <span className="flex-shrink-0 rounded-full bg-gray-100 px-1.5 text-[10px] font-semibold text-gray-500 leading-4">
                {thread.emailCount}
              </span>
            )}
            {thread.hasAttachments && (
              <svg
                className="h-3.5 w-3.5 flex-shrink-0 text-gray-400"
                fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                aria-label="有附件"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
              </svg>
            )}
            {email.flagged && (
              <span className="flex-shrink-0 text-red-500 text-xs" title="已标红旗">●</span>
            )}
            {/* Read indicator for outbound, smaller */}
            {!isUnread && !isInbound && (
              <svg className="h-3 w-3 flex-shrink-0 text-emerald-500" viewBox="0 0 24 24" fill="currentColor">
                <path d="M9 16.2L4.8 12l-1.4 1.4L9 19 21 7l-1.4-1.4L9 16.2z" />
              </svg>
            )}
            <span className="ml-auto flex-shrink-0 text-[11px] text-gray-400 tabular-nums">
              {formatShortTime(time)}
            </span>
          </div>

          {/* Line 2: subject followed by preview in gray */}
          <div className="mt-0.5 truncate text-[13px]">
            <span className={isUnread ? 'text-gray-900 font-medium' : 'text-gray-600'}>
              {thread.threadSubject || email.subject || '(无主题)'}
            </span>
            {preview && (
              <span className="text-gray-400"> — {preview}</span>
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
              {selectedEmail.direction === 'OUTBOUND' && selectedEmail.status === 'VIEWED' && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 w-16 flex-shrink-0">已读：</span>
                  <span className="text-green-600 font-medium">
                    收件人已读
                    {selectedEmail.viewedAt && ` · ${formatTime(selectedEmail.viewedAt)}`}
                    {selectedEmail.viewCount && selectedEmail.viewCount > 1
                      ? ` · 共打开 ${selectedEmail.viewCount} 次`
                      : ''}
                  </span>
                  <button
                    onClick={() => setTrackingForEmailId(selectedEmail.id)}
                    className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    查看追踪详情
                  </button>
                </div>
              )}
              {selectedEmail.direction === 'OUTBOUND' && selectedEmail.status !== 'VIEWED' && (
                <div className="flex items-center gap-2">
                  <span className="text-gray-500 w-16 flex-shrink-0">追踪：</span>
                  <button
                    onClick={() => setTrackingForEmailId(selectedEmail.id)}
                    className="text-xs text-blue-600 hover:text-blue-800 underline"
                  >
                    查看追踪详情（图片 / 点击）
                  </button>
                </div>
              )}
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <Badge className={STATUS_MAP[selectedEmail.status]?.color || 'bg-gray-100 text-gray-800'}>
                {STATUS_MAP[selectedEmail.status]?.label || selectedEmail.status}
              </Badge>
              {selectedEmail.direction === 'OUTBOUND' && selectedEmail.status === 'VIEWED' && (
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
            {activeFolder === 'trash' || activeFolder === 'spam' ? (
              <>
                <button
                  onClick={async () => {
                    if (!selectedEmail) return;
                    try {
                      await emailsApi.restore(selectedEmail.id);
                      toast.success('已恢复到收件箱');
                      setSelectedEmail(null);
                      fetchEmails();
                    } catch { toast.error('恢复失败'); }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-green-700 bg-green-50 rounded-lg hover:bg-green-100 transition-colors"
                >
                  恢复
                </button>
                <button
                  onClick={async () => {
                    if (!selectedEmail || !confirm('永久删除此邮件？此操作不可撤销。')) return;
                    try {
                      await emailsApi.permanentDelete(selectedEmail.id);
                      toast.success('已永久删除');
                      setSelectedEmail(null);
                      fetchEmails();
                    } catch { toast.error('删除失败'); }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-700 bg-red-50 rounded-lg hover:bg-red-100 transition-colors"
                >
                  永久删除
                </button>
              </>
            ) : (
              <>
            <button
              onClick={handleReply}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
              </svg>
              回复
            </button>
            {canReplyAll && (
              <button
                onClick={handleReplyAll}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors"
                title="回复发件人 + 所有抄送人"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 10h10a8 8 0 018 8v2M7 10l6 6m-6-6l6-6M3 14l4-4-4-4" />
                </svg>
                回复所有
              </button>
            )}
            <button
              onClick={() => {
                if (!selectedEmail) return;
                const fwdSubject = selectedEmail.subject.startsWith('Fwd:')
                  ? selectedEmail.subject
                  : `Fwd: ${selectedEmail.subject}`;
                // 用 data-role="quoted" 包起来，ComposeWindow 会把签名
                // 插到这一段之前。
                const fwdBody = `<br/><br/><div data-role="quoted">---------- 转发的邮件 ----------<br/>发件人: ${selectedEmail.fromAddr}<br/>日期: ${formatTime(selectedEmail.sentAt || selectedEmail.receivedAt || selectedEmail.createdAt)}<br/>主题: ${selectedEmail.subject}<br/>收件人: ${selectedEmail.toAddr}<br/><br/>${selectedEmail.bodyHtml || selectedEmail.bodyText || ''}</div>`;
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
            {(() => {
              // In thread view, the button acts on whichever email is
              // currently expanded. So its "active" state must compare
              // against that id too.
              const activeId =
                threadEmails.length > 1 && viewingThreadEmailId
                  ? viewingThreadEmailId
                  : selectedEmail?.id;
              const isActive = translatedEmailId === activeId;
              return (
                <button
                  onClick={handleTranslate}
                  disabled={translating}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 ${
                    isActive
                      ? 'text-purple-800 bg-purple-100 hover:bg-purple-200'
                      : 'text-purple-700 bg-purple-50 hover:bg-purple-100'
                  }`}
                  title="自动识别语言并翻译为中文"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5h12M9 3v2m1.048 9.5A18.022 18.022 0 016.412 9m6.088 9h7M11 21l5-10 5 10M12.751 5C11.783 10.77 8.07 15.61 3 18.129" />
                  </svg>
                  {translating ? '翻译中...' : isActive ? '恢复原文' : '翻译'}
                </button>
              );
            })()}
            <button
              onClick={async () => {
                if (!selectedEmail) return;
                try {
                  await emailsApi.moveToTrash(selectedEmail.id);
                  toast.success('已移入垃圾箱');
                  setSelectedEmail(null);
                  fetchEmails();
                } catch { toast.error('删除失败'); }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-red-600 bg-red-50 rounded-lg hover:bg-red-100 transition-colors ml-auto"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
              删除
            </button>
              </>
            )}
          </div>
        </div>

        {/* Email body - scrollable, with thread conversation */}
        <div className="flex-1 overflow-y-auto px-6 py-4 bg-gray-50">
          {threadEmails.length > 1 ? (
            /* ── Thread (accordion) view ─────────────────────────
             * Each email in the thread is a collapsible card.
             * Clicking one expands its body inline, right below
             * the header — NOT at the bottom of the page. */
            <div className="space-y-2">
              <div className="text-xs font-medium text-gray-500 mb-2">
                此会话共 {threadEmails.length} 封邮件
              </div>
              {threadEmails.map((te) => {
                const isViewing = viewingThreadEmailId === te.id;
                const teTime = te.sentAt || te.receivedAt || te.createdAt;
                const isInbound = te.direction === 'INBOUND';
                return (
                  <div
                    key={te.id}
                    className={`rounded-lg border transition-colors ${
                      isViewing ? 'border-blue-200 bg-white shadow-sm' : 'border-gray-100 bg-white hover:border-gray-200'
                    }`}
                  >
                    {/* Header row — always visible */}
                    <div
                      onClick={() => handleViewThreadEmail(te)}
                      className={`flex items-center gap-3 px-4 py-3 cursor-pointer select-none ${
                        isViewing ? 'border-b border-blue-100' : ''
                      }`}
                    >
                      <span className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${isInbound ? 'bg-blue-400' : 'bg-green-400'}`} />
                      <span className={`truncate flex-1 text-sm ${isViewing ? 'font-semibold text-gray-900' : 'text-gray-700'}`}>
                        {displayNameOf(te)}
                      </span>
                      {(te.attachments || []).some((a) => !a.isInline) && (
                        <svg
                          className="h-3.5 w-3.5 flex-shrink-0 text-gray-400"
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                          aria-label="有附件"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                      )}
                      <span className="text-xs text-gray-400 flex-shrink-0">
                        {formatShortTime(teTime)}
                      </span>
                      {te.status === 'RECEIVED' && (
                        <span className="w-2 h-2 rounded-full bg-blue-600 flex-shrink-0" title="未读" />
                      )}
                      <svg
                        className={`w-4 h-4 flex-shrink-0 text-gray-400 transition-transform ${isViewing ? 'rotate-180' : ''}`}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                      </svg>
                    </div>

                    {/* Body — only shown for the selected thread email */}
                    {isViewing && (
                      <div className="px-4 py-4">
                        <div className="text-xs text-gray-500 mb-3 space-y-0.5">
                          <div>发件人：<span className="text-gray-700">{te.fromAddr}</span></div>
                          <div>收件人：<span className="text-gray-700">{te.toAddr}</span></div>
                          {te.cc && <div>抄送：<span className="text-gray-700">{te.cc}</span></div>}
                          <div>时间：<span className="text-gray-700">{formatTime(teTime)}</span></div>
                        </div>
                        {te.bodyHtml ? (
                          <div
                            dangerouslySetInnerHTML={{ __html: te.bodyHtml }}
                            className="prose prose-sm max-w-none"
                          />
                        ) : (
                          <pre className="text-sm text-gray-700 whitespace-pre-wrap font-sans">
                            {te.bodyText || '(无内容)'}
                          </pre>
                        )}
                        {renderAttachments(te.attachments)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            /* ── Single email view ───────────────────────────── */
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
              {renderAttachments(selectedEmail.attachments)}
            </div>
          )}
        </div>

        {/* 回复 / 转发都走同一个 ComposeWindow —— 见 handleReply、
            转发按钮、renderComposeModal。这里不再内嵌回复表单。 */}
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

  // ==================== Compose Window（浮动、可拖拽、可最大化/最小化） ====================
  const renderComposeModal = () => (
    <ComposeWindow
      open={composeOpen}
      onClose={() => setComposeOpen(false)}
      value={composeForm}
      onChange={setComposeForm}
      onSend={async () => {
        // 复用已有的发送逻辑 —— handleSendEmail 需要一个 FormEvent，
        // 这里自己构造一次发送动作，避免伪造事件对象。
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
            emailConfigId: selectedAccountId || undefined,
            // ComposeWindow 已经把签名可视化插入到正文里了，告诉服务器
            // 不要再追加一次，否则收件人看到的就是两份签名。
            skipSignatureAppend: true,
          };
          if (composeForm.cc) payload.cc = composeForm.cc;
          if (composeForm.bcc) payload.bcc = composeForm.bcc;
          if (composeForm.customerId) payload.customerId = composeForm.customerId;
          // 回复 / 转发场景下 inReplyTo 会由 handleReply 预置，带上就能
          // 让后端把这封新邮件归到原会话里。
          if (composeForm.inReplyTo) payload.inReplyTo = composeForm.inReplyTo;
          // 附件：前端已经把文件通过 documentsApi.upload 落盘并拿到 id，
          // 这里把 id 列表传给后端，让它绑到这封邮件上并当真正的 SMTP
          // 附件发出去。
          if (composeForm.attachments && composeForm.attachments.length > 0) {
            payload.attachmentIds = composeForm.attachments.map((a) => a.id);
          }

          await emailsApi.send(payload);
          toast.success(composeForm.inReplyTo ? '回复已发送' : '邮件已发送');
          setComposeOpen(false);
          setComposeForm(emptyComposeForm);
          if (activeFolder === 'sent') fetchEmails();
        } catch {
          /* handled by interceptor */
        } finally {
          setSending(false);
        }
      }}
      sending={sending}
      accounts={accounts}
      selectedAccountId={selectedAccountId}
      onAccountChange={setSelectedAccountId}
      customers={customers}
      templates={templates}
    />
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
                用户名
              </label>
              <input
                type="text"
                value={accountForm.imapUser}
                onChange={(e) => setAccountForm({ ...accountForm, imapUser: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="留空则与 SMTP 一致"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                密码
              </label>
              <input
                type="password"
                value={accountForm.imapPass}
                onChange={(e) => setAccountForm({ ...accountForm, imapPass: e.target.value })}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                placeholder="留空则与 SMTP 一致"
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
      <Suspense fallback={null}>
        <ComposeToWatcher
          onOpen={(to) => {
            setComposeForm({ ...emptyComposeForm, toAddr: to });
            setComposeOpen(true);
          }}
        />
      </Suspense>
      <div className="flex flex-col h-[calc(100vh-64px)]">
        {/* Header */}
        <div className="flex items-center justify-between px-0 py-4 flex-shrink-0">
          <div className="flex items-center gap-4">
            <h1 className="text-2xl font-bold text-gray-900">邮件中心</h1>
            {selectedAccountId && (
              <span className="text-sm text-gray-500">
                当前账户：
                <span className="text-gray-900 font-medium">
                  {accounts.find((a: any) => a.id === selectedAccountId)?.emailAddr || ''}
                </span>
              </span>
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
                // 正文初始化为空，ComposeWindow 会根据选中的发件账户自动
                // 拉签名并可视化追加到正文末尾。
                setComposeForm({ ...emptyComposeForm });
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
          {/* Folder sidebar — tree: accounts → folders */}
          <aside className="w-[220px] bg-gray-50 border-r flex-shrink-0 flex flex-col">
            <nav className="py-3 flex-1 overflow-y-auto">
              {/* ── 邮箱 section header ─────────────────────────── */}
              <div className="flex items-center justify-between px-4 pb-2">
                <span className="text-[13px] font-medium text-gray-500">邮箱</span>
                <button
                  onClick={() => setShowAccountManager(true)}
                  title="添加邮箱账户"
                  className="flex h-5 w-5 items-center justify-center rounded text-gray-400 hover:bg-gray-200 hover:text-gray-700 transition-colors"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                </button>
              </div>

              {/* ── Account tree ───────────────────────────────── */}
              {accounts.length === 0 ? (
                <div className="px-4 py-2 text-[12px] text-gray-400">
                  尚未添加邮箱
                </div>
              ) : (
                accounts.map((acct: any) => {
                  const isOpen = expandedAccounts.has(acct.id);
                  const isActiveAccount =
                    selectedAccountId === acct.id && activeFolder !== 'templates' && activeFolder !== 'settings';
                  return (
                    <div key={acct.id} className="mb-0.5">
                      {/* Account row */}
                      <button
                        onClick={() => {
                          setExpandedAccounts((prev) => {
                            const next = new Set(prev);
                            if (next.has(acct.id)) next.delete(acct.id);
                            else next.add(acct.id);
                            return next;
                          });
                          // Also select this account + default to inbox
                          setSelectedAccountId(acct.id);
                          setActiveFolder('inbox');
                          setPage(1);
                          setSelectedEmail(null);
                        }}
                        className={`w-full flex items-center gap-1.5 pl-2 pr-3 py-1.5 text-[13px] transition-colors rounded-r-md ${
                          isActiveAccount && !isOpen
                            ? 'bg-blue-50 text-blue-700 font-medium'
                            : 'text-gray-700 hover:bg-gray-100'
                        }`}
                      >
                        {/* Chevron */}
                        <svg
                          className={`h-3 w-3 flex-shrink-0 text-gray-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
                          fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                        </svg>
                        {/* Mail icon */}
                        <svg className="h-4 w-4 flex-shrink-0 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                        </svg>
                        <span className="truncate flex-1 text-left">
                          {acct.emailAddr}
                        </span>
                      </button>

                      {/* Folders under this account */}
                      {isOpen && (
                        <div>
                          {accountFolders.map((folder) => {
                            const isActive =
                              selectedAccountId === acct.id &&
                              activeFolder === folder.key;
                            const badge =
                              folder.key === 'inbox' && isActiveAccount
                                ? unreadCount
                                : undefined;
                            return (
                              <button
                                key={folder.key}
                                onClick={() => {
                                  setSelectedAccountId(acct.id);
                                  setActiveFolder(folder.key);
                                  setPage(1);
                                  setSelectedEmail(null);
                                }}
                                className={`w-full flex items-center gap-2 pl-9 pr-3 py-1.5 text-[13px] transition-colors ${
                                  isActive
                                    ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600'
                                    : 'text-gray-600 hover:bg-gray-100'
                                }`}
                              >
                                <span className="flex-shrink-0 text-gray-400">
                                  {folderIcons[folder.icon]}
                                </span>
                                <span className="flex-1 text-left truncate">{folder.label}</span>
                                {badge !== undefined && badge > 0 && (
                                  <span className="text-[10px] bg-red-500 text-white rounded-full px-1.5 py-0.5 min-w-[16px] text-center font-bold">
                                    {badge > 99 ? '99+' : badge}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })
              )}

              {/* ── Global section (templates, settings) ────────── */}
              <div className="mt-4 pt-3 border-t border-gray-200">
                {globalFolders.map((folder) => (
                  <button
                    key={folder.key}
                    onClick={() => {
                      setActiveFolder(folder.key);
                      setPage(1);
                      setSelectedEmail(null);
                    }}
                    className={`w-full flex items-center gap-2 px-4 py-2 text-[13px] transition-colors ${
                      activeFolder === folder.key
                        ? 'bg-blue-50 text-blue-700 font-medium border-r-2 border-blue-600'
                        : 'text-gray-600 hover:bg-gray-100'
                    }`}
                  >
                    <span className="flex-shrink-0 text-gray-400">
                      {folderIcons[folder.icon]}
                    </span>
                    <span className="flex-1 text-left truncate">{folder.label}</span>
                  </button>
                ))}
              </div>
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
                            onClick={() =>
                              setSignatureForAccount({
                                id: acct.id,
                                emailAddr: acct.emailAddr,
                              })
                            }
                            className="px-3 py-1 text-xs text-indigo-600 hover:text-indigo-800"
                          >
                            签名
                          </button>
                          <button
                            onClick={async () => {
                              try {
                                const res: any = await emailsApi.getAccount(acct.id);
                                const d = res.data || res;
                                setAccountForm({
                                  emailAddr: d.emailAddr || '',
                                  fromName: d.fromName || '',
                                  signature: d.signature || '',
                                  smtpHost: d.smtpHost || '',
                                  smtpPort: String(d.smtpPort || 465),
                                  smtpUser: d.smtpUser || '',
                                  smtpPass: '',
                                  smtpSecure: d.smtpSecure !== false,
                                  imapHost: d.imapHost || '',
                                  imapPort: String(d.imapPort || 993),
                                  imapUser: d.imapUser || '',
                                  imapPass: '',
                                  imapSecure: d.imapSecure !== false,
                                });
                                setEditingAccountId(acct.id);
                                setShowAccountManager(true);
                              } catch {
                                toast.error('加载账户信息失败');
                              }
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
                            onClick={() => {
                              if (!window.confirm(
                                `确认删除邮箱账户「${acct.emailAddr}」？\n\n该账户下所有关联邮件将同时被永久删除，此操作不可撤销。`
                              )) return;
                              emailsApi.deleteAccount(acct.id).then((res: any) => {
                                const deletedEmails: number = res.data?.deletedEmails ?? 0;
                                setAccounts(accounts.filter((a: any) => a.id !== acct.id));
                                if (selectedAccountId === acct.id) {
                                  setSelectedAccountId(null);
                                  accountsInitialized.current = false;
                                }
                                toast.success(
                                  deletedEmails > 0
                                    ? `账户已删除，同时清除 ${deletedEmails} 封关联邮件`
                                    : '账户已删除'
                                );
                                fetchEmails();
                              }).catch(() => {});
                            }}
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
              {/* Email list panel — constrained to a readable width so
                  it doesn't stretch across huge screens when the detail
                  view is closed (the detail is now a slide-in modal). */}
              <div className="flex-1 flex flex-col border-r bg-white max-w-4xl w-full">
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
                {activeFolder === 'trash' && threads.length > 0 && (
                  <div className="flex items-center justify-end px-3 py-2 border-b flex-shrink-0">
                    <button
                      onClick={async () => {
                        if (!confirm('确定清空垃圾箱吗？所有邮件将被永久删除，无法恢复。')) return;
                        try {
                          const res: any = await emailsApi.emptyTrash();
                          toast.success(`已清空 ${res.data?.deleted || 0} 封邮件`);
                          setSelectedEmail(null);
                          fetchEmails();
                        } catch { toast.error('清空失败'); }
                      }}
                      className="inline-flex items-center gap-1 text-xs text-red-600 hover:text-red-800 font-medium"
                    >
                      清空垃圾箱
                    </button>
                  </div>
                )}
                {activeFolder === 'spam' && (
                  <div className="flex items-center justify-end px-3 py-2 border-b flex-shrink-0">
                    <button
                      onClick={async () => {
                        try {
                          toast.loading('正在扫描垃圾邮件...', { id: 'scan-spam' });
                          const res: any = await emailsApi.scanSpam();
                          toast.success(`扫描完成，标记了 ${res.data?.flagged || 0} 封垃圾邮件`, { id: 'scan-spam' });
                          fetchEmails();
                        } catch { toast.error('扫描失败', { id: 'scan-spam' }); }
                      }}
                      className="inline-flex items-center gap-1 text-xs text-orange-600 hover:text-orange-800 font-medium"
                    >
                      重新扫描全部邮件
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

            </>
          )}
        </div>

        {/* Email detail — slide-in panel from the right.
            The overlay covers most of the viewport while leaving the
            folder sidebar visible. Clicking the backdrop or the close
            button clears selectedEmail and slides the panel back out. */}
        <div
          className={`fixed inset-0 z-40 transition-opacity duration-300 ${
            selectedEmail ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
        >
          {/* Backdrop — clicking anywhere on the dark area closes the panel */}
          <div
            className="absolute inset-0 bg-black/30 backdrop-blur-sm"
            onClick={() => setSelectedEmail(null)}
          />
          <div
            className={`absolute inset-y-0 right-0 w-full md:w-[85%] lg:w-[75%] xl:w-[70%] max-w-6xl bg-gray-50 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
              selectedEmail ? 'translate-x-0' : 'translate-x-full'
            }`}
          >
            {/* Close button */}
            <button
              onClick={() => setSelectedEmail(null)}
              className="absolute top-4 right-4 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-white/80 text-gray-500 shadow hover:bg-white hover:text-gray-900 transition-colors"
              title="关闭 (Esc)"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            {renderDetailPanel()}
          </div>
        </div>

        {/* Modals */}
        {renderComposeModal()}
        {renderTemplateModal()}
        {renderAccountManagerModal()}

        {/* Tracking detail modal */}
        <Modal
          open={!!trackingForEmailId}
          onClose={() => setTrackingForEmailId(null)}
          title="邮件追踪详情"
          maxWidth="3xl"
        >
          {trackingForEmailId && (
            <EmailTrackingPanel emailId={trackingForEmailId} />
          )}
        </Modal>

        {/* Signature editor modal */}
        <Modal
          open={!!signatureForAccount}
          onClose={() => setSignatureForAccount(null)}
          title="邮件签名设置"
          maxWidth="4xl"
        >
          {signatureForAccount && (
            <SignatureEditor
              account={signatureForAccount}
              onSaved={() => setSignatureForAccount(null)}
            />
          )}
        </Modal>
      </div>
    </AppLayout>
  );
}
