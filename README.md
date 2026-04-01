# 外贸CRM系统 - 使用与配置文档

## 目录

- [系统概述](#系统概述)
- [技术架构](#技术架构)
- [快速部署](#快速部署)
- [本地开发](#本地开发)
- [环境变量配置](#环境变量配置)
- [功能模块说明](#功能模块说明)
- [数据库设计](#数据库设计)
- [API 接口](#api-接口)
- [默认账户](#默认账户)
- [常用运维命令](#常用运维命令)
- [目录结构](#目录结构)
- [常见问题](#常见问题)

---

## 系统概述

外贸CRM系统是一款专为外贸企业设计的客户关系管理平台，支持客户管理、销售线索跟踪、报价/订单管理、邮件营销、任务协作等核心业务流程。系统采用中文界面，贴合国内外贸团队使用习惯。

### 核心特性

- 客户与联系人管理（含客户详情页、活动时间线）
- **邮件自动关联客户**：根据客户网站域名自动匹配收发邮件，并在时间线生成记录
- 销售线索全生命周期管理（新线索 → 联系 → 资质确认 → 报价 → 谈判 → 成交/丢失）
- 报价单 & 订单管理（含行项明细）
- 邮件中心（分栏布局、收件箱/发件箱全量同步、在线回复/转发、邮件模板）
- 邮件已读追踪（跟踪像素检测客户打开邮件，详情页显示已读时间和次数）
- 客户时间线（价格讨论、订单意向、样品、模具费、付款、物流、投诉、拜访等）
- 任务管理（优先级、状态、到期提醒）
- 文件管理（上传/分类/关联客户）
- 数据仪表盘（业务数据概览）
- 全量数据备份导出与导入（JSON 格式，一键备份恢复）
- 60+ 国家/地区选项，细分社交媒体来源（LinkedIn、Instagram、Facebook、TikTok 等）
- Apple 风格简洁 UI（毛玻璃效果、圆角设计、流畅动画）
- 角色权限控制（管理员 / 业务员）
- Docker 一键部署，**一键升级**（`./deploy.sh upgrade`）

---

## 技术架构

| 层级 | 技术栈 |
|------|--------|
| **前端** | Next.js 14 + React 18 + TypeScript + Tailwind CSS |
| **后端** | NestJS 10 + TypeScript + Prisma ORM |
| **数据库** | PostgreSQL 16 |
| **缓存** | Redis 7 |
| **反向代理** | Nginx |
| **容器化** | Docker + Docker Compose |

### 前端主要依赖

| 包名 | 用途 |
|------|------|
| `axios` | HTTP 请求 |
| `swr` | 数据请求 & 缓存 |
| `zustand` | 轻量状态管理 |
| `chart.js` + `react-chartjs-2` | 数据图表 |
| `react-hot-toast` | 消息提示 |
| `react-icons` | 图标库 (Heroicons) |
| `dayjs` | 日期处理 |

### 后端主要依赖

| 包名 | 用途 |
|------|------|
| `@nestjs/jwt` + `passport-jwt` | JWT 认证 |
| `@prisma/client` | 数据库 ORM |
| `bcryptjs` | 密码加密 |
| `nodemailer` | 邮件发送 (SMTP) |
| `imap` + `mailparser` | 邮件接收 (IMAP) |
| `pdfkit` | PDF 报价单生成 |
| `class-validator` | 请求参数校验 |
| `@nestjs/swagger` | API 文档 |

---

## 快速部署

### 前置要求

- Linux 服务器（Ubuntu 20.04+ / CentOS 7+ / Debian 10+）
- 2GB+ 内存
- Docker & Docker Compose（脚本会自动安装）

### 一键部署

```bash
# 克隆项目
git clone <repo-url> && cd CRM

# 赋予执行权限并运行
chmod +x deploy.sh
./deploy.sh
```

脚本会自动完成以下步骤：
1. 检测并安装 Docker / Docker Compose
2. 生成随机数据库密码和 JWT 密钥
3. 创建 `.env` 和 `backend/.env` 配置文件
4. 构建镜像并启动所有容器
5. 等待数据库就绪后执行迁移和数据初始化
6. 显示访问地址和默认账户信息

部署完成后通过 `http://<服务器IP>` 访问系统。

---

## 本地开发

### 前置要求

- Node.js 18+
- npm 或 yarn
- Docker（用于运行 PostgreSQL 和 Redis）

### 启动开发环境

```bash
# 方式一：使用部署脚本的 dev 模式（推荐）
./deploy.sh dev
```

这会自动启动 PostgreSQL + Redis 容器，安装依赖，初始化数据库。

```bash
# 方式二：手动启动

# 1. 启动数据库和缓存
docker compose up -d postgres redis

# 2. 配置后端环境变量
cp backend/.env.example backend/.env
# 编辑 backend/.env 修改配置

# 3. 安装后端依赖并初始化数据库
cd backend
npm install
npx prisma generate
npx prisma migrate dev --name init
npx prisma db seed
cd ..

# 4. 安装前端依赖
cd frontend
npm install
cd ..
```

### 启动开发服务

```bash
# 终端 1：启动后端（热重载）
cd backend
npm run start:dev
# 后端运行在 http://localhost:3001

# 终端 2：启动前端（热重载）
cd frontend
npm run dev
# 前端运行在 http://localhost:3000
```

---

## 环境变量配置

### 根目录 `.env`（Docker Compose 使用）

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DB_PASSWORD` | PostgreSQL 数据库密码 | `crm_password` |
| `JWT_SECRET` | JWT 签名密钥 | `change-this-jwt-secret-in-production` |
| `FRONTEND_PORT` | 前端端口 | `3000` |
| `BACKEND_PORT` | 后端端口 | `3001` |
| `NGINX_PORT` | Nginx 端口 | `80` |

### 后端 `backend/.env`

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `DATABASE_URL` | PostgreSQL 连接字符串 | `postgresql://crm_user:crm_password@localhost:5432/trade_crm?schema=public` |
| `REDIS_HOST` | Redis 地址 | `localhost` |
| `REDIS_PORT` | Redis 端口 | `6379` |
| `JWT_SECRET` | JWT 签名密钥 | — |
| `JWT_EXPIRES_IN` | JWT 过期时间 | `7d` |
| `PORT` | 后端监听端口 | `3001` |
| `NODE_ENV` | 运行环境 | `development` |
| `UPLOAD_DIR` | 文件上传目录 | `./uploads` |
| `MAX_FILE_SIZE` | 最大上传文件大小 (字节) | `10485760` (10MB) |
| `DEFAULT_SMTP_HOST` | 默认 SMTP 服务器 | `smtp.example.com` |
| `DEFAULT_SMTP_PORT` | 默认 SMTP 端口 | `465` |
| `DEFAULT_IMAP_HOST` | 默认 IMAP 服务器 | `imap.example.com` |
| `DEFAULT_IMAP_PORT` | 默认 IMAP 端口 | `993` |

### 前端 `frontend/.env.local`

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `NEXT_PUBLIC_API_URL` | 后端 API 地址 | `http://localhost:3001` |

> **生产环境安全提示**：请务必修改 `JWT_SECRET` 和 `DB_PASSWORD` 为强随机字符串。使用 `./deploy.sh` 部署时会自动生成随机密钥。

---

## 功能模块说明

### 1. 仪表盘 (`/dashboard`)

业务数据总览页面，展示关键业务指标和统计图表，包括客户总数、活跃线索、本月订单额、待办任务数等。

### 2. 客户管理 (`/customers`)

| 功能 | 说明 |
|------|------|
| 客户列表 | 支持按公司名搜索、按状态/来源/行业筛选、分页 |
| 新建客户 | 填写公司名、国家（60+ 国家）、行业、规模、来源（细分社交平台）、网站等 |
| 客户详情 (`/customers/[id]`) | 查看客户完整信息、联系人列表、活动时间线、关联邮件 |
| 邮件自动关联 | 填写客户网站后，该域名的企业邮箱来往邮件自动关联并生成时间线记录 |
| 状态管理 | 潜在客户 → 活跃客户 → 非活跃客户 / 黑名单 |

**客户来源**：展会、阿里巴巴、Google广告、LinkedIn、Facebook、Instagram、TikTok、Twitter/X、YouTube、Pinterest、WhatsApp、客户推荐、电话开发、邮件开发、独立站、其他

**客户状态说明：**
- `POTENTIAL` - 潜在客户（新录入，尚未成交）
- `ACTIVE` - 活跃客户（已有业务往来）
- `INACTIVE` - 非活跃客户（长期未联系）
- `BLACKLISTED` - 黑名单

### 3. 联系人 (`/contacts`)

管理客户公司下的联系人，支持设定主要联系人。记录姓名、职位、邮箱、电话、微信、WhatsApp 等联系方式。

### 4. 销售线索 (`/leads`)

| 阶段 | 英文标识 | 说明 |
|------|---------|------|
| 新线索 | `NEW` | 刚录入的潜在商机 |
| 已联系 | `CONTACTED` | 已与客户取得联系 |
| 已确认 | `QUALIFIED` | 确认客户有真实需求 |
| 报价中 | `PROPOSAL` | 已向客户发送报价 |
| 谈判中 | `NEGOTIATION` | 正在议价/协商条款 |
| 已成交 | `CLOSED_WON` | 成功转化为订单 |
| 已丢失 | `CLOSED_LOST` | 未能成交 |

支持预期金额、预期成交日期、优先级、来源等字段。

### 5. 邮件中心 (`/emails`)

- **分栏布局**：左侧邮件列表（380px），右侧邮件详情与回复区
- **收件箱 & 发件箱全量同步**：通过 IMAP 同步全部历史邮件（无日期限制），自动检测 Sent 文件夹（支持 Hostinger、网易企业邮箱、QQ、Gmail、Outlook 等 20+ 文件夹命名规则）
- **邮件自动关联客户**：根据客户录入的公司网站域名，自动匹配收发邮件并关联到对应客户（排除 gmail/qq/163 等公共邮箱域名），同时在客户时间线自动生成邮件记录（含发件人姓名）
- **在线回复/转发**：分栏内直接回复，自动引用原文并关联邮件线程
- **邮件已读追踪**：发送的邮件嵌入跟踪像素，客户打开后自动记录已读时间和次数，发件箱详情页显示"收件人已读 · 时间 · 打开次数"
- **已读通知**：页面右上角绿色信封图标，实时展示最近 24 小时内被客户打开的邮件
- **未读提醒**：每 60 秒轮询，新邮件到达时弹窗通知
- **邮件模板**：内置开发信、跟进、订单确认等模板
- **统一账密**：SMTP/IMAP 使用同一组邮箱账号密码，无需重复填写

用户需在 **系统设置 → 邮件配置** 中配置邮箱信息后方可使用。

**已测试兼容的邮箱服务商**：Hostinger、网易企业邮箱(qiye.163.com)、QQ 邮箱、Gmail、Outlook

### 6. 报价管理 (`/quotations`)

- 创建报价单（含行项明细：产品名、数量、单价、总价）
- 报价单状态：草稿 → 已发送 → 已查看 → 已接受/已拒绝/已过期
- 支持多币种（默认 USD）
- 支持生成 PDF 报价单
- 报价单有效期设置

### 7. 订单管理 (`/orders`)

- 创建订单（含行项明细）
- 订单状态流转：待确认 → 已确认 → 生产中 → 已发货 → 已交付 / 已取消
- 付款状态跟踪：未付款 → 部分付款 → 已付款 / 已退款
- 物流信息（收货地址、发货日期、快递单号）

### 8. 任务管理 (`/tasks`)

- 创建待办任务，可关联客户
- 优先级：低 / 中 / 高 / 紧急
- 状态：待处理 → 进行中 → 已完成 / 已取消
- 到期日期设置

### 9. 文件管理 (`/documents`)

上传和管理业务文件，支持按分类、关联客户组织。记录文件名、大小、MIME 类型等元信息。

### 10. 系统设置 (`/settings`，仅管理员)

- **用户管理**：创建/编辑/删除用户账户，分配角色
- **邮箱配置**：SMTP/IMAP 服务器参数、统一账密、发件人名称、邮件签名
- **系统参数**：自定义 key-value 参数
- **数据备份**：一键导出全量数据为 JSON 文件，支持从备份文件恢复

### 11. 客户时间线

客户详情页内的时间线功能，支持记录外贸业务全流程关键节点：

| 类型 | 说明 |
|------|------|
| 备注 | 一般性备注记录 |
| 电话 | 电话沟通记录 |
| 会议 | 线上/线下会议 |
| 邮件 | 邮件往来记录 |
| 任务 | 任务关联记录 |
| 状态变更 | 客户状态变化 |
| 价格讨论 | 报价、议价沟通 |
| 订单意向 | 客户下单意向确认 |
| 样品 | 样品寄送、确认 |
| 模具费 | 模具开发费用讨论 |
| 付款 | 付款进度跟踪 |
| 物流 | 发货、物流跟踪 |
| 投诉 | 客户投诉处理 |
| 拜访 | 客户拜访记录 |

---

## 数据库设计

系统使用 PostgreSQL，通过 Prisma ORM 管理。主要数据表：

| 表名 | 说明 | 关键字段 |
|------|------|---------|
| `users` | 用户 | email, name, role (ADMIN/SALESPERSON) |
| `email_configs` | 邮箱配置 | smtp/imap 参数，关联 user |
| `customers` | 客户 | companyName, country, industry, status, owner |
| `contacts` | 联系人 | name, email, phone, wechat, whatsapp, 关联 customer |
| `leads` | 销售线索 | title, stage, expectedAmount, 关联 customer/owner |
| `emails` | 邮件 | subject, body, direction, status, viewedAt, viewCount, 关联 customer |
| `email_threads` | 邮件会话 | 邮件线程分组 |
| `email_templates` | 邮件模板 | name, subject, bodyHtml, category |
| `quotations` | 报价单 | quotationNo, totalAmount, status, validUntil |
| `quotation_items` | 报价明细 | productName, quantity, unitPrice, totalPrice |
| `orders` | 订单 | orderNo, totalAmount, status, paymentStatus |
| `order_items` | 订单明细 | productName, quantity, unitPrice, totalPrice |
| `tasks` | 任务 | title, priority, status, dueDate |
| `activities` | 活动记录 | type (NOTE/CALL/MEETING/EMAIL/TASK/PRICE_DISCUSSION/ORDER_INTENT/SAMPLE/MOLD_FEE/PAYMENT/SHIPPING/COMPLAINT/VISIT), content |
| `documents` | 文件 | fileName, filePath, fileSize, mimeType |
| `system_settings` | 系统设置 | key-value 键值对 |

### 数据库管理命令

```bash
# 生成 Prisma Client
npx prisma generate

# 创建迁移（开发环境）
npx prisma migrate dev --name <migration_name>

# 执行迁移（生产环境）
npx prisma migrate deploy

# 初始化种子数据
npx prisma db seed

# 打开 Prisma Studio（可视化数据库管理）
npx prisma studio
```

---

## API 接口

后端 API 基础路径为 `/api`，所有接口（除认证接口外）需在请求头携带 JWT Token：

```
Authorization: Bearer <token>
```

### 认证模块

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/login` | 登录（返回 JWT Token） |
| POST | `/api/auth/register` | 注册新用户 |

### 客户模块

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/customers` | 客户列表（支持分页、搜索、筛选） |
| GET | `/api/customers/:id` | 客户详情 |
| POST | `/api/customers` | 创建客户 |
| PATCH | `/api/customers/:id` | 更新客户 |
| DELETE | `/api/customers/:id` | 删除客户 |

### 联系人模块

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/contacts` | 联系人列表 |
| POST | `/api/contacts` | 创建联系人 |
| PATCH | `/api/contacts/:id` | 更新联系人 |
| DELETE | `/api/contacts/:id` | 删除联系人 |

### 销售线索模块

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/leads` | 线索列表 |
| POST | `/api/leads` | 创建线索 |
| PATCH | `/api/leads/:id` | 更新线索 |
| DELETE | `/api/leads/:id` | 删除线索 |

### 报价单模块

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/quotations` | 报价单列表 |
| GET | `/api/quotations/:id` | 报价单详情（含明细行） |
| POST | `/api/quotations` | 创建报价单 |
| PATCH | `/api/quotations/:id` | 更新报价单 |
| DELETE | `/api/quotations/:id` | 删除报价单 |

### 订单模块

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/orders` | 订单列表 |
| GET | `/api/orders/:id` | 订单详情（含明细行） |
| POST | `/api/orders` | 创建订单 |
| PATCH | `/api/orders/:id` | 更新订单 |
| DELETE | `/api/orders/:id` | 删除订单 |

### 邮件模块

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/emails` | 邮件列表 |
| POST | `/api/emails/send` | 发送邮件（支持 inReplyTo 回复关联） |
| POST | `/api/emails/fetch` | 手动触发 IMAP 邮件同步 |
| GET | `/api/emails/unread-count` | 获取未读邮件数 |
| GET | `/api/emails/recently-viewed` | 获取最近 24 小时客户已读邮件 |
| PATCH | `/api/emails/:id/read` | 标记邮件为已读 |
| GET | `/api/emails/track/:id/pixel.png` | 邮件跟踪像素（公开接口，无需认证） |
| GET | `/api/emails/templates` | 邮件模板列表 |
| POST | `/api/emails/templates` | 创建邮件模板 |

### 任务模块

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tasks` | 任务列表 |
| POST | `/api/tasks` | 创建任务 |
| PATCH | `/api/tasks/:id` | 更新任务 |
| DELETE | `/api/tasks/:id` | 删除任务 |

### 其他模块

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/dashboard` | 仪表盘统计数据 |
| GET | `/api/activities` | 活动记录列表 |
| POST | `/api/activities` | 创建活动记录 |
| POST | `/api/documents/upload` | 上传文件 |
| GET | `/api/documents` | 文件列表 |
| GET | `/api/users` | 用户列表 |
| PATCH | `/api/users/:id` | 更新用户信息 |
| GET | `/api/settings` | 获取系统设置 |
| PUT | `/api/settings` | 更新系统设置 |
| PUT | `/api/settings/email-config` | 更新邮箱配置 |
| GET | `/api/backup/export` | 导出全量数据备份（JSON 下载） |
| POST | `/api/backup/import` | 导入备份数据（覆盖现有数据） |

---

## 默认账户

系统初始化后提供以下测试账户：

| 角色 | 邮箱 | 密码 | 说明 |
|------|------|------|------|
| 管理员 | `admin@crm.com` | `admin123` | 拥有全部权限，可访问系统设置 |
| 业务员 | `zhangsan@crm.com` | `sales123` | 张三，普通业务员 |
| 业务员 | `lisi@crm.com` | `sales123` | 李四，普通业务员 |

> **安全提示**：首次登录后请立即修改默认密码！

系统还附带示例数据：3 个客户（美国/德国/日本）、3 个联系人、3 条销售线索、3 个任务、4 条活动记录、3 个邮件模板。

---

## 常用运维命令

```bash
# ==================== 一键操作 ====================
./deploy.sh                     # 首次部署（完整安装）
./deploy.sh upgrade             # 一键升级（拉取代码 + 重新构建 + 迁移）
./deploy.sh dev                 # 启动本地开发环境
./deploy.sh stop                # 停止所有服务
./deploy.sh restart             # 重启所有服务
./deploy.sh logs                # 查看所有日志
./deploy.sh logs backend        # 查看后端日志
./deploy.sh reset               # 完全重置（清除所有数据，慎用！）

# ==================== Docker Compose ====================
docker compose ps                   # 查看所有容器状态
docker compose logs -f              # 查看实时日志
docker compose logs -f backend      # 仅后端日志
docker compose restart              # 重启所有服务
docker compose restart backend      # 重启后端
docker compose down                 # 停止并移除容器（保留数据）
docker compose down -v              # 停止并清除所有数据卷

# ==================== 数据库 ====================
docker compose exec backend sh      # 进入后端容器
docker compose exec postgres psql -U crm_user -d trade_crm  # 连接数据库

# 数据库备份
docker compose exec postgres pg_dump -U crm_user trade_crm > backup_$(date +%Y%m%d).sql

# 数据库恢复
cat backup.sql | docker compose exec -T postgres psql -U crm_user trade_crm
```

---

## 目录结构

```
CRM/
├── backend/                    # 后端 (NestJS)
│   ├── prisma/
│   │   ├── schema.prisma       # 数据库模型定义
│   │   └── seed.ts             # 种子数据
│   ├── src/
│   │   ├── common/             # 公共模块
│   │   │   ├── decorators/     # 自定义装饰器 (CurrentUser, Roles)
│   │   │   ├── filters/        # 异常过滤器
│   │   │   ├── guards/         # 认证 & 角色守卫
│   │   │   ├── interceptors/   # 响应转换拦截器
│   │   │   └── pipes/          # 参数校验管道
│   │   ├── config/             # 配置模块
│   │   ├── modules/            # 业务模块
│   │   │   ├── activities/     # 活动记录
│   │   │   ├── auth/           # 认证 (JWT)
│   │   │   ├── backup/         # 数据备份导入导出
│   │   │   ├── contacts/       # 联系人
│   │   │   ├── customers/      # 客户
│   │   │   ├── dashboard/      # 仪表盘
│   │   │   ├── documents/      # 文件管理
│   │   │   ├── emails/         # 邮件
│   │   │   ├── leads/          # 销售线索
│   │   │   ├── orders/         # 订单
│   │   │   ├── quotations/     # 报价单
│   │   │   ├── settings/       # 系统设置
│   │   │   ├── tasks/          # 任务
│   │   │   └── users/          # 用户
│   │   ├── prisma/             # Prisma 服务
│   │   ├── app.module.ts       # 根模块
│   │   └── main.ts             # 入口文件
│   ├── .env.example            # 环境变量示例
│   ├── Dockerfile              # 后端 Docker 镜像
│   ├── package.json
│   └── tsconfig.json
├── frontend/                   # 前端 (Next.js)
│   ├── src/
│   │   ├── app/                # 页面路由 (App Router)
│   │   │   ├── dashboard/      # 仪表盘
│   │   │   ├── customers/      # 客户管理 (含 [id] 详情页)
│   │   │   ├── leads/          # 销售线索
│   │   │   ├── emails/         # 邮件中心
│   │   │   ├── quotations/     # 报价管理
│   │   │   ├── orders/         # 订单管理
│   │   │   ├── tasks/          # 任务管理
│   │   │   ├── documents/      # 文件管理
│   │   │   ├── settings/       # 系统设置
│   │   │   ├── login/          # 登录页
│   │   │   ├── layout.tsx      # 根布局
│   │   │   ├── page.tsx        # 首页 (重定向到 dashboard)
│   │   │   └── globals.css     # 全局样式
│   │   ├── components/
│   │   │   ├── layout/         # 布局组件 (Sidebar, AppLayout)
│   │   │   └── ui/             # 通用 UI 组件
│   │   ├── contexts/           # React Context (Auth)
│   │   ├── lib/                # 工具库 (API 客户端, 常量)
│   │   └── types/              # TypeScript 类型定义
│   ├── .env.local              # 前端环境变量
│   ├── Dockerfile              # 前端 Docker 镜像
│   ├── package.json
│   ├── tailwind.config.ts
│   └── tsconfig.json
├── nginx/
│   └── nginx.conf              # Nginx 反向代理配置
├── docker-compose.yml          # Docker Compose 编排
├── deploy.sh                   # 一键部署脚本
├── .gitignore
└── README.md                   # 本文档
```

---

## 常见问题

### Q: 启动后无法访问页面？

1. 检查容器是否正常运行：`docker compose ps`
2. 检查端口是否被占用：`ss -tlnp | grep -E '80|3000|3001'`
3. 查看容器日志排查错误：`docker compose logs -f`

### Q: 数据库连接失败？

1. 确认 PostgreSQL 容器已启动且健康：`docker compose ps postgres`
2. 检查 `DATABASE_URL` 中的用户名、密码、端口是否正确
3. 本地开发时确认使用 `localhost`，Docker 内使用服务名 `postgres`

### Q: 邮件发送失败？

1. 进入 **系统设置** → **邮箱配置**，确认 SMTP 参数填写正确
2. 常见邮箱 SMTP/IMAP 配置：

| 邮箱服务商 | SMTP 服务器 | SMTP 端口 | IMAP 服务器 | IMAP 端口 |
|-----------|------------|----------|------------|----------|
| Hostinger | `smtp.hostinger.com` | 465 | `imap.hostinger.com` | 993 |
| 网易企业邮箱 | `smtp.qiye.163.com` | 465 | `imap.qiye.163.com` | 993 |
| QQ 邮箱 | `smtp.qq.com` | 465 | `imap.qq.com` | 993 |
| 网易 163 | `smtp.163.com` | 465 | `imap.163.com` | 993 |
| Gmail | `smtp.gmail.com` | 465 | `imap.gmail.com` | 993 |
| Outlook | `smtp.office365.com` | 587 | `outlook.office365.com` | 993 |
| 阿里企业邮箱 | `smtp.mxhichina.com` | 465 | `imap.mxhichina.com` | 993 |

> **注意**：QQ 邮箱和网易邮箱需先在邮箱设置中开启 SMTP/IMAP 服务并使用授权码（非登录密码）。Gmail 需开启应用密码。

### Q: 如何修改 Nginx 监听端口？

编辑 `docker-compose.yml` 中 nginx 服务的 ports 映射，例如将 `80:80` 改为 `8080:80`。

### Q: 如何备份数据？

**方式一：通过系统界面（推荐）**

进入 **系统设置 → 数据备份**，点击「导出备份文件」即可下载包含所有业务数据的 JSON 文件。恢复时点击「选择备份文件导入」上传 JSON 文件即可。

**方式二：数据库级别备份**

```bash
# 数据库备份
docker compose exec postgres pg_dump -U crm_user trade_crm > backup.sql

# 文件备份（上传的附件）
docker compose cp crm-backend:/app/uploads ./uploads_backup
```

### Q: 如何升级系统？

**方式一：一键升级（推荐）**

```bash
./deploy.sh upgrade
```

该命令会自动完成：拉取最新代码 → 清除构建缓存 → 重新构建镜像 → 重启服务 → 等待就绪（数据库迁移在容器启动时自动执行）。

**方式二：手动升级**

```bash
git pull                          # 拉取最新代码
docker compose build --no-cache   # 重新构建镜像（清除缓存）
docker compose up -d              # 重启服务
# 数据库迁移会在后端容器启动时自动执行
```

---

## License

MIT
