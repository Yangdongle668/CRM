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
