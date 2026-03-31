// ==================== 通用类型 ====================
export interface ApiResponse<T = any> {
  code: number;
  message: string;
  data: T;
}

export interface PaginatedData<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export type Role = 'ADMIN' | 'SALESPERSON';

// ==================== 用户 ====================
export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone?: string;
  avatar?: string;
  isActive: boolean;
  createdAt: string;
}

// ==================== 客户 ====================
export type CustomerStatus = 'POTENTIAL' | 'ACTIVE' | 'INACTIVE' | 'BLACKLISTED';

export interface Customer {
  id: string;
  companyName: string;
  country?: string;
  address?: string;
  website?: string;
  industry?: string;
  scale?: string;
  source?: string;
  status: CustomerStatus;
  remark?: string;
  ownerId: string;
  owner?: User;
  contacts?: Contact[];
  createdAt: string;
  updatedAt: string;
}

// ==================== 联系人 ====================
export interface Contact {
  id: string;
  name: string;
  title?: string;
  email?: string;
  phone?: string;
  wechat?: string;
  whatsapp?: string;
  isPrimary: boolean;
  remark?: string;
  customerId: string;
  createdAt: string;
}

// ==================== 销售线索 ====================
export type LeadStage = 'NEW' | 'CONTACTED' | 'QUALIFIED' | 'PROPOSAL' | 'NEGOTIATION' | 'CLOSED_WON' | 'CLOSED_LOST';

export interface Lead {
  id: string;
  title: string;
  description?: string;
  stage: LeadStage;
  expectedAmount?: number;
  expectedDate?: string;
  source?: string;
  priority: number;
  customerId?: string;
  customer?: Customer;
  ownerId: string;
  owner?: User;
  createdAt: string;
  updatedAt: string;
}

// ==================== 邮件 ====================
export type EmailDirection = 'INBOUND' | 'OUTBOUND';
export type EmailStatus = 'DRAFT' | 'SENT' | 'RECEIVED' | 'FAILED' | 'READ' | 'VIEWED';

export interface Email {
  id: string;
  messageId?: string;
  threadId?: string;
  fromAddr: string;
  toAddr: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  direction: EmailDirection;
  status: EmailStatus;
  sentAt?: string;
  receivedAt?: string;
  viewedAt?: string;
  viewCount?: number;
  customerId?: string;
  customer?: Customer;
  senderId?: string;
  createdAt: string;
}

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  bodyHtml: string;
  category?: string;
}

// ==================== 报价单 ====================
export type QuotationStatus = 'DRAFT' | 'SENT' | 'VIEWED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED';

export interface QuotationItem {
  id?: string;
  productName: string;
  description?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  sortOrder?: number;
}

export interface Quotation {
  id: string;
  quotationNo: string;
  customerId: string;
  customer?: Customer;
  ownerId: string;
  owner?: User;
  title: string;
  currency: string;
  totalAmount: number;
  status: QuotationStatus;
  validUntil?: string;
  terms?: string;
  remark?: string;
  pdfUrl?: string;
  items: QuotationItem[];
  createdAt: string;
  updatedAt: string;
}

// ==================== 订单 ====================
export type OrderStatus = 'PENDING' | 'CONFIRMED' | 'IN_PRODUCTION' | 'SHIPPED' | 'DELIVERED' | 'CANCELLED';
export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PAID' | 'REFUNDED';

export interface OrderItem {
  id?: string;
  productName: string;
  description?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  sortOrder?: number;
}

export interface Order {
  id: string;
  orderNo: string;
  customerId: string;
  customer?: Customer;
  ownerId: string;
  owner?: User;
  title: string;
  currency: string;
  totalAmount: number;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  shippingAddr?: string;
  shippingDate?: string;
  deliveryDate?: string;
  trackingNo?: string;
  remark?: string;
  items: OrderItem[];
  createdAt: string;
  updatedAt: string;
}

// ==================== 任务 ====================
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: TaskPriority;
  status: TaskStatus;
  dueDate?: string;
  ownerId: string;
  owner?: User;
  relatedType?: string;
  relatedId?: string;
  createdAt: string;
  updatedAt: string;
}

// ==================== 活动记录 ====================
export type ActivityType = 'NOTE' | 'CALL' | 'MEETING' | 'EMAIL' | 'TASK' | 'STATUS_CHANGE' | 'PRICE_DISCUSSION' | 'ORDER_INTENT' | 'SAMPLE' | 'MOLD_FEE' | 'PAYMENT' | 'SHIPPING' | 'COMPLAINT' | 'VISIT';

export interface Activity {
  id: string;
  type: ActivityType;
  content: string;
  customerId?: string;
  ownerId: string;
  owner?: User;
  relatedType?: string;
  relatedId?: string;
  createdAt: string;
}

// ==================== 文件 ====================
export interface Document {
  id: string;
  fileName: string;
  filePath: string;
  fileSize: number;
  mimeType: string;
  category?: string;
  customerId?: string;
  ownerId: string;
  owner?: User;
  relatedType?: string;
  relatedId?: string;
  createdAt: string;
}

// ==================== 仪表盘 ====================
export interface DashboardStats {
  totalCustomers: number;
  totalLeads: number;
  totalOrders: number;
  totalRevenue: number;
  pendingTasks: number;
  newLeadsThisMonth: number;
}

export interface SalesTrend {
  month: string;
  amount: number;
  count: number;
}

export interface FunnelData {
  stage: string;
  label: string;
  count: number;
}

export interface SalesRanking {
  userId: string;
  name: string;
  revenue: number;
  orderCount: number;
}

// ==================== 邮件配置 ====================
export interface EmailConfig {
  smtpHost: string;
  smtpPort: number;
  smtpUser: string;
  smtpPass: string;
  smtpSecure: boolean;
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPass: string;
  imapSecure: boolean;
  fromName?: string;
  signature?: string;
}
