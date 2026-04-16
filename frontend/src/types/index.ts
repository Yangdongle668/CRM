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

export type Role = 'ADMIN' | 'SALESPERSON' | 'FINANCE';

// ==================== 用户 ====================
export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  phone?: string;
  avatar?: string;
  bio?: string;
  isActive: boolean;
  createdAt: string;
  /** Permission codes granted to this user by their role (ADMIN ⇒ ["*"]). */
  permissions?: string[];
}

// ==================== 客户 ====================
export type CustomerStatus = 'POTENTIAL' | 'ACTIVE' | 'INACTIVE' | 'BLACKLISTED';

export interface Customer {
  id: string;
  companyName: string;
  country?: string;
  address?: string;
  website?: string;
  website2?: string;
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

export interface LeadActivity {
  id: string;
  content: string;
  leadId: string;
  ownerId: string;
  owner?: { id: string; name: string };
  createdAt: string;
}

export interface Lead {
  id: string;
  title: string;
  companyName?: string;
  contactName?: string;
  contactTitle?: string;
  contactEmail?: string;
  email?: string;
  phone?: string;
  country?: string;
  region?: string;
  city?: string;
  address?: string;
  postalCode?: string;
  website?: string;
  industry?: string;
  companySize?: string;
  description?: string;
  stage: LeadStage;
  source?: string;
  score?: number;
  isPublicPool?: boolean;
  estimatedValue?: number;
  currency?: string;
  expectedAmount?: number;
  expectedDate?: string;
  lastContactAt?: string;
  nextFollowUpAt?: string;
  notes?: string;
  priority: number;
  customerId?: string;
  customer?: Customer;
  ownerId?: string | null;
  owner?: User;
  creatorId?: string | null;
  creator?: User;
  activities?: LeadActivity[];
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
  emailConfigId?: string;
  fromAddr: string;
  toAddr: string;
  cc?: string;
  bcc?: string;
  subject: string;
  bodyHtml?: string;
  bodyText?: string;
  direction: EmailDirection;
  status: EmailStatus;
  category?: string;
  flagged?: boolean;
  sentAt?: string;
  receivedAt?: string;
  viewedAt?: string;
  viewCount?: number;
  customerId?: string;
  customer?: Customer;
  senderId?: string;
  createdAt: string;
  thread?: {
    id: string;
    subject: string;
    emails: Email[];
  };
}

export interface EmailConfig {
  id: string;
  emailAddr: string;
  fromName?: string;
  signature?: string;
  createdAt: string;
}

export interface EmailThreadItem {
  threadId: string | null;
  threadSubject: string;
  emailCount: number;
  latestEmail: Email;
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
  costTypes: string[];
  floorPrice?: number;
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

// ==================== 备忘录 ====================
export interface Memo {
  id: string;
  title: string;
  content?: string;
  color?: string;
  date: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
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

// ==================== 形式发票 (PI) ====================
export type PIStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED';
export type TradeTermType = 'EXW' | 'FOB' | 'CIF' | 'CIP' | 'DPU' | 'DDP' | 'FCA' | 'FAS' | 'CFR';
export type PaymentTermType = 'T_30' | 'T_50' | 'T_70' | 'T_100';

export interface ProformaInvoiceItem {
  id?: string;
  productName: string;
  description?: string;
  hsn?: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  sortOrder?: number;
}

export interface ProformaInvoice {
  id: string;
  piNo: string;
  customerId: string;
  customer?: Customer;
  ownerId: string;
  owner?: User;
  status: PIStatus;
  sellerId?: string;
  sellerAddress?: string;
  consigneeName?: string;
  consigneeAddress?: string;
  poNo?: string;
  currency: string;
  tradeTerm?: TradeTermType;
  paymentTerm?: PaymentTermType;
  shippingMethod?: string;
  portOfLoading?: string;
  portOfDischarge?: string;
  placeOfDelivery?: string;
  paymentMethod?: string;
  countryOfOrigin?: string;
  termsOfDelivery?: string;
  notes?: string;
  validityPeriod: number;
  subtotal: number;
  shippingCharge: number;
  other: number;
  totalAmount: number;
  bankAccountId?: string | null;
  bankAccount?: BankAccount | null;
  templateId?: string | null;
  template?: PITemplate | null;
  approverId?: string;
  approver?: User;
  approvedAt?: string;
  rejectionReason?: string;
  items: ProformaInvoiceItem[];
  createdAt: string;
  updatedAt: string;
}

// ==================== 银行账户 ====================
export interface BankAccount {
  id: string;
  alias: string;
  accountName?: string | null;
  accountNumber?: string | null;
  bankName?: string | null;
  bankAddress?: string | null;
  swiftCode?: string | null;
  currency?: string | null;
  country?: string | null;
  branchName?: string | null;
  routingNumber?: string | null;
  iban?: string | null;
  paymentMemo?: string | null;
  extraInfo?: string | null;
  isDefault: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// ==================== PI 模板 ====================
export interface PITemplate {
  id: string;
  name: string;
  description?: string | null;
  isDefault: boolean;
  currency?: string | null;
  tradeTerm?: TradeTermType | null;
  paymentTerm?: PaymentTermType | null;
  shippingMethod?: string | null;
  paymentMethod?: string | null;
  portOfLoading?: string | null;
  portOfDischarge?: string | null;
  placeOfDelivery?: string | null;
  countryOfOrigin?: string | null;
  termsOfDelivery?: string | null;
  notes?: string | null;
  validityPeriod?: number | null;
  bankAccountId?: string | null;
  bankAccount?: BankAccount | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

// Legacy — still referenced by a few places for the single bank info text.
export interface BankInfo {
  accountNumber?: string;
  holderName?: string;
  currency?: string;
  bankName?: string;
  bankAddress?: string;
  accountType?: string;
  swiftBic?: string;
  routingNumber?: string;
  country?: string;
  paymentMemo?: string;
}
