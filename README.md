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
