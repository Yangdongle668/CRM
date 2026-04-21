# 外贸CRM系统 (Foreign Trade CRM)

一款专为外贸团队打造的全功能客户关系管理系统，覆盖从线索获取到订单交付的完整业务链路，深度集成多账户邮件追踪、团队协作、财务管控与后台权限管理。中文界面，贴合国内外贸业务习惯。

## 目录

- [系统概述](#系统概述)
- [技术架构](#技术架构)
- [数据库设计](#数据库设计)
- [功能模块](#功能模块)
- [角色权限](#角色权限)
- [快速部署](#快速部署)
- [本地开发](#本地开发)
- [环境变量](#环境变量)
- [主要 API](#主要-api)
- [目录结构](#目录结构)
- [常用运维命令](#常用运维命令)
- [优化方向](#优化方向)

---

## 系统概述

### 核心亮点

- **全流程外贸业务链路**：线索 → 客户 → 联系人 → 报价单 → 形式发票 → 订单 → 交付，每环节状态机完整
- **多账户邮件集成**：一个用户可绑定多个邮箱（Gmail / Outlook / 企业邮箱），IMAP 收件 + SMTP 发件，统一归集
- **邮件智能追踪**：发出邮件自动嵌入跟踪像素，区分 HUMAN / PROXY / PREFETCH / BOT 类型，记录打开置信度（openConfidence）、首次人工阅读时间、点击链接事件
- **邮件-客户自动关联**：根据发件域名匹配客户，邮件自动挂接到对应客户时间线
- **邮件活动跟进**：发出首封邮件后自动创建跟进任务，收到回复后自动关闭，支持手动新建、延期、转移
- **动态 RBAC 权限体系**：自定义角色 + 细粒度接口权限（60+ 权限码），内置 ADMIN / SALESPERSON / FINANCE 三角色
- **全量审计日志**：所有关键操作（谁、什么时间、什么 IP、改了什么、结果如何）完整记录，含价格变更前后值对比
- **形式发票 PDF 生成**：支持多银行账户、PI 模板预设、审批流程（草稿→待审批→通过/拒绝）、贸易条款、付款方式
- **公海线索池**：线索支持「公开池」模式，业务员可自由认领/释放，支持批量分配
- **全量数据备份与恢复**：ZIP 格式导出（含 CSV），异步队列处理，支持破坏性全量恢复
- **实时汇率**：后端轮询中国银行现汇买入价（USD_CNY / EUR_CNY / EUR_USD），15 分钟缓存，失败指数退避
- **WebSocket 即时消息**：基于 Socket.IO 的团队一对一实时通讯，含打字状态、已读回执
- **Docker 一键部署 / 一键升级**：含 Nginx SSL 终止、自动迁移、随机密钥生成

### 业务流程图

```
销售线索 (Lead)  ──────────────────────────────────────────────────────────────┐
  Stage: NEW → CONTACTED → QUALIFIED → PROPOSAL → NEGOTIATION → CLOSED_WON/LOST │
    ↓ 转化 (convert)                                                             │
客户 (Customer)  ←── 邮件域名自动关联 ←── 邮件 (Email)                           │
  Status: POTENTIAL / ACTIVE / INACTIVE / BLACKLISTED                           │
    ↓ 建立                                                                       │
联系人 (Contact)  [姓名 / 职位 / 邮箱 / 电话 / WhatsApp / 微信]                  │
    ↓ 发起                                                                       │
报价单 (Quotation)                         跟进任务 (FollowUp) ←── 邮件发出自动创建│
  Status: DRAFT → SENT → VIEWED → ACCEPTED / REJECTED / EXPIRED                │
    ↓ 转为                                                                       │
形式发票 (ProformaInvoice / PI)                                                  │
  Status: DRAFT → PENDING_APPROVAL → APPROVED / REJECTED                        │
  ↓ 审批通过，生成 PDF                                                           │
订单 (Order)                                                                     │
  OrderStatus: PENDING → CONFIRMED → IN_PRODUCTION → SHIPPED → DELIVERED / CANCELLED
  PaymentStatus: UNPAID → PARTIAL → PAID / REFUNDED                             │
    ↓ 关联                                                                       │
任务(Task) / 文件(Document) / 活动时间线(Activity) / 邮件(Email)                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 技术架构

### 技术栈

| 层级 | 技术 | 版本 | 说明 |
|------|------|------|------|
| **前端框架** | Next.js | 14 (App Router) | SSR + 客户端路由，页面按模块组织 |
| **UI 库** | React | 18 | 函数组件 + Hooks |
| **类型系统** | TypeScript | 5 | 前后端全量类型覆盖 |
| **样式** | Tailwind CSS | 3 | 原子化 CSS，响应式布局 |
| **后端框架** | NestJS | 10 | 模块化架构，依赖注入，装饰器驱动 |
| **ORM** | Prisma | 5 | 类型安全查询，自动迁移，Schema First |
| **数据库** | PostgreSQL | 16 | 主数据库，含复合索引优化 |
| **缓存 / 队列** | Redis 7 + BullMQ | — | 异步任务队列（邮件收发、PDF、备份）|
| **实时通讯** | Socket.IO | — | WebSocket 即时消息，JWT 鉴权 |
| **邮件收件** | node-imap + mailparser | — | IMAP 多账户收件、附件懒加载 |
| **邮件发件** | Nodemailer | — | SMTP 发件，HTML 链接改写 + 跟踪像素注入 |
| **PDF 生成** | pdfkit | — | 服务端生成形式发票 PDF |
| **反向代理** | Nginx (Alpine) | — | SSL 终止、静态资源缓存、gzip 压缩 |
| **容器编排** | Docker + Compose | — | 五服务编排（pg / redis / backend / frontend / nginx）|
| **API 文档** | Swagger / OpenAPI | — | 自动生成，访问 `/api-docs` |

### 关键依赖

**前端** (`frontend/package.json`)

| 包 | 用途 |
|----|------|
| `axios` | HTTP 请求客户端 |
| `swr` | 数据请求缓存与重新验证 |
| `zustand` | 轻量全局状态管理 |
| `chart.js` + `react-chartjs-2` | 仪表盘图表 |
| `socket.io-client` | WebSocket 实时消息 |
| `react-grid-layout` | 仪表盘拖拽布局 |
| `dayjs` | 日期格式化 |
| `react-hot-toast` | 消息通知 Toast |
| `react-icons` | 图标库 |

**后端** (`backend/package.json`)

| 包 | 用途 |
|----|------|
| `@nestjs/jwt` + `passport-jwt` | JWT 签发与验证 |
| `@prisma/client` | 数据库 ORM 客户端 |
| `bcryptjs` | 密码哈希 |
| `nodemailer` | SMTP 发件 |
| `node-imap` + `mailparser` | IMAP 收件与邮件解析 |
| `pdfkit` | PDF 生成（发票）|
| `@nestjs/bullmq` + `bullmq` | 异步任务队列 |
| `@nestjs/schedule` | 定时任务（汇率轮询）|
| `@nestjs/websockets` + `socket.io` | WebSocket 网关 |
| `multer` | 文件上传处理 |
| `class-validator` + `class-transformer` | DTO 自动校验 |
| `archiver` | ZIP 打包（数据备份导出）|

### 系统架构图

```
                        ┌─────────────────────────────┐
                        │       Nginx (Alpine)         │
                        │  :80 → HTTPS 重定向          │
                        │  :443 SSL 终止 + 路由分发     │
                        │  gzip / 安全响应头 / 大文件上传│
                        └────────────┬────────────────┘
                                     │
              ┌──────────────────────┴──────────────────────┐
              │                                             │
   ┌──────────▼──────────┐                      ┌──────────▼──────────┐
   │   Frontend (:3000)   │                      │   Backend (:3001)   │
   │   Next.js 14         │◄──── REST + WS ─────►│   NestJS 10         │
   │   App Router / TSX   │     /api/*            │   Prisma ORM        │
   │   Tailwind CSS        │     /socket.io/*      │   BullMQ Workers    │
   └──────────────────────┘     /uploads/*        └──────────┬──────────┘
                                                             │
              ┌──────────────────────┬──────────────────────┤
              │                      │                      │
   ┌──────────▼──────────┐ ┌────────▼────────┐  ┌──────────▼──────────┐
   │   PostgreSQL 16      │ │    Redis 7       │  │   IMAP / SMTP       │
   │   主数据库 (:5432)    │ │  队列 + 缓存     │  │   Gmail / Outlook   │
   │   21 个模型           │ │  BullMQ Jobs    │  │   企业邮箱           │
   │   复合索引优化        │ │  汇率缓存 15min  │  │   附件懒加载         │
   └──────────────────────┘ └─────────────────┘  └──────────────────────┘

   Nginx 路由规则：
   /api/*         → backend:3001 (NestJS REST API)
   /socket.io/*   → backend:3001 (WebSocket)
   /ws/*          → backend:3001 (WebSocket 备用)
   /uploads/*     → backend:3001 (静态文件, 7天缓存)
   /api-docs      → backend:3001 (Swagger 文档)
   /*.{js,css}    → frontend:3000 (静态资源, 30天缓存)
   /              → frontend:3000 (Next.js SSR)
```

---

## 数据库设计

共 **30+ 个模型**，基于 Prisma Schema，PostgreSQL 16 存储。

### 枚举类型

```prisma
enum Role {
  ADMIN        // 管理员（动态 RBAC，默认拥有所有权限 *）
  SALESPERSON  // 业务员
  FINANCE      // 财务人员
  // 支持通过 Role 表创建自定义角色，角色代码存为字符串
}

enum CustomerStatus   { POTENTIAL ACTIVE INACTIVE BLACKLISTED }
enum LeadStage        { NEW CONTACTED QUALIFIED PROPOSAL NEGOTIATION CLOSED_WON CLOSED_LOST }
enum FollowUpStatus   { PENDING DONE DISMISSED SNOOZED }
enum QuotationStatus  { DRAFT SENT VIEWED ACCEPTED REJECTED EXPIRED }
enum PIStatus         { DRAFT PENDING_APPROVAL APPROVED REJECTED }
enum TradeTerm        { EXW FOB CIF CIP DPU DDP FCA FAS CFR }
enum PaymentTerm      { T_30 T_50 T_70 T_100 }  // 预付比例 30/50/70/100%
enum OrderStatus      { PENDING CONFIRMED IN_PRODUCTION SHIPPED DELIVERED CANCELLED }
enum PaymentStatus    { UNPAID PARTIAL PAID REFUNDED }
enum TaskPriority     { LOW MEDIUM HIGH URGENT }
enum TaskStatus       { PENDING IN_PROGRESS COMPLETED CANCELLED }
enum ActivityType     { NOTE CALL MEETING EMAIL TASK STATUS_CHANGE PRICE_DISCUSSION
                        ORDER_INTENT SAMPLE MOLD_FEE PAYMENT SHIPPING COMPLAINT VISIT }
enum EmailDirection   { INBOUND OUTBOUND }
enum EmailStatus      { DRAFT SENT RECEIVED FAILED READ VIEWED }
enum EmailOpenKind    { HUMAN PROXY PREFETCH BOT DUP }
enum CampaignStatus   { DRAFT SENDING SENT ARCHIVED }
enum AuditStatus      { SUCCESS FAILURE }
```

### 用户与权限模型

**User**（用户）
```
id           String   @id
email        String   @unique
password     String   // bcrypt 哈希
name         String
role         String   // 角色代码（ADMIN / SALESPERSON / FINANCE / 自定义）
phone        String?
avatar       String?  // 头像文件路径
bio          String?  // 个性签名
isActive     Boolean  @default(true)
isSuperAdmin Boolean  @default(false)  // 首位注册用户，不可删除/降权
preferences  Json?    // 用户个性化配置
birthday     DateTime?
createdAt    DateTime
updatedAt    DateTime
```

**Role**（角色定义表）
```
id          String  @id
code        String  @unique   // 角色唯一码，如 ADMIN / custom_role
name        String            // 显示名称
description String?
isBuiltin   Boolean @default(false)  // 内置角色不可删除
createdAt   DateTime
updatedAt   DateTime
```

**Permission**（权限码表）
```
id          String  @id
code        String  @unique   // 如 customer:delete / order:update
name        String
description String?
category    String  // 分组，如 customer / order / system
createdAt   DateTime
```

**RolePermission**（角色-权限多对多）
```
id           String  @id
role         String            // 角色 code
permissionId String            // → Permission.id
createdAt    DateTime
@@index([role, permissionId])
```

**AuditLog**（审计日志）
```
id          String   @id
userId      String
userEmail   String
userName    String
userRole    String
action      String   // 如 customer.delete / order.price.update
targetType  String   // 如 Customer / Order
targetId    String?
targetLabel String?  // 被操作对象的名称快照
method      String   // HTTP 方法
path        String   // 请求路径
ip          String?
userAgent   String?
status      AuditStatus  // SUCCESS / FAILURE
errorMessage String?
metadata    Json?    // 含价格变更前后值等扩展信息
createdAt   DateTime
@@index([userId])
@@index([action])
@@index([targetType, targetId])
@@index([createdAt])
```

### 客户与联系人模型

**Customer**（客户）
```
id          String         @id
companyName String
country     String?        // 60+ 国家/地区
address     String?
website     String?        // 主域名（用于邮件自动关联）
website2    String?        // 副域名
industry    String?
scale       String?        // 公司规模
source      String?        // 来源：LinkedIn / Instagram / Facebook / TikTok 等
status      CustomerStatus // POTENTIAL / ACTIVE / INACTIVE / BLACKLISTED
remark      String?
ownerId     String         // → User.id（负责人）
createdAt   DateTime
updatedAt   DateTime
```

**Contact**（联系人）
```
id         String   @id
name       String
title      String?  // 职位
email      String?
phone      String?
wechat     String?
whatsapp   String?
isPrimary  Boolean  @default(false)
remark     String?
customerId String   // → Customer.id
createdAt  DateTime
updatedAt  DateTime
```

### 线索与跟进模型

**Lead**（销售线索）
```
id             String     @id
title          String
companyName    String?
contactName    String?
contactTitle   String?
contactEmail   String?
email          String?
phone          String?
country        String?
region         String?
city           String?
address        String?
postalCode     String?
website        String?
industry       String?
companySize    String?
description    String?
stage          LeadStage  // NEW → CLOSED_WON / CLOSED_LOST
source         String?
score          Int?        // 线索评分 0-100
isPublicPool   Boolean    @default(false)  // 是否进入公海池
estimatedValue Decimal?   // 预估价值
currency       String?
expectedAmount Decimal?
expectedDate   DateTime?
lastContactAt  DateTime?
nextFollowUpAt DateTime?
notes          String?
priority       String?
customerId     String?    // 转化后关联客户
ownerId        String?    // 为空表示在公海池
creatorId      String
createdAt      DateTime
updatedAt      DateTime
```

**LeadActivity**（线索跟进记录）
```
id        String   @id
content   String
leadId    String   // → Lead.id
ownerId   String   // → User.id
createdAt DateTime
```

**FollowUp**（邮件跟进任务）
```
id             String        @id
leadId         String?       // → Lead.id
customerId     String?       // → Customer.id
triggerEmailId String?       // 触发此跟进的邮件 id
ownerId        String        // → User.id（负责人）
dueAt          DateTime      // 到期时间
status         FollowUpStatus // PENDING / DONE / DISMISSED / SNOOZED
reason         String?       // 创建原因，如 FIRST_OUTREACH
notes          String?
completedAt    DateTime?
completedById  String?
createdAt      DateTime
updatedAt      DateTime
@@index([ownerId, status, dueAt])
@@index([leadId])
@@index([triggerEmailId])
```

### 报价与财务模型

**Quotation**（报价单）
```
id          String          @id
quotationNo String          @unique  // 报价单号
customerId  String
ownerId     String
title       String
currency    String          @default("USD")
totalAmount Decimal
status      QuotationStatus // DRAFT → SENT → VIEWED → ACCEPTED/REJECTED/EXPIRED
validUntil  DateTime?
terms       String?
remark      String?
pdfUrl      String?
createdAt   DateTime
updatedAt   DateTime
```

**QuotationItem**（报价明细）
```
id          String  @id
quotationId String
productName String
description String?
unit        String?
quantity    Decimal
unitPrice   Decimal
totalPrice  Decimal
sortOrder   Int     @default(0)
```

**ProformaInvoice**（形式发票 PI）
```
id                 String    @id
piNo               String    @unique
customerId         String
ownerId            String
status             PIStatus  // DRAFT → PENDING_APPROVAL → APPROVED/REJECTED
sellerId           String?
sellerAddress      String?
consigneeName      String?
consigneeAddress   String?
poNo               String?
currency           String
tradeTerm          TradeTerm    // EXW/FOB/CIF/CIP/DPU/DDP/FCA/FAS/CFR
paymentTerm        PaymentTerm  // T_30/T_50/T_70/T_100
shippingMethod     String?
portOfLoading      String?
portOfDischarge    String?
placeOfDelivery    String?
paymentMethod      String?
countryOfOrigin    String?
termsOfDelivery    String?
notes              String?
validityPeriod     Int?
subtotal           Decimal
shippingCharge     Decimal  @default(0)
other              Decimal  @default(0)
totalAmount        Decimal
bankAccountId      String?  // → BankAccount.id
templateId         String?  // → PITemplate.id
approverId         String?
approvedAt         DateTime?
rejectionReason    String?
createdAt          DateTime
updatedAt          DateTime
```

**ProformaInvoiceItem**（PI 明细）
```
id          String  @id
piId        String
productName String
description String?
hsn         String?   // 海关编码
unit        String?
quantity    Decimal
unitPrice   Decimal
totalPrice  Decimal
sortOrder   Int
```

**BankAccount**（银行账户）
```
id           String  @id
alias        String         // 账户别名
bankInfoText String  @db.Text  // 完整银行信息文本（用于 PI PDF）
isDefault    Boolean @default(false)
sortOrder    Int     @default(0)
createdAt    DateTime
updatedAt    DateTime
```

**PITemplate**（PI 模板）
```
id               String     @id
name             String
description      String?
isDefault        Boolean    @default(false)
currency         String?
tradeTerm        TradeTerm?
paymentTerm      PaymentTerm?
shippingMethod   String?
paymentMethod    String?
portOfLoading    String?
portOfDischarge  String?
placeOfDelivery  String?
countryOfOrigin  String?
termsOfDelivery  String?    @db.Text
notes            String?    @db.Text
validityPeriod   Int?
bankAccountId    String?
sortOrder        Int        @default(0)
createdAt        DateTime
updatedAt        DateTime
```

**Order**（订单）
```
id            String        @id
orderNo       String        @unique
customerId    String
ownerId       String
title         String
currency      String        @default("USD")
totalAmount   Decimal
status        OrderStatus   // PENDING → DELIVERED/CANCELLED
paymentStatus PaymentStatus // UNPAID → PAID/REFUNDED
costTypes     String[]      // 多选：MOLD/CERTIFICATION/FREIGHT/EQUIPMENT/NRE
floorPrice    Decimal?      // 公司底价（内部参考）
shippingAddr  String?
shippingDate  DateTime?
deliveryDate  DateTime?
trackingNo    String?
remark        String?
createdAt     DateTime
updatedAt     DateTime
```

**OrderItem**（订单明细）
```
id          String  @id
orderId     String
productName String
description String?
unit        String?
quantity    Decimal
unitPrice   Decimal
totalPrice  Decimal
sortOrder   Int
```

### 邮件系统模型

**EmailConfig**（邮箱账户配置）
```
id         String  @id
userId     String
emailAddr  String
smtpHost   String
smtpPort   Int
smtpUser   String
smtpPass   String  // 加密存储
smtpSecure Boolean
imapHost   String
imapPort   Int
imapUser   String
imapPass   String
imapSecure Boolean
fromName   String?
signature  String? @db.Text
createdAt  DateTime
updatedAt  DateTime
```

**Email**（邮件记录）
```
id               String         @id
messageId        String         @unique  // RFC 2822 Message-ID
threadId         String?        // 会话线程 id
emailConfigId    String
fromAddr         String
fromName         String?
toAddr           String
cc               String?
bcc              String?
subject          String
bodyHtml         String?        @db.Text
bodyText         String?        @db.Text
direction        EmailDirection // INBOUND / OUTBOUND
status           EmailStatus    // DRAFT/SENT/RECEIVED/FAILED/READ/VIEWED
category         String         @default("inbox")
flagged          Boolean        @default(false)
sentAt           DateTime?
receivedAt       DateTime?
viewedAt         DateTime?
viewCount        Int            @default(0)
firstHumanOpenAt DateTime?      // 首次人工阅读时间
lastOpenedAt     DateTime?
totalClicks      Int            @default(0)
openConfidence   Float          @default(0)  // 0-1，基于事件类型计算
campaignId       String?
recipientId      String?
customerId       String?        // 关联客户（域名匹配）
senderId         String?
createdAt        DateTime
updatedAt        DateTime
```

**EmailAttachment**（邮件附件）
```
id           String   @id
emailId      String
fileName     String
mimeType     String
size         Int
contentId    String?  // inline 图片 CID
isInline     Boolean  @default(false)
imapUid      Int?     // 用于懒加载时从 IMAP 拉取
imapFolder   String?
storagePath  String?  // 下载后本地路径
downloadedAt DateTime?
createdAt    DateTime
```

**EmailOpenEvent** / **EmailClickEvent** / **EmailLink**（追踪事件）
```
// OpenEvent: emailId, openedAt, ip, userAgent, referer, kind(HUMAN/PROXY/PREFETCH/BOT/DUP), source(PIXEL/CLICK_INFERRED)
// ClickEvent: emailId, linkId, url, clickedAt, ip, userAgent, referer, kind
// EmailLink:  emailId, linkId, url, label, position（改写后的链接原始信息）
```

**EmailTemplate / EmailCampaign / EmailRecipient**
```
// Template:  name, subject, bodyHtml, category
// Campaign:  name, description, createdById, status(DRAFT/SENDING/SENT/ARCHIVED), sentAt
// Recipient: emailAddr(unique), name, customerId, contactId,
//            firstSeenAt, lastSentAt, lastOpenedAt, lastClickedAt,
//            totalSent, totalOpens, totalClicks
```

### 其余模型

**Task**（任务）
```
id          String       @id
title       String
description String?
priority    TaskPriority // LOW/MEDIUM/HIGH/URGENT
status      TaskStatus   // PENDING/IN_PROGRESS/COMPLETED/CANCELLED
dueDate     DateTime?
ownerId     String       // 创建者
assigneeId  String?      // 被指派人（管理员可指派给业务员）
relatedType String?      // 关联对象类型
relatedId   String?      // 关联对象 id
createdAt   DateTime
updatedAt   DateTime
```

**Activity**（客户时间线）
```
id          String       @id
type        ActivityType // NOTE/CALL/MEETING/EMAIL/TASK/STATUS_CHANGE/
                         // PRICE_DISCUSSION/ORDER_INTENT/SAMPLE/MOLD_FEE/
                         // PAYMENT/SHIPPING/COMPLAINT/VISIT
content     String
customerId  String
ownerId     String
relatedType String?      // 可关联 Order / Lead / Email 等
relatedId   String?
createdAt   DateTime
```

**Document**（文件）
```
id          String   @id
fileName    String
filePath    String   // uploads/ 下的相对路径（UUID 重命名）
fileSize    Int
mimeType    String
category    String?
customerId  String?
ownerId     String
relatedType String?
relatedId   String?
createdAt   DateTime
```

**Message**（团队消息）
```
id        String   @id
fromId    String   // → User.id
toId      String   // → User.id
content   String
isRead    Boolean  @default(false)
createdAt DateTime
@@index([toId, isRead])
@@index([fromId])
```

**Memo**（备忘录）
```
id        String   @id
title     String
content   String?  @db.Text
color     String   @default("#ffffff")  // 便签颜色
date      DateTime?
ownerId   String
createdAt DateTime
updatedAt DateTime
```

**SystemSetting**（系统参数 KV）
```
id    String @id
key   String @unique  // company_name / company_logo / company_address 等
value String @db.Text
label String?
```

---

## 功能模块

### 1. 仪表盘

业务数据总览，区分普通用户视图与管理员视图。

**普通用户指标**
- 客户总数、线索总数、订单总数、总营收（排除 CANCELLED 订单）
- 待处理任务数（PENDING 状态）、本月新增线索数
- 12 个月销售趋势折线图（金额 + 数量）
- 线索阶段漏斗图（各 Stage 数量分布）
- 业绩排行榜（Top 销售员）

**管理员专属视图**
- 团队整体数据（按 month / quarter / year 维度切换）
- 每个业务员的成交量、营收明细
- 跟进任务 KPI（待处理数、逾期数、完成率）
- 趋势图（day / month 粒度，自定义天数范围）

**API**
```
GET /dashboard/stats                  # 当前用户关键指标
GET /dashboard/sales-trend            # 月度销售趋势
GET /dashboard/funnel                 # 线索阶段漏斗
GET /dashboard/rankings               # 销售排行榜
GET /dashboard/admin/overview         # 管理员团队概览（需 ADMIN 角色）
GET /dashboard/admin/salesperson-stats # 每人业绩明细
GET /dashboard/admin/follow-up-progress # 跟进 KPI
GET /dashboard/admin/trend            # 趋势图（?granularity=day|month&days=30）
```

---

### 2. 客户管理

**功能列表**
- 多字段客户档案：公司名、国家（60+ 国家/地区）、地址、主副网站域名、行业、规模、来源（LinkedIn / Instagram / Facebook / TikTok 等）、状态、备注
- 客户列表支持分页、搜索、按状态/来源/负责人筛选
- 角色数据隔离：业务员只看自己负责的客户，管理员/财务可见全部
- **客户详情页时间线**：自动聚合该客户所有活动记录（邮件、报价、订单、任务、拜访、投诉等），按时间倒序排列
- **邮件域名自动关联**：收发邮件时根据 `website` / `website2` 字段匹配，自动挂接到客户
- **沉睡客户检测**：`GET /customers/dormant?days=30&limit=20`，查找超过 N 天未联系的客户
- 支持手动同步邮件关联：`POST /customers/:id/sync-emails`

**API**
```
GET    /customers                     # 列表（分页 + 筛选）
GET    /customers/dormant             # 沉睡客户列表
GET    /customers/:id                 # 客户详情 + 时间线
POST   /customers                     # 新建客户（ownerId 默认为当前用户）
PATCH  /customers/:id                 # 更新客户信息
DELETE /customers/:id                 # 删除客户
POST   /customers/:id/sync-emails     # 按域名同步邮件关联
POST   /customers/:id/refresh-timeline # 刷新活动时间线
```

**权限码**：`customer:read` `customer:create` `customer:update` `customer:delete` `customer:assign`

---

### 3. 联系人管理

每个客户可挂载多个联系人，记录完整沟通信息。

**字段**：姓名、职位、邮箱、电话、微信、WhatsApp、是否主要联系人、备注

**API**
```
GET    /contacts                      # 列表（?customerId=&search=&page=&pageSize=）
GET    /contacts/:id                  # 联系人详情
POST   /contacts                      # 新建联系人
PATCH  /contacts/:id                  # 更新
DELETE /contacts/:id                  # 删除
```

---

### 4. 销售线索

全生命周期状态机管理，支持公海池、批量操作、CSV 导入导出。

**核心特性**
- **7 阶段状态机**：NEW → CONTACTED → QUALIFIED → PROPOSAL → NEGOTIATION → CLOSED_WON / CLOSED_LOST
- **公海池机制**：`isPublicPool=true` 时所有业务员可见，可自由认领（claim）或释放（release）
- **线索评分**：0-100 分，人工评估潜力
- **跟进记录**（LeadActivity）：每条跟进含时间戳和内容，独立于客户活动时间线
- **CSV 批量操作**：支持导入（`POST /leads/import/csv`）和导出（`GET /leads/export/csv`）
- **批量操作**：批量分配负责人、批量释放到公海、批量删除
- **一键转化**：`POST /leads/:id/convert` 将线索转化为客户，数据迁移

**API**
```
GET    /leads                         # 列表（?scope=mine|pool|all）
GET    /leads/export/csv              # 导出 CSV
POST   /leads/import/csv              # 导入 CSV（multipart/form-data）
GET    /leads/:id                     # 线索详情
GET    /leads/:id/activities          # 跟进记录列表
POST   /leads/:id/activities          # 添加跟进记录
POST   /leads                         # 新建线索
PATCH  /leads/:id                     # 更新线索
PATCH  /leads/:id/stage               # 仅更新阶段
POST   /leads/:id/claim               # 认领（ownerId → 当前用户）
POST   /leads/:id/release             # 释放到公海（ownerId → null）
POST   /leads/:id/assign              # 指派给指定用户
POST   /leads/:id/convert             # 转化为客户
POST   /leads/batch-assign            # 批量分配（body: {ids, ownerId}）
POST   /leads/batch-release           # 批量释放到公海
POST   /leads/batch-delete            # 批量删除
DELETE /leads/:id                     # 删除线索
```

**权限码**：`lead:read` `lead:create` `lead:update` `lead:delete` `lead:assign`

---

### 5. 邮件跟进（FollowUp）

邮件发出后自动触发跟进提醒，支持完成、延期、转移、驳回。

**工作流**
1. 发送首封外发邮件 → 后端自动创建 FollowUp（`reason: FIRST_OUTREACH`，dueAt = 发送时间 + 3天）
2. 收到客户回复 → 自动将关联 FollowUp 状态置为 DONE
3. 到期未处理 → 逾期标记，管理员可在「团队跟进概览」中查看全员逾期情况
4. 业务员可手动操作：标记完成、延期 N 天（SNOOZED）、驳回（DISMISSED）、转移给他人

**API**
```
GET    /follow-ups/summary            # 当前用户待处理/逾期数量摘要
GET    /follow-ups/admin/overview     # 管理员：全员跟进概览
GET    /follow-ups                    # 列表（?status=&overdueOnly=&leadId=&ownerId=）
POST   /follow-ups                    # 手动新建跟进
PATCH  /follow-ups/:id/done           # 标记完成
PATCH  /follow-ups/:id/snooze         # 延期（body: {days: N}）
PATCH  /follow-ups/:id/dismiss        # 驳回/忽略
PATCH  /follow-ups/:id/reassign       # 转移给其他人（body: {ownerId}）
DELETE /follow-ups/:id                # 删除
```

---

### 6. 邮件中心

多账户统一邮件管理，含收发件、追踪、模板、群发活动。

**核心特性**

**多账户管理**
- 每个用户可绑定多个邮箱账号（Gmail / Outlook / 企业邮箱）
- 每账户独立配置 SMTP（发件）和 IMAP（收件）参数
- 支持测试 SMTP 连接是否可用

**收发件**
- IMAP 异步同步（BullMQ 队列，不阻塞请求）：收件箱 / 发件箱 / 已发送 / 草稿
- 左右三栏布局：账户列表 → 邮件列表 → 邮件内容
- 支持回复、转发、附件上传
- **附件懒加载**：附件元信息随邮件存入数据库，正文内容按需从 IMAP 拉取，不占用存储
- 基于 `In-Reply-To` / `References` 头将邮件归入会话线程

**邮件追踪（发出邮件）**
- 发送时自动在 HTML 正文末尾注入 1x1 像素跟踪图片（`/emails/track/:id/pixel.png`）
- 正文中所有超链接改写为跟踪重定向链接（`/emails/track/:id/click/:linkId`）
- 打开事件分类：HUMAN / PROXY / PREFETCH / BOT / DUP（重复），计算 `openConfidence`（0-1）
- 记录：`firstHumanOpenAt`（首次人工阅读）、`lastOpenedAt`、`totalClicks`、`viewCount`

**邮件模板 & 群发活动**
- 创建/管理邮件模板（含 subject + HTML body + 分类）
- 邮件活动（Campaign）：批量群发，追踪每个收件人的打开/点击统计
- EmailRecipient 表记录每个收件人的历史行为（总发送数、总打开数、总点击数）

**API**
```
# 邮箱账户
GET    /emails/accounts               # 当前用户的邮箱账户列表
GET    /emails/accounts/:id           # 账户详情
POST   /emails/accounts               # 添加邮箱账户（SMTP + IMAP 配置）
PUT    /emails/accounts/:id           # 更新账户配置
DELETE /emails/accounts/:id           # 删除账户
POST   /emails/accounts/:id/test      # 测试 SMTP 连通性
POST   /emails/accounts/:id/fetch     # 触发 IMAP 同步（异步入队）

# 邮件
GET    /emails                        # 邮件列表（?campaignId=&status=&direction=&page=）
GET    /emails/:id                    # 邮件详情（含追踪统计）
POST   /emails/send                   # 发送邮件（异步队列，含追踪像素注入）
DELETE /emails/:id                    # 删除邮件

# 模板
GET    /emails/templates              # 模板列表
POST   /emails/templates              # 新建模板

# 活动群发
GET    /emails/campaigns              # 群发活动列表
POST   /emails/campaigns              # 新建活动
PATCH  /emails/campaigns/:id          # 更新活动

# 追踪（公开路由，无需登录）
GET    /emails/track/:emailId/pixel.png          # 追踪像素（返回 1x1 GIF）
GET    /emails/track/:emailId/click/:linkId      # 点击追踪（302 重定向到原链接）
```

---

### 7. 报价单管理

**核心特性**
- 多行产品明细（productName / 描述 / 单位 / 数量 / 单价 / 小计），`sortOrder` 支持拖拽排序
- 报价单状态流：DRAFT → SENT → VIEWED → ACCEPTED / REJECTED / EXPIRED
- 一键生成 PDF（服务端 pdfkit 渲染，返回 base64）
- 发送报价单邮件：`POST /quotations/:id/send`，自动附带 PDF 附件
- 有效期字段 `validUntil`，过期后状态自动标记 EXPIRED
- 支持付款条款、备注字段

**API**
```
GET    /quotations                    # 列表
GET    /quotations/:id                # 详情（含明细行）
POST   /quotations                    # 新建（body 含 items 数组）
PATCH  /quotations/:id                # 更新
DELETE /quotations/:id                # 删除
POST   /quotations/:id/pdf            # 生成 PDF（返回 base64）
POST   /quotations/:id/send           # 发送报价邮件
```

**权限码**：`quotation:read` `quotation:create` `quotation:update` `quotation:delete` `quotation:send`

---

### 8. 形式发票（PI）

**核心特性**
- 完整的外贸单据字段：卖方/买方信息、PO 号、贸易条款（EXW/FOB/CIF 等 9 种）、付款条款（T_30/T_50/T_70/T_100）、装运港/目的港、原产地、交货条款
- 多行产品明细，含 HSN 海关编码字段
- 费用分项：小计 + 运费 + 其他费用 = 总金额
- **银行账户多选**：关联 BankAccount 表，PI PDF 自动填入银行信息
- **PI 模板**：预设常用字段（贸易条款、付款方式、港口信息等），创建 PI 时一键套用
- **审批流程**：DRAFT → PENDING_APPROVAL → APPROVED / REJECTED，记录审批人、审批时间、拒绝原因
- 一键生成并下载 PDF

**API**
```
GET    /pis                           # 列表
GET    /pis/:id                       # 详情（含明细行）
POST   /pis                           # 新建（body 含 items 数组）
PATCH  /pis/:id                       # 更新
DELETE /pis/:id                       # 删除
POST   /pis/:id/submit-approval       # 提交审批（DRAFT → PENDING_APPROVAL）
POST   /pis/:id/approve               # 审批通过（→ APPROVED，记录 approverId）
POST   /pis/:id/reject                # 拒绝（→ REJECTED，body: {reason}）
POST   /pis/:id/pdf                   # 生成 PDF
GET    /pis/:id/download              # 下载 PDF 文件流

# 银行账户（设置子模块）
GET    /settings/bank-accounts        # 列表（按 sortOrder 排序）
POST   /settings/bank-accounts        # 新建银行账户
PATCH  /settings/bank-accounts/:id    # 更新
DELETE /settings/bank-accounts/:id    # 删除

# PI 模板（设置子模块）
GET    /settings/pi-templates         # 列表
POST   /settings/pi-templates         # 新建模板
PATCH  /settings/pi-templates/:id     # 更新
DELETE /settings/pi-templates/:id     # 删除
```

**权限码**：`pi:read` `pi:create` `pi:update` `pi:delete` `pi:approve`

---

### 9. 订单管理

**核心特性**
- 订单明细（productName / 单位 / 数量 / 单价 / 小计），支持多行
- **双状态独立管理**：OrderStatus（生产/物流进度）与 PaymentStatus（付款进度）分开更新
- **费用类型多选**（`costTypes` 数组）：MOLD（模具费）/ CERTIFICATION（认证费）/ FREIGHT（货运费）/ EQUIPMENT（设备费）/ NRE（NRE 费用）
- **公司底价**（`floorPrice`）：内部参考字段，不对客户展示
- 物流信息：发货地址、货运单号、发货日期、交付日期
- **数据隔离**：业务员只能看自己的订单，FINANCE / ADMIN 可见全部
- **写操作权限**：订单创建/更新/删除仅限 ADMIN 和 SALESPERSON；FINANCE 只读
- **价格审计**：修改 totalAmount / floorPrice 时，AuditLog 记录变更前后值

**API**
```
GET    /orders                        # 列表（角色自动过滤）
GET    /orders/:id                    # 订单详情（含明细行）
POST   /orders                        # 新建（body 含 items 数组）
PATCH  /orders/:id                    # 更新订单信息
PATCH  /orders/:id/status             # 更新订单状态（OrderStatus）
PATCH  /orders/:id/payment            # 更新付款状态（PaymentStatus）
DELETE /orders/:id                    # 删除订单
```

**权限码**：`order:read` `order:create` `order:update` `order:delete` `order:status` `order:payment`

---

### 10. 任务管理

- 优先级四级：LOW / MEDIUM / HIGH / URGENT
- 状态流：PENDING → IN_PROGRESS → COMPLETED / CANCELLED
- **管理员可将任务指派给指定业务员**（`assigneeId` 字段）
- 支持关联任意对象（`relatedType` + `relatedId`，如关联客户或订单）
- 截止时间提醒

**API**
```
GET    /tasks                         # 列表
GET    /tasks/:id                     # 详情
POST   /tasks                         # 新建
PATCH  /tasks/:id                     # 更新
DELETE /tasks/:id                     # 删除
```

**权限码**：`task:read` `task:create` `task:update` `task:delete`

---

### 11. 团队消息

基于 Socket.IO 的实时一对一即时通讯。

**实现机制**
- WebSocket 网关挂载在 `/ws/messages`，连接时验证 JWT Token
- 实时推送事件：`message:new`（新消息）、`conversation:update`（会话更新）、`typing`（打字状态）
- 消息列表 HTTP 接口兼容轮询（无 WebSocket 时降级）
- 未读角标：侧边栏实时显示未读消息总数
- **用户资料卡**：点击头像弹出对方完整资料（姓名 / 角色 / 个性签名 / 邮箱 / 电话）

**API**
```
GET    /messages                      # 会话列表（含最后一条消息 + 未读数）
GET    /messages/with/:userId         # 与某用户的历史消息（分页，自动标记已读）
POST   /messages                      # 发送消息（body: {toId, content}）
GET    /messages/:id                  # 单条消息
PATCH  /messages/:id                  # 标记已读
```

---

### 12. 文件管理

- 文件上传最大 50MB，服务端以 UUID 重命名后存储至 `uploads/` 目录
- 支持按客户、关联对象类型（`relatedType`）、分类（`category`）筛选
- 文件下载（流式响应）、删除

**API**
```
POST   /documents/upload              # 上传文件（multipart/form-data）
GET    /documents                     # 列表（?customerId=&category=&relatedType=&relatedId=）
GET    /documents/:id/download        # 下载文件（流）
DELETE /documents/:id                 # 删除
```

---

### 13. 备忘录

个人便签，支持颜色标记与日期筛选。

```
GET    /memos                         # 列表（?date=&month=）
GET    /memos/range                   # 按日期范围查询（?start=&end=）
POST   /memos                         # 新建（title / content / color / date）
PATCH  /memos/:id                     # 更新
DELETE /memos/:id                     # 删除
```

---

### 14. 实时汇率

顶栏常驻显示，所有页面均可见。

**实现机制**
- 后端定时任务（`@nestjs/schedule`）轮询中国银行现汇买入价
- 成功：内存缓存 15 分钟后重新拉取；失败：指数退避（30s → 60s → 2m → 4m → 最大 5m）
- 前端每 15 分钟自动刷新一次，鼠标悬停显示最近更新时间

```
GET /rates   # 返回 { base, source, updatedAt, rates: { USD_CNY, EUR_CNY, EUR_USD } }
```

---

### 15. 客户活动时间线

记录客户维度的所有交互历史，支持 13 种活动类型。

| 类型 | 说明 |
|------|------|
| `NOTE` | 文字备注 |
| `CALL` | 电话沟通 |
| `MEETING` | 会议/拜访 |
| `EMAIL` | 邮件往来（自动关联） |
| `TASK` | 任务记录 |
| `STATUS_CHANGE` | 客户状态变更 |
| `PRICE_DISCUSSION` | 价格讨论 |
| `ORDER_INTENT` | 购买意向 |
| `SAMPLE` | 样品寄送 |
| `MOLD_FEE` | 模具费沟通 |
| `PAYMENT` | 付款记录 |
| `SHIPPING` | 发货/物流 |
| `COMPLAINT` | 投诉处理 |
| `VISIT` | 客户拜访 |

```
POST /activities                      # 新建活动记录
GET  /activities                      # 当前用户的活动列表
GET  /activities/customer/:customerId # 某客户的时间线（分页）
```

---

### 16. 管理后台

**RBAC 权限管理**（`/admin/rbac`，仅 ADMIN）
- 内置角色：ADMIN（拥有 `*` 通配符权限）、SALESPERSON、FINANCE（各有默认权限集）
- 支持新建自定义角色，自由分配 60+ 细粒度权限码
- 权限码按模块分组：`customer:*` / `order:*` / `pi:*` / `email:*` / `rbac:*` / `audit:read` 等

```
GET    /permissions                          # 所有权限码列表
GET    /permissions/roles                    # 所有角色列表
GET    /permissions/roles/:code/permissions  # 某角色的权限列表
POST   /permissions/roles                    # 新建自定义角色
PATCH  /permissions/roles/:code              # 更新角色信息
DELETE /permissions/roles/:code              # 删除自定义角色（内置角色不可删）
POST   /permissions/roles/:code/permissions  # 批量分配权限
DELETE /permissions/roles/:code/permissions/:permCode  # 移除单个权限
```

**审计日志**（`/admin/audit-logs`，仅 ADMIN）
- 记录字段：操作者（id/email/name/role）、操作类型、目标对象、HTTP 方法/路径、IP、UserAgent、结果（SUCCESS/FAILURE）、扩展元数据（含价格变更前后值）
- 支持多维度查询：按用户、操作类型、目标对象、时间范围、关键词搜索

```
GET /audit-logs   # 查询审计日志（?userId=&action=&targetType=&status=&from=&to=&search=&page=）
```

**数据备份与恢复**
- **导出**：ZIP 包含业务数据 CSV（客户/联系人/线索/报价/订单/任务/活动/用户），不含邮件和审计日志
- **异步导出**：大数据量时入队后台处理，返回 `jobId` 供前端查询进度
- **恢复（破坏性）**：上传 ZIP 包后清空并重建业务表数据，最大支持 200MB

```
GET    /backup/export             # 同步导出 ZIP（流式响应）
POST   /backup/export/async       # 异步导出（返回 jobId）
POST   /backup/import             # 导入恢复（multipart/form-data，max 200MB）
```

**权限码**：`backup:export` `backup:import`

**系统设置**
- 公司信息：名称、地址、电话、网站
- Logo 上传（自动同步为浏览器标签图标，`favicon`）
- 全量系统参数 KV 读写

```
GET    /settings                  # 获取所有系统参数
PUT    /settings                  # 批量更新（key-value 数组）
GET    /settings/logo             # 获取 Logo（公开路由）
POST   /settings/logo             # 上传 Logo（max 5MB）
GET    /settings/company-info     # 获取公司信息
PUT    /settings/company-info     # 更新公司信息
```

**翻译与天气**
```
POST   /translate                 # 文本翻译（body: {segments:[{index,text}], target:"zh-CN"}）
GET    /weather                   # 天气查询（?city=北京）
```

---

## 角色权限

### 内置角色

| 角色 | 代码 | 权限范围 |
|------|------|---------|
| 管理员 | `ADMIN` | 通配符 `*`，拥有全部权限；可管理用户、系统参数、数据备份、RBAC、审计日志 |
| 业务员 | `SALESPERSON` | 全部业务模块读写（客户/线索/报价/PI/订单/任务/邮件/文件）；数据隔离：只能看自己负责的客户和订单 |
| 财务人员 | `FINANCE` | **只读**所有订单和报价；无法创建/修改/删除业务数据；可编辑自己的个人资料 |

### 细粒度权限码

```
# 用户
user:read / user:create / user:update / user:delete

# 客户
customer:read / customer:create / customer:update / customer:delete / customer:assign

# 线索
lead:read / lead:create / lead:update / lead:delete / lead:assign

# 报价
quotation:read / quotation:create / quotation:update / quotation:delete / quotation:send

# 形式发票
pi:read / pi:create / pi:update / pi:delete / pi:approve

# 订单
order:read / order:create / order:update / order:delete / order:status / order:payment

# 邮件
email:read / email:send / email:delete / email:config

# 任务
task:read / task:create / task:update / task:delete

# 活动 / 文件 / 跟进
activity:read / activity:create
document:read / document:upload / document:delete
followup:read / followup:create / followup:update

# 系统管理
settings:read / settings:update
backup:export / backup:import
rbac:read / rbac:update
audit:read
```

### 权限实现机制

```
请求 → JwtAuthGuard（验证 JWT）
      → PermissionsGuard（加载角色权限，检查 @RequirePermissions 装饰器）
      → RolesGuard（检查 @Roles 装饰器，硬编码角色限制）
      → Controller 方法
```

- ADMIN 角色持有 `*` 通配符，`hasPermission('*', 'customer:delete')` 返回 true
- 自定义角色从 `RolePermission` 表动态加载权限列表
- `@Public()` 装饰器标记的路由跳过所有鉴权（如追踪像素、Logo 接口）
- 用户删除时所有关联数据（客户/线索/订单）自动转移给超级管理员

### 个人资料（所有角色可操作）

所有用户均可自助修改：头像、手机号、个性签名（bio）、密码；姓名和角色字段只读（需管理员修改）。

---

## 快速部署

### 前置要求

- Linux 服务器（Ubuntu 20.04+ / CentOS 7+ / Debian 10+）
- 内存 2GB+，磁盘 20GB+
- Docker & Docker Compose（deploy.sh 可自动安装）

### 一键部署

```bash
git clone https://github.com/Yangdongle668/CRM && cd CRM
chmod +x deploy.sh
./deploy.sh
```

脚本自动完成以下步骤：
1. 检测并安装 Docker / Docker Compose
2. 生成随机数据库密码（20位）和 JWT 密钥（40位）
3. 创建 `.env` 配置文件
4. 构建全部镜像（backend / frontend / nginx）
5. 启动所有容器（postgres → redis → backend → frontend → nginx）
6. 执行数据库迁移（`prisma migrate deploy`）
7. 打印访问地址

访问 `http://<服务器IP>` 进入系统，首次注册的用户自动成为超级管理员。

### 升级

```bash
./deploy.sh upgrade
# 自动：git pull → 重新构建镜像 → 执行新迁移 → 重启容器
```

### 其他操作

```bash
./deploy.sh dev      # 本地开发模式（仅启动 pg + redis，本地跑前后端）
./deploy.sh stop     # 停止所有容器
./deploy.sh restart  # 重启所有容器
./deploy.sh logs     # 查看容器日志
./deploy.sh reset    # 危险：销毁所有数据（--volumes + 删除 .env）
```

### Docker Compose 服务

| 服务 | 镜像 | 端口 | 说明 |
|------|------|------|------|
| postgres | postgres:16 | 5432 | 主数据库，volume 持久化，health check |
| redis | redis:7 | 6379 | 队列 + 缓存，volume 持久化 |
| backend | 本地构建 | 3001 | NestJS API，depends on postgres+redis |
| frontend | 本地构建 | 3000 | Next.js，depends on backend |
| nginx | nginx:alpine | 80 / 443 | SSL 终止 + 反向代理，client_max_body_size 200M |

---

## 本地开发

### 前置条件

- Node.js 18+ / npm 9+
- PostgreSQL 16
- Redis 7

### 后端

```bash
cd backend
npm install

# 首次初始化数据库
npx prisma migrate dev
npx prisma generate

# 启动（热重载，:3001）
npm run start:dev

# Swagger 文档
open http://localhost:3001/api-docs
```

### 前端

```bash
cd frontend
npm install

# 启动开发服务器（:3000）
npm run dev
```

### 生产构建

```bash
# 后端
cd backend && npm run build && npm run start:prod

# 前端
cd frontend && npm run build && npm start
```

---

## 环境变量

### 时区 / 服务器时钟

系统在多处记录时间戳（邮件 `sentAt`、活动时间线、审计日志等），依赖容器和宿主机的
系统时间准确且一致。`docker-compose.yml` 已经为所有服务设置 `TZ=Asia/Shanghai` 并
将宿主机的 `/etc/localtime` 只读挂载进容器；但 **真正的时间源仍然是宿主机**，如果
宿主机时钟漂移（例如看到"发件时间比实际时间晚 N 分钟"），必须先在宿主机开启 NTP
同步：

```bash
# Ubuntu / Debian
timedatectl set-ntp true
timedatectl status         # 确认 NTP service: active / System clock synchronized: yes

# CentOS / RHEL
sudo systemctl enable --now chronyd
chronyc tracking           # 查看当前偏差
```

也可以直接调用后端诊断接口核对服务端时间：

```
GET /api/dashboard/time    # 返回 { serverTime, epochMs, tz, tzOffsetMinutes }
```

需要切换时区（例如部署到海外团队）时，在根目录 `.env` 设置 `TZ=...`（IANA 区名，
如 `Europe/Berlin`）然后重启服务即可。

### `backend/.env`

| 变量 | 说明 | 示例 |
|------|------|------|
| `DATABASE_URL` | PostgreSQL 连接串 | `postgresql://crm_user:pass@localhost:5432/trade_crm` |
| `REDIS_HOST` | Redis 主机 | `localhost` |
| `REDIS_PORT` | Redis 端口 | `6379` |
| `JWT_SECRET` | JWT 签名密钥（务必保密） | 40 位随机字符串 |
| `JWT_EXPIRES_IN` | Token 有效期 | `7d` |
| `PORT` | 后端监听端口 | `3001` |
| `NODE_ENV` | 运行环境 | `production` |
| `APP_URL` | 对外访问地址（邮件追踪像素用） | `https://crm.example.com` |
| `UPLOAD_DIR` | 文件上传目录 | `./uploads` |
| `EMAIL_TRACKING_SECRET` | 追踪链接 HMAC 签名密钥 | 随机字符串 |
| `CORS_ORIGIN` | 允许的跨域来源 | `http://localhost:3000` |

### 根目录 `.env`（Docker Compose 用）

| 变量 | 说明 |
|------|------|
| `POSTGRES_USER` | 数据库用户名（默认 `crm_user`）|
| `POSTGRES_PASSWORD` | 数据库密码（deploy.sh 自动生成）|
| `POSTGRES_DB` | 数据库名（默认 `trade_crm`）|
| `JWT_SECRET` | JWT 密钥（deploy.sh 自动生成）|
| `FRONTEND_PORT` | 前端端口（默认 3000）|
| `BACKEND_PORT` | 后端端口（默认 3001）|
| `NGINX_PORT` | Nginx HTTP 端口（默认 80）|

---

## 目录结构

```
CRM/
├── backend/
│   ├── src/
│   │   ├── modules/                  # 业务模块（每个模块含 controller / service / dto / module）
│   │   │   ├── auth/                 # JWT 认证、登录、注册、系统初始化检测
│   │   │   ├── users/                # 用户管理、头像上传、超管转移
│   │   │   ├── customers/            # 客户档案、域名邮件关联、沉睡检测
│   │   │   ├── contacts/             # 联系人
│   │   │   ├── leads/                # 线索全生命周期、公海池、批量操作、CSV 导入导出
│   │   │   ├── follow-ups/           # 邮件跟进任务、自动触发/关闭
│   │   │   ├── quotations/           # 报价单、PDF 生成、邮件发送
│   │   │   ├── pis/                  # 形式发票、审批流、PDF 生成下载
│   │   │   ├── orders/               # 订单、双状态管理、价格审计
│   │   │   ├── emails/               # 多账户邮件、IMAP 同步、追踪像素、群发活动
│   │   │   ├── tasks/                # 任务管理、优先级、指派
│   │   │   ├── activities/           # 客户时间线、13 种活动类型
│   │   │   ├── messages/             # 团队即时消息、WebSocket 网关
│   │   │   ├── documents/            # 文件上传下载
│   │   │   ├── memos/                # 个人备忘录
│   │   │   ├── dashboard/            # 仪表盘统计、图表数据
│   │   │   ├── settings/             # 系统参数、Logo、公司信息、银行账户、PI 模板
│   │   │   ├── permissions/          # RBAC 角色权限管理
│   │   │   ├── audit/                # 审计日志查询
│   │   │   ├── backup/               # 数据备份导出/导入
│   │   │   ├── rates/                # 实时汇率轮询缓存
│   │   │   ├── translate/            # 文本翻译
│   │   │   └── weather/              # 天气查询
│   │   ├── common/
│   │   │   ├── guards/               # JwtAuthGuard / RolesGuard / PermissionsGuard
│   │   │   ├── decorators/           # @CurrentUser / @Public / @Roles / @RequirePermissions
│   │   │   ├── permissions/          # PermissionsService（权限加载与校验）
│   │   │   ├── filters/              # HttpExceptionFilter（全局错误格式化）
│   │   │   ├── interceptors/         # TransformInterceptor（统一响应封装）
│   │   │   └── pipes/                # ValidationPipe（DTO 自动校验）
│   │   ├── queue/                    # BullMQ 队列定义（email / pdf / backup）
│   │   ├── prisma/                   # PrismaService
│   │   └── main.ts                   # 应用入口，全局中间件注册
│   ├── prisma/
│   │   ├── schema.prisma             # 30+ 模型定义
│   │   └── migrations/               # 所有迁移文件（按时间戳命名）
│   └── uploads/                      # 上传文件存储（头像 / Logo / 附件）
│
├── frontend/
│   └── src/
│       ├── app/                      # Next.js 14 App Router 页面
│       │   ├── (auth)/login/         # 登录页
│       │   ├── dashboard/            # 仪表盘
│       │   ├── customers/            # 客户列表 + [id] 详情
│       │   ├── contacts/             # 联系人
│       │   ├── leads/                # 线索管理
│       │   ├── follow-ups/           # 跟进任务
│       │   ├── quotations/           # 报价单
│       │   ├── pis/                  # 形式发票 + [id] 详情
│       │   ├── orders/               # 订单管理
│       │   ├── emails/               # 邮件中心
│       │   ├── tasks/                # 任务管理
│       │   ├── messages/             # 团队消息
│       │   ├── documents/            # 文件管理
│       │   ├── memos/                # 备忘录
│       │   ├── settings/             # 系统设置
│       │   └── admin/
│       │       ├── rbac/             # 角色权限管理
│       │       └── audit-logs/       # 审计日志
│       ├── components/               # 可复用组件（Sidebar / Modal / Pagination / 邮件 UI 等）
│       ├── contexts/                 # AuthContext / LogoContext
│       ├── lib/                      # API 客户端（axios 封装）/ constants
│       └── types/                    # TypeScript 类型定义
│
├── nginx/
│   └── nginx.conf                    # 反向代理配置（HTTP→HTTPS 重定向、路由规则、gzip、安全头）
├── docker-compose.yml                # 五服务编排
├── deploy.sh                         # 一键部署/升级/重置脚本
└── README.md
```

---

## 常用运维命令

```bash
# 查看实时日志
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f nginx

# 进入数据库交互
docker compose exec postgres psql -U crm_user -d trade_crm

# 手动执行数据库迁移
docker compose exec backend npx prisma migrate deploy

# 查看 Prisma Studio（数据库可视化）
docker compose exec backend npx prisma studio

# 重启单个服务
docker compose restart backend
docker compose restart frontend

# 完全重新构建（不丢数据）
docker compose down
docker compose up -d --build

# 查看容器状态
docker compose ps

# 查看磁盘占用
docker system df

# 清理无用镜像
docker image prune -f
```

---

## 优化方向

以下按优先级和性价比排序，供后续迭代参考。

### 高优先级 ⭐⭐⭐

1. **文件存储迁移到对象存储**
   - 当前头像、Logo、附件全部存本地 `uploads/`，多实例部署时无法共享，备份不便
   - 接入 S3 兼容存储（阿里云 OSS / MinIO / AWS S3），使用预签名 URL 直传直下
   - 顺便加图片压缩和 CDN 加速

2. **完善测试覆盖**
   - 目前无单元测试和 E2E 测试，核心业务逻辑缺乏保障
   - 添加 Jest 单测覆盖 `*.service.ts`（订单创建、权限校验、邮件追踪计算等）
   - 用 Playwright 做关键路径 E2E（登录 → 创建订单 → 发邮件 → 查看追踪）

3. **全文搜索**
   - 当前搜索基于 `ILIKE`，客户/订单/邮件量大时性能下降明显
   - 接入 PostgreSQL `tsvector` + `tsquery`，或引入 MeiliSearch
   - 支持跨模块全局搜索（客户 + 线索 + 邮件 + 订单一框搜索）

4. **API 限流与安全加固**
   - 登录接口缺乏暴力破解防护，接入 `@nestjs/throttler` 限流
   - HTTPS 强制 + Let's Encrypt 自动续签脚本
   - 安全响应头完善（CSP / HSTS 已有，继续补充）
   - 文件上传增加 MIME 校验防止伪造

### 中优先级 ⭐⭐

5. **前端性能优化**
   - 客户/订单大列表用 `react-window` 虚拟滚动
   - 客户详情时间线改为无限滚动或分页（活动记录膨胀后页面卡顿）
   - 邮件列表正文懒加载（IntersectionObserver）
   - Next.js `<Image>` 组件统一替换 `<img>`

6. **数据库性能优化**
   - `Email`、`Activity`、`AuditLog`、`Message` 表随时间线性膨胀
   - 增加按月分区或定期归档机制
   - 为高频查询补充复合索引（`customerId + createdAt`、`ownerId + status` 等）

7. **邮件模板引擎化**
   - 当前模板为纯文本 + 简单变量替换
   - 升级为 Handlebars/MJML，支持条件判断、列表渲染、响应式 HTML 邮件
   - 模板变量自动从客户/联系人资料提取（称呼、公司名、国家）

8. **CI/CD 流水线**
   - GitHub Actions 实现：代码提交 → Lint → 测试 → 构建 Docker 镜像 → 推送镜像仓库
   - 服务器端 Webhook 自动拉取新镜像、滚动重启（蓝绿部署）

### 低优先级 ⭐

9. **移动端适配** — 当前响应式仅满足大屏，手机访问体验差，适配 iPad / 手机布局
10. **多语言 i18n** — 引入 `next-intl`，支持中英文界面切换（外贸场景海外同事演示需要）
11. **数据可视化增强** — 销售漏斗、客户地图分布、邮件打开率趋势、按国家/季度统计报表
12. **系统监控** — 接入 Prometheus + Grafana 监控 API 响应时间/错误率，Sentry 收集异常
13. **数据库主从备份** — 目前仅 JSON 快照，补充 PostgreSQL WAL 归档或定时 pg_dump

### 产品层面 💡

| 功能 | 说明 |
|------|------|
| 客户标签系统 | 自定义标签，快速筛选潜在客户 |
| 邮件合并发送 | 批量群发，每封邮件填入不同变量（称呼、产品等）|
| 客户跟进提醒 | 超过 N 天未联系自动提醒业务员（结合现有 FollowUp 模块扩展）|
| 展会/询盘管理 | 从广交会、阿里国际站等渠道导入询盘数据 |
| 多币种统计 | 订单金额统一换算到基准货币（结合实时汇率）|
| 佣金/提成计算 | 按订单 `totalAmount` 和 `floorPrice` 自动计算业务员提成 |
| 客户满意度 | 订单完成后自动发送满意度调查邮件 |

---

## License

Private project. All rights reserved.
