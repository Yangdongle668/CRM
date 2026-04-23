import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: '/api',
  timeout: 30000,
  headers: { 'Content-Type': 'application/json' },
});

// 请求拦截器 - 添加 JWT Token
api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// 响应拦截器
api.interceptors.response.use(
  (response) => {
    return response.data;
  },
  (error) => {
    const message = error.response?.data?.message || '请求失败，请重试';
    if (error.response?.status === 401) {
      if (typeof window !== 'undefined') {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        window.location.href = '/login';
      }
    } else {
      toast.error(Array.isArray(message) ? message[0] : message);
    }
    return Promise.reject(error);
  }
);

export default api;

// ==================== Auth API ====================
export const authApi = {
  checkInit: () => api.get('/auth/check-init'),
  setup: (data: { email: string; password: string; name: string; phone?: string }) =>
    api.post('/auth/setup', data),
  login: (data: { email: string; password: string }) =>
    api.post('/auth/login', data),
  getProfile: () => api.get('/auth/profile'),
  register: (data: any) => api.post('/auth/register', data),
  updateProfile: (data: { password?: string; phone?: string; bio?: string; avatar?: string; preferences?: Record<string, any>; birthday?: string | null }) =>
    api.patch('/auth/profile', data),
  updatePreferences: (prefs: Record<string, any>) =>
    api.patch('/auth/profile', { preferences: prefs }),
  uploadAvatar: (formData: FormData) =>
    api.post('/auth/avatar', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

// ==================== Users API ====================
export const usersApi = {
  list: (params?: any) => api.get('/users', { params }),
  getById: (id: string) => api.get(`/users/${id}`),
  update: (id: string, data: any) => api.patch(`/users/${id}`, data),
  delete: (id: string) => api.delete(`/users/${id}`),
};

// ==================== Customers API ====================
export const customersApi = {
  list: (params?: any) => api.get('/customers', { params }),
  getById: (id: string) => api.get(`/customers/${id}`),
  create: (data: any) => api.post('/customers', data),
  update: (id: string, data: any) => api.patch(`/customers/${id}`, data),
  delete: (id: string) => api.delete(`/customers/${id}`),
  syncEmails: (id: string) => api.post(`/customers/${id}/sync-emails`, {}),
  refreshTimeline: (id: string) => api.post(`/customers/${id}/refresh-timeline`, {}),
  /** "好久没联系"的客户 —— 给仪表盘温度组件用 */
  dormant: (params?: { days?: number; limit?: number }) =>
    api.get('/customers/dormant', { params }),
};

// ==================== Contacts API ====================
export const contactsApi = {
  list: (params?: any) => api.get('/contacts', { params }),
  getById: (id: string) => api.get(`/contacts/${id}`),
  create: (data: any) => api.post('/contacts', data),
  update: (id: string, data: any) => api.patch(`/contacts/${id}`, data),
  delete: (id: string) => api.delete(`/contacts/${id}`),
};

// ==================== Leads API ====================
export const leadsApi = {
  list: (params?: any) => api.get('/leads', { params }),
  getById: (id: string) => api.get(`/leads/${id}`),
  create: (data: any) => api.post('/leads', data),
  update: (id: string, data: any) => api.patch(`/leads/${id}`, data),
  updateStage: (id: string, stage: string) =>
    api.patch(`/leads/${id}/stage`, { stage }),
  delete: (id: string) => api.delete(`/leads/${id}`),
  claim: (id: string) => api.post(`/leads/${id}/claim`, {}),
  release: (id: string) => api.post(`/leads/${id}/release`, {}),
  assign: (id: string, ownerId: string) =>
    api.post(`/leads/${id}/assign`, { ownerId }),
  convert: (id: string) => api.post(`/leads/${id}/convert`, {}),
  batchAssign: (ids: string[], ownerId: string) =>
    api.post('/leads/batch-assign', { ids, ownerId }),
  batchRelease: (ids: string[]) => api.post('/leads/batch-release', { ids }),
  batchDelete: (ids: string[]) => api.post('/leads/batch-delete', { ids }),
  listActivities: (id: string) => api.get(`/leads/${id}/activities`),
  addActivity: (id: string, content: string) =>
    api.post(`/leads/${id}/activities`, { content }),
  exportCsv: (params?: any) =>
    api.get('/leads/export/csv', {
      params,
      responseType: 'blob',
    }),
  exportCsvUrl: (params?: any) => {
    const qs = new URLSearchParams(params || {}).toString();
    return `/api/leads/export/csv${qs ? `?${qs}` : ''}`;
  },
  importCsv: (file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.post('/leads/import/csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// ==================== Emails API ====================
export const emailsApi = {
  // Account management
  listAccounts: () => api.get('/emails/accounts'),
  getAccount: (id: string) => api.get(`/emails/accounts/${id}`),
  createAccount: (data: any) => api.post('/emails/accounts', data),
  updateAccount: (id: string, data: any) => api.put(`/emails/accounts/${id}`, data),
  deleteAccount: (id: string) => api.delete(`/emails/accounts/${id}`),
  testAccount: (id: string) => api.post(`/emails/accounts/${id}/test`),
  fetchAccount: (id: string) => api.post(`/emails/accounts/${id}/fetch`),

  // Email operations
  list: (params?: any) => api.get('/emails', { params }),
  getById: (id: string) => api.get(`/emails/${id}`),
  send: (data: any) => api.post('/emails/send', data),
  fetch: () => api.post('/emails/fetch'),

  // Flag and category
  toggleFlag: (id: string, flagged: boolean) => api.patch(`/emails/${id}/flag`, { flagged }),
  updateCategory: (id: string, category: string) => api.patch(`/emails/${id}/category`, { category }),

  // Delete / Trash / Spam
  moveToTrash: (id: string) => api.delete(`/emails/${id}`),
  batchMoveToTrash: (ids: string[]) => api.post('/emails/batch-trash', { ids }),
  restore: (id: string) => api.post(`/emails/${id}/restore`),
  permanentDelete: (id: string) => api.delete(`/emails/${id}/permanent`),
  emptyTrash: () => api.delete('/emails/trash/empty'),
  scanSpam: () => api.post('/emails/scan-spam'),

  // Templates
  getTemplates: () => api.get('/emails/templates'),
  createTemplate: (data: any) => api.post('/emails/templates', data),
  updateTemplate: (id: string, data: any) => api.put(`/emails/templates/${id}`, data),
  deleteTemplate: (id: string) => api.delete(`/emails/templates/${id}`),

  // Status and counts
  getUnreadCount: () => api.get('/emails/unread-count'),
  markAsRead: (id: string) => api.patch(`/emails/${id}/read`),
  markAllAsRead: () => api.patch('/emails/mark-all-read'),
  getRecentlyViewed: () => api.get('/emails/recently-viewed'),

  // Threads
  getThreadEmails: (threadId: string) => api.get(`/emails/threads/${threadId}`),

  // Attachments — 懒下载：点击才从 IMAP 回源抓取并缓存，之后直接走磁盘。
  downloadAttachment: (attachmentId: string) =>
    api.get(`/emails/attachments/${attachmentId}/download`, {
      responseType: 'blob',
      timeout: 60000, // 回源可能慢，给 60s
    }),

  // Tracking (open / click audit trail + confidence score)
  getTracking: (id: string) => api.get(`/emails/${id}/tracking`),

  // Per-account signature (dedicated endpoints — HTML signatures supported)
  getSignature: (accountId: string) =>
    api.get(`/emails/accounts/${accountId}/signature`),
  updateSignature: (accountId: string, signature: string) =>
    api.put(`/emails/accounts/${accountId}/signature`, { signature }),

  // Campaigns (group outgoing emails for aggregate open/click stats)
  listCampaigns: () => api.get('/emails/campaigns'),
  createCampaign: (data: { name: string; description?: string }) =>
    api.post('/emails/campaigns', data),
  updateCampaign: (id: string, data: { name?: string; description?: string; status?: string }) =>
    api.put(`/emails/campaigns/${id}`, data),
  deleteCampaign: (id: string) => api.delete(`/emails/campaigns/${id}`),
  getCampaignStats: (id: string) => api.get(`/emails/campaigns/${id}/stats`),

  // Recipients (one row per email address we've ever sent to)
  listRecipients: (params?: { search?: string; page?: number; pageSize?: number }) =>
    api.get('/emails/recipients', { params }),
  getRecipient: (id: string) => api.get(`/emails/recipients/${id}`),

  // 收件人地址自动补全（已发 / 已收 / 联系人合并，按时间倒序）
  suggestAddresses: (q: string, limit = 20) =>
    api.get('/emails/address-suggestions', { params: { q, limit } }),
};

// ==================== Quotations API ====================
export const quotationsApi = {
  list: (params?: any) => api.get('/quotations', { params }),
  getById: (id: string) => api.get(`/quotations/${id}`),
  create: (data: any) => api.post('/quotations', data),
  update: (id: string, data: any) => api.patch(`/quotations/${id}`, data),
  delete: (id: string) => api.delete(`/quotations/${id}`),
  generatePdf: (id: string) => api.post(`/quotations/${id}/pdf`),
  send: (id: string) => api.post(`/quotations/${id}/send`),
};

// ==================== Orders API ====================
export const ordersApi = {
  list: (params?: any) => api.get('/orders', { params }),
  getById: (id: string) => api.get(`/orders/${id}`),
  create: (data: any) => api.post('/orders', data),
  update: (id: string, data: any) => api.patch(`/orders/${id}`, data),
  updateStatus: (id: string, status: string) =>
    api.patch(`/orders/${id}/status`, { status }),
  updatePayment: (id: string, paymentStatus: string) =>
    api.patch(`/orders/${id}/payment`, { paymentStatus }),
  delete: (id: string) => api.delete(`/orders/${id}`),
};

// ==================== Tasks API ====================
export const tasksApi = {
  list: (params?: any) => api.get('/tasks', { params }),
  getById: (id: string) => api.get(`/tasks/${id}`),
  create: (data: any) => api.post('/tasks', data),
  update: (id: string, data: any) => api.patch(`/tasks/${id}`, data),
  delete: (id: string) => api.delete(`/tasks/${id}`),
};

// ==================== Activities API ====================
export const activitiesApi = {
  list: (params?: any) => api.get('/activities', { params }),
  create: (data: any) => api.post('/activities', data),
};

// ==================== Documents API ====================
export const documentsApi = {
  list: (params?: any) => api.get('/documents', { params }),
  upload: (formData: FormData) =>
    api.post('/documents/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  download: (id: string) =>
    api.get(`/documents/${id}/download`, { responseType: 'blob' }),
  delete: (id: string) => api.delete(`/documents/${id}`),
};

// ==================== Dashboard API ====================
export const dashboardApi = {
  getStats: () => api.get('/dashboard/stats'),
  getSalesTrend: () => api.get('/dashboard/sales-trend'),
  getFunnel: () => api.get('/dashboard/funnel'),
  getRankings: () => api.get('/dashboard/rankings'),
  getAdminOverview: (period?: string) =>
    api.get('/dashboard/admin/overview', { params: { period } }),
  getSalespersonStats: (period?: string) =>
    api.get('/dashboard/admin/salesperson-stats', { params: { period } }),
  getFollowUpProgress: () => api.get('/dashboard/admin/follow-up-progress'),
  getAdminTrend: (granularity?: 'day' | 'month', days?: number) =>
    api.get('/dashboard/admin/trend', { params: { granularity, days } }),
};

// ==================== Backup API ====================
// Backup format: a ZIP of CSVs (customers / contacts / leads / quotations /
// orders / tasks / activities + the users that own them). Emails, system
// messages, memos and settings are intentionally excluded.
export const backupApi = {
  export: () =>
    api.get('/backup/export', { responseType: 'blob' }),
  exportAsync: () => api.post('/backup/export/async'),
  /**
   * Restore from a backup ZIP.
   * Note: overrides the default Content-Type so multer sees a multipart
   * form and extracts the `file` field correctly.
   */
  import: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api.post('/backup/import', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
      timeout: 5 * 60 * 1000, // 5 min, large restores take time
    });
  },
};

// ==================== Memos API ====================
export const memosApi = {
  list: (params?: any) => api.get('/memos', { params }),
  getByRange: (startDate: string, endDate: string) =>
    api.get('/memos/range', { params: { startDate, endDate } }),
  create: (data: any) => api.post('/memos', data),
  update: (id: string, data: any) => api.patch(`/memos/${id}`, data),
  delete: (id: string) => api.delete(`/memos/${id}`),
};

// ==================== Settings API ====================
export const settingsApi = {
  getAll: () => api.get('/settings'),
  update: (data: any) => api.put('/settings', data),
  getEmailConfig: () => api.get('/settings/email-config'),
  updateEmailConfig: (data: any) => api.put('/settings/email-config', data),
  testEmailConfig: (data: any) => api.post('/settings/email-config/test', data),
  uploadLogo: (formData: FormData) =>
    api.post('/settings/logo', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }),
  getLogo: () => api.get('/settings/logo'),
  // Legacy single-bank endpoint (kept for backwards compat with setup scripts)
  getBankInfo: () => api.get('/settings/bank-info'),
  updateBankInfo: (data: any) => api.put('/settings/bank-info', data),
  getCompanyInfo: () => api.get('/settings/company-info'),
  updateCompanyInfo: (data: any) => api.put('/settings/company-info', data),
};

// ==================== Bank Accounts API ====================
// Multi-bank support: a company can maintain several accounts (USD / EUR /
// CNY, different banks, etc.) and a PI picks one when it's issued.
export const bankAccountsApi = {
  list: () => api.get('/settings/bank-accounts'),
  getById: (id: string) => api.get(`/settings/bank-accounts/${id}`),
  create: (data: any) => api.post('/settings/bank-accounts', data),
  update: (id: string, data: any) => api.put(`/settings/bank-accounts/${id}`, data),
  delete: (id: string) => api.delete(`/settings/bank-accounts/${id}`),
  setDefault: (id: string) => api.patch(`/settings/bank-accounts/${id}/default`, {}),
};

// ==================== PI Templates API ====================
// Reusable PI presets (trade term, payment method, shipping method, default
// bank account, ...). Salespeople pick one when creating a PI and the fields
// get copied into the form.
export const piTemplatesApi = {
  list: () => api.get('/settings/pi-templates'),
  getById: (id: string) => api.get(`/settings/pi-templates/${id}`),
  create: (data: any) => api.post('/settings/pi-templates', data),
  update: (id: string, data: any) => api.put(`/settings/pi-templates/${id}`, data),
  delete: (id: string) => api.delete(`/settings/pi-templates/${id}`),
  setDefault: (id: string) => api.patch(`/settings/pi-templates/${id}/default`, {}),
};

// ==================== Proforma Invoice (PI) API ====================
export const pisApi = {
  list: (params?: any) => api.get('/pis', { params }),
  getById: (id: string) => api.get(`/pis/${id}`),
  create: (data: any) => api.post('/pis', data),
  update: (id: string, data: any) => api.patch(`/pis/${id}`, data),
  delete: (id: string) => api.delete(`/pis/${id}`),
  submitForApproval: (id: string) => api.post(`/pis/${id}/submit-approval`, {}),
  approve: (id: string) => api.post(`/pis/${id}/approve`, {}),
  reject: (id: string, reason: string) => api.post(`/pis/${id}/reject`, { reason }),
  generatePdf: (id: string) => api.post(`/pis/${id}/pdf`, {}),
  downloadPdf: (id: string) => api.get(`/pis/${id}/download`, { responseType: 'blob' }),
};


// ==================== Messages API ====================
export const messagesApi = {
  getConversations: () => api.get('/messages/conversations'),
  getHistory: (userId: string) => api.get(`/messages/${userId}`),
  send: (toId: string, content: string) => api.post('/messages', { toId, content }),
  getUnreadCount: () => api.get('/messages/unread-count'),
  getUsers: () => api.get('/messages/users'),
  getUserProfile: (userId: string) => api.get(`/messages/${userId}/profile`),
};

// ==================== Follow-Ups API ====================
export const followUpsApi = {
  list: (params?: {
    ownerId?: string;
    status?: string;
    overdueOnly?: boolean;
    leadId?: string;
  }) => api.get('/follow-ups', { params }),
  summary: () => api.get('/follow-ups/summary'),
  adminOverview: () => api.get('/follow-ups/admin/overview'),
  create: (data: {
    leadId: string;
    dueAt: string;
    notes?: string;
    ownerId?: string;
  }) => api.post('/follow-ups', data),
  done: (id: string, notes?: string) =>
    api.patch(`/follow-ups/${id}/done`, { notes }),
  snooze: (id: string, days: number) =>
    api.patch(`/follow-ups/${id}/snooze`, { days }),
  dismiss: (id: string) => api.patch(`/follow-ups/${id}/dismiss`, {}),
  reassign: (id: string, ownerId: string) =>
    api.patch(`/follow-ups/${id}/reassign`, { ownerId }),
  remove: (id: string) => api.delete(`/follow-ups/${id}`),
};

// ==================== Rates API ====================
export const ratesApi = {
  get: () => api.get('/rates'),
};

// ==================== Weather API ====================
export const weatherApi = {
  get: (city?: string) => api.get('/weather', { params: { city } }),
};

// ==================== Translate API ====================
export const translateApi = {
  translate: (segments: { index: number; text: string }[], target = 'zh-CN') =>
    api.post('/translate', { segments, target }),
};

// ==================== RBAC API ====================
export const rbacApi = {
  myPermissions: () => api.get('/auth/me/permissions'),
  catalog: () => api.get('/rbac/catalog'),
  listRoles: () => api.get('/rbac/roles'),
  createRole: (data: { code: string; name: string; description?: string }) =>
    api.post('/rbac/roles', data),
  updateRole: (code: string, data: { name?: string; description?: string | null }) =>
    api.patch(`/rbac/roles/${code}`, data),
  deleteRole: (code: string) => api.delete(`/rbac/roles/${code}`),
  getRolePermissions: (role: string) => api.get(`/rbac/roles/${role}/permissions`),
  setRolePermissions: (role: string, permissions: string[]) =>
    api.put(`/rbac/roles/${role}/permissions`, { permissions }),
};

// ==================== Audit Log API ====================
export const auditApi = {
  list: (params: Record<string, any>) => api.get('/audit-logs', { params }),
};

// ==================== Search API ====================
export type SearchType = 'customer' | 'lead' | 'order' | 'email';

export interface SearchHit {
  id: string;
  title: string;
  subtitle?: string;
  snippet?: string;
  meta?: Record<string, any>;
}

export interface SearchGroup {
  type: SearchType;
  hits: SearchHit[];
}

export const searchApi = {
  global: (params: { q: string; types?: SearchType[]; limit?: number }) =>
    api.get<any, SearchGroup[]>('/search', {
      params: {
        q: params.q,
        types: params.types?.join(','),
        limit: params.limit,
      },
    }),
};
