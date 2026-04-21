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
