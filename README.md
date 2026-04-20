# Foreign Trade CRM

<div align="center">

![Next.js](https://img.shields.io/badge/Next.js-14-black?style=for-the-badge&logo=next.js&logoColor=white)
![React](https://img.shields.io/badge/React-18-61DAFB?style=for-the-badge&logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?style=for-the-badge&logo=typescript&logoColor=white)
![NestJS](https://img.shields.io/badge/NestJS-10-E0234E?style=for-the-badge&logo=nestjs&logoColor=white)
![Prisma](https://img.shields.io/badge/Prisma-ORM-2D3748?style=for-the-badge&logo=prisma&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?style=for-the-badge&logo=postgresql&logoColor=white)
![Redis](https://img.shields.io/badge/Redis-7-DC382D?style=for-the-badge&logo=redis&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white)
![Tailwind](https://img.shields.io/badge/TailwindCSS-3-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green?style=for-the-badge)

</div>

---

## Introduction / 项目简介

**English**
A full-featured **Foreign Trade CRM** designed for international business teams. It unifies the entire sales pipeline — from lead capture to delivery — with deep email integration, team collaboration, finance tracking, and a powerful admin console. Built on a modern, scalable stack (Next.js 14 + NestJS 10 + PostgreSQL 16 + Redis 7), it is production-ready out of the box with Docker and a one-command deploy script.

<details>
<summary><b>中文说明（点击展开）</b></summary>

一个面向国际贸易团队的 **全功能外贸 CRM 系统**。覆盖从线索录入到订单交付的完整销售链路，深度集成多账号邮件、团队协作、财务跟踪与后台管理。基于现代化技术栈（Next.js 14 + NestJS 10 + PostgreSQL 16 + Redis 7）构建，开箱即用，支持 Docker 一键部署。

</details>

---

## Features / 功能特性

| | Feature | 功能 |
|---|---|---|
| 🎯 | **Sales Pipeline** — Lead → Customer → Contact → Quotation → Proforma Invoice → Order → Delivery | **销售管道**：线索 → 客户 → 联系人 → 报价单 → 形式发票 → 订单 → 发货 |
| 📧 | **Email Integration** — Multi-account (Gmail / Outlook / corporate IMAP), domain-based auto-matching, open & click tracking | **邮件集成**：多账号（Gmail / Outlook / 企业邮箱 IMAP），按域名自动匹配客户，打开/点击追踪 |
| 👥 | **Team Collaboration** — Internal messaging, task management, activity timeline, document sharing | **团队协作**：内部消息、任务管理、活动时间线、文档共享 |
| 💰 | **Finance** — Quotations, orders, payment status (UNPAID / PARTIAL / PAID / REFUNDED), branded PDF invoices | **财务管理**：报价、订单、付款状态（未付/部分/已付/退款）、品牌化 PDF 发票 |
| 📊 | **Reporting** — Dashboard KPIs, interactive charts, customer & lead statistics | **报表分析**：仪表盘 KPI、可视化图表、客户/线索统计 |
| 🔐 | **Admin & RBAC** — User management, 3 built-in roles + custom, audit logging, full JSON backup/restore | **后台与权限**：用户管理、3 种内置角色 + 自定义、操作审计、完整 JSON 备份恢复 |
| 💱 | **Utilities** — Real-time FX rates (USD/EUR → CNY), PDF generation, team announcements | **实用工具**：实时汇率（USD/EUR → CNY）、PDF 生成、团队公告 |
| ✨ | **Unique Highlights** — Email tracking pixel, customizable PDF branding, lead lifecycle state machine | **特色亮点**：邮件追踪像素、PDF 品牌定制、线索生命周期状态机 |

---

## Tech Stack / 技术栈

| Layer / 层级 | Technology / 技术 | Purpose / 用途 |
|---|---|---|
| **Frontend** | Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS | SSR / SPA UI |
| **Backend** | NestJS 10, TypeScript, Prisma ORM | REST API & business logic |
| **Database** | PostgreSQL 16 | Primary datastore |
| **Cache / Queue** | Redis 7, BullMQ | Async jobs, WebSocket state |
| **Email** | Nodemailer, IMAP | Multi-account sync & sending |
| **Realtime** | Socket.IO | Live notifications |
| **Container** | Docker, Docker Compose | One-command deployment |
| **Reverse Proxy** | Nginx | SSL termination & routing |
| **API Docs** | Swagger / OpenAPI | Interactive API reference |

---

## Architecture / 系统架构

```
                           ┌──────────────────────────┐
                           │        Nginx (SSL)        │
                           │   Reverse Proxy + HTTPS   │
                           └────────────┬──────────────┘
                                        │
                  ┌─────────────────────┴────────────────────┐
                  │                                          │
        ┌─────────▼──────────┐                     ┌─────────▼──────────┐
        │  Frontend (:3000)  │                     │   Backend (:3001)  │
        │  Next.js 14 + React│◄──── REST / WS ────►│  NestJS 10 + TS    │
        │  Tailwind + TSX    │                     │  Prisma ORM        │
        └────────────────────┘                     └─────────┬──────────┘
                                                             │
                  ┌──────────────────────────────────────────┼──────────────────────────────────────────┐
                  │                                          │                                          │
        ┌─────────▼─────────┐                   ┌───────────▼───────────┐                   ┌──────────▼──────────┐
        │   PostgreSQL 16   │                   │       Redis 7         │                   │   IMAP / SMTP       │
        │   (Primary DB)    │                   │  BullMQ + WebSocket   │                   │  Gmail / Outlook... │
        └───────────────────┘                   └───────────────────────┘                   └─────────────────────┘
```

---

## Quick Start / 快速开始

### Option 1 — Docker (Recommended) / Docker 部署（推荐）

```bash
# 1. Clone the repository / 克隆仓库
git clone <your-repo-url> CRM && cd CRM

# 2. Configure environment / 配置环境变量
cp backend/.env.example .env
# Edit .env — set DATABASE_URL, JWT_SECRET, APP_URL, etc.
# 编辑 .env，设置 DATABASE_URL / JWT_SECRET / APP_URL 等

# 3. Launch the full stack / 启动完整服务
docker-compose up -d

# 4. Visit the app / 访问系统
# Frontend / 前端:     http://localhost:3000
# API:                 http://localhost:3001/api
# Swagger Docs / 文档: http://localhost:3001/api-docs
```

### Option 2 — One-Click Auto Deploy / 一键自动部署

```bash
./deploy.sh
```

> Automatically installs Docker, generates random secrets, and boots the full stack.
> 自动安装 Docker、生成随机密钥并启动全部服务。

### First-Time Setup / 首次使用

1. Open `http://localhost:3000` and register — **the first registered user automatically becomes the superadmin** / 打开 `http://localhost:3000` 注册账号，**首位注册用户自动成为超级管理员**
2. Default roles: `ADMIN`, `SALESPERSON`, `FINANCE` / 默认角色：`ADMIN`、`SALESPERSON`、`FINANCE`
3. Manage roles & permissions at `/admin/rbac` / 在 `/admin/rbac` 管理角色与权限

---

## Local Development / 本地开发

### Prerequisites / 环境要求
- Node.js 18+ / npm 9+
- PostgreSQL 16
- Redis 7

### Backend / 后端

```bash
cd backend
npm install
npx prisma migrate dev      # Apply database migrations / 执行数据库迁移
npx prisma generate         # Generate Prisma client / 生成 Prisma 客户端
npm run start:dev           # Start with hot-reload on :3001
```

### Frontend / 前端

```bash
cd frontend
npm install
npm run dev                 # Start dev server on :3000
```

---

## Environment Variables / 环境变量

| Variable | Description / 说明 | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string / 数据库连接字符串 | `postgresql://user:pass@localhost:5432/crm` |
| `REDIS_HOST` | Redis host / Redis 主机地址 | `localhost` |
| `REDIS_PORT` | Redis port / Redis 端口 | `6379` |
| `JWT_SECRET` | JWT signing secret (keep secret!) / JWT 签名密钥（务必保密） | `<random-64-char-string>` |
| `APP_URL` | Public app URL / 应用对外访问地址 | `https://crm.example.com` |
| `CORS_ORIGIN` | Allowed CORS origin / 允许的跨域来源 | `http://localhost:3000` |
| `UPLOAD_DIR` | File upload directory / 文件上传目录 | `./uploads` |

> See `backend/.env.example` for the complete list / 完整变量列表见 `backend/.env.example`

---

## API Documentation / API 文档

Interactive Swagger / OpenAPI documentation is auto-generated and available at:
交互式 Swagger / OpenAPI 文档自动生成，访问地址：

```
http://localhost:3001/api-docs
```

**Endpoints Overview / 接口入口一览**

| Endpoint | URL |
|---|---|
| Frontend / 前端 | `http://localhost:3000` |
| REST API | `http://localhost:3001/api` |
| Swagger Docs / 接口文档 | `http://localhost:3001/api-docs` |
| WebSocket | `ws://localhost:3001/socket.io` |

---

## Project Structure / 项目结构

```
CRM/
├── backend/                  # NestJS API (port 3001)
│   └── src/
│       ├── modules/          # 24 feature modules
│       │   ├── auth/         # JWT authentication
│       │   ├── users/        # User management
│       │   ├── leads/        # Lead lifecycle
│       │   ├── customers/    # Customer & contacts
│       │   ├── emails/       # IMAP / SMTP integration
│       │   ├── quotations/   # Quotations & invoices
│       │   ├── orders/       # Order & payment
│       │   └── ...           # tasks, reports, rbac, etc.
│       ├── common/           # Guards, filters, decorators, RBAC
│       └── queue/            # BullMQ async jobs
│
├── frontend/                 # Next.js app (port 3000)
│   └── src/
│       ├── app/              # App Router pages
│       ├── components/       # Reusable UI components
│       └── contexts/         # Global state (Auth, WebSocket…)
│
├── nginx/                    # Reverse proxy & SSL config
├── docker-compose.yml        # Full-stack orchestration
└── deploy.sh                 # One-click deploy script
```

---

## Contributing / 参与贡献

Contributions are warmly welcomed! / 热烈欢迎贡献代码！

1. Fork the repository / Fork 本仓库
2. Create a feature branch: `git checkout -b feat/amazing-feature` / 创建特性分支
3. Commit your changes: `git commit -m "feat: add amazing feature"` / 提交修改
4. Push the branch: `git push origin feat/amazing-feature` / 推送分支
5. Open a Pull Request / 发起 Pull Request

> Please follow the existing code style, add tests where applicable, and update documentation.
> 请遵循现有代码风格，适当补充测试与文档。

---

## License / 开源协议

Released under the **MIT License**. See [`LICENSE`](./LICENSE) for details.
本项目基于 **MIT 协议** 开源，详情见 [`LICENSE`](./LICENSE)。

---

<div align="center">

**Built with care for global trade teams.**
**为全球贸易团队用心打造。**

⭐ If this project helps you, please consider giving it a star! / 如果本项目对你有帮助，欢迎 Star 支持！

</div>
