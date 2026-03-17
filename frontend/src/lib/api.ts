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
};

// ==================== Emails API ====================
export const emailsApi = {
  list: (params?: any) => api.get('/emails', { params }),
  getById: (id: string) => api.get(`/emails/${id}`),
  send: (data: any) => api.post('/emails/send', data),
  fetch: () => api.post('/emails/fetch'),
  getTemplates: () => api.get('/emails/templates'),
  createTemplate: (data: any) => api.post('/emails/templates', data),
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
};

// ==================== Settings API ====================
export const settingsApi = {
  getAll: () => api.get('/settings'),
  update: (data: any) => api.put('/settings', data),
  getEmailConfig: () => api.get('/settings/email-config'),
  updateEmailConfig: (data: any) => api.put('/settings/email-config', data),
  testEmailConfig: (data: any) => api.post('/settings/email-config/test', data),
};
