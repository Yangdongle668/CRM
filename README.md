# 外贸CRM系统 (Foreign Trade CRM)

一款专为外贸团队打造的全功能客户关系管理系统，覆盖客户管理、销售线索、邮件营销、报价订单、任务协作、团队通讯等核心业务流程。中文界面，贴合国内外贸业务习惯。

## 目录

- [系统概述](#系统概述)
- [技术架构](#技术架构)
- [功能模块](#功能模块)
- [角色权限](#角色权限)
- [快速部署](#快速部署)
- [本地开发](#本地开发)
- [环境变量](#环境变量)
- [数据库设计](#数据库设计)
- [主要 API](#主要-api)
- [目录结构](#目录结构)
- [默认账户](#默认账户)
- [常用运维命令](#常用运维命令)
- [优化方向](#优化方向)

---

## 系统概述

### 核心亮点

- **全流程外贸业务链路**：线索 → 客户 → 报价 → 形式发票 → 订单 → 交付
- **多账户邮件集成**：一个用户可绑定多个邮箱（Gmail / Outlook / 企业邮箱），收发件统一归集
- **客户时间线自动关联**：邮件根据域名自动匹配客户，无需手动挂接
- **邮件已读追踪**：嵌入跟踪像素，检测客户何时何次打开邮件
- **团队内即时通讯**：用户间一对一消息，含未读提醒、头像资料卡
- **三级角色权限**：管理员 / 业务员 / 财务人员，细粒度接口管控
- **自助个人资料**：所有用户可更换头像、修改密码、填写签名和联系方式
- **PDF 形式发票生成**：可自定义公司抬头、银行信息、Logo
- **全量数据备份与恢复**：JSON 一键导入导出
- **Docker 一键部署 / 一键升级**

### 业务流程图

```
销售线索 (Lead)
    ↓ 转化
客户 (Customer) ← 邮件自动关联 ← 邮件 (Email)
    ↓ 建立
联系人 (Contact)
    ↓ 发起
报价单 (Quotation) → 形式发票 (ProformaInvoice / PDF)
    ↓ 确认
订单 (Order) → 订单明细 (OrderItem) + 费用类型 + 公司底价
    ↓ 关联
任务 (Task) / 文件 (Document) / 活动 (Activity / 时间线)
```

---

## 技术架构

| 层 | 技术栈 |
|---|---|
| 前端 | Next.js 14 (App Router) + React 18 + TypeScript + Tailwind CSS |
| 后端 | NestJS 10 + TypeScript + Prisma ORM |
| 数据库 | PostgreSQL 16 |
| 缓存 | Redis 7 |
| 反向代理 | Nginx |
| 容器编排 | Docker + Docker Compose |

### 关键依赖

**前端**：`axios` `swr` `zustand` `chart.js` `react-hot-toast` `react-icons` `dayjs`

**后端**：`@nestjs/jwt` + `passport-jwt` `@prisma/client` `bcryptjs` `nodemailer` `imap` + `mailparser` `pdfkit` `class-validator` `multer` `@nestjs/schedule`

---

## 功能模块

### 1. 仪表盘
业务数据总览：客户、线索、订单、邮件、任务等关键指标，含图表。

### 2. 客户管理
- 多字段客户档案（公司名、国家/地区、社交媒体来源、两个网站域名、备注）
- 客户详情页含 **活动时间线**：价格讨论、订单、样品、模具费、付款、物流、投诉、拜访、邮件等
- 根据客户网站自动匹配相关邮件
- 60+ 国家地区 + LinkedIn / Instagram / Facebook / TikTok 等来源细分

### 3. 联系人
每个客户可挂多个联系人，记录职位、邮箱、电话、WhatsApp 等。

### 4. 销售线索
全生命周期状态机：新线索 → 联系中 → 资质确认 → 报价 → 谈判 → 成交/丢失。支持线索跟进记录（LeadActivity）。

### 5. 邮件中心
- **多账户支持**：每个用户可添加多个邮箱账户（IMAP 收件 + SMTP 发件）
- 左右分栏布局：账户/文件夹 - 邮件列表 - 邮件内容
- 收发件全量同步（收件箱 / 发件箱 / 已发送 / 草稿）
- 支持回复、转发、附件上传
- **跟踪像素**：每封发出邮件自动嵌入不可见像素，记录打开时间和次数
- **邮件模板**：常用模板一键套用
- 邮件 → 客户自动关联 + 时间线活动记录

### 6. 形式发票 (PI)
- 多行产品明细
- 自定义公司信息、银行信息、Logo
- 一键生成 PDF 下载
- 审批流程（草稿 / 待审批 / 已批准 / 已拒绝）

### 7. 订单管理
- 订单明细（产品、数量、单价、小计）
- 订单状态流：PENDING → CONFIRMED → IN_PRODUCTION → SHIPPED → DELIVERED / CANCELLED
- 付款状态：UNPAID / PARTIAL / PAID / REFUNDED
- **费用类型**（多选）：模具 / 认证 / 货物 / 设备 / NRE费用
- **公司底价**：供内部参考的底价字段
- 订单附件上传
- 物流单号、发货/交付日期、发货地址

### 8. 任务管理
- 优先级（LOW / MEDIUM / HIGH / URGENT）、状态、截止时间
- **管理员可将任务指派给业务员**（assigneeId）

### 9. 消息中心（团队通讯）
- 用户间一对一即时消息
- 基于 HTTP 轮询（3s 活跃对话 / 10s 会话列表 / 15s 未读角标）
- 侧边栏实时未读消息角标
- **头像点击弹出资料卡**：姓名 / 角色 / 个性签名 / 邮箱 / 电话

### 10. 文件管理
- 上传、分类、按关联对象筛选（客户 / 订单 / PI 等）
- 下载、删除、重命名

### 11. 备忘录
个人便签，记录工作要点。

### 12. 管理中心（仅管理员）
- 全局数据统计、用户活跃度
- 系统状态监控

### 13. 系统设置
- **个人资料 tab**（所有用户）：头像、手机号、个性签名、密码修改；姓名和角色只读
- **用户管理 tab**（管理员）：创建/编辑/禁用用户、分配角色
- **系统参数 tab**（管理员）：公司信息、银行信息、Logo 上传（自动应用为浏览器标签图标）
- **数据备份 tab**（管理员）：全量 JSON 备份 / 恢复

---

## 角色权限

| 角色 | 代码 | 权限范围 |
|---|---|---|
| 管理员 | `ADMIN` | 全部功能 + 用户管理 + 系统参数 + 数据备份 |
| 业务员 | `SALESPERSON` | 除用户/系统管理外的全部业务功能；只能看自己的订单和客户 |
| 财务人员 | `FINANCE` | **只读所有订单**；写操作和其他模块全部禁止；可编辑自己的资料 |

权限控制通过 `JwtAuthGuard` + `RolesGuard` + `@Roles(...)` 装饰器实现，订单的写接口显式限定 `@Roles('ADMIN', 'SALESPERSON')`。

---

## 快速部署

### 前置要求
- Linux 服务器（Ubuntu 20.04+ / CentOS 7+ / Debian 10+）
- 2GB+ 内存
- Docker & Docker Compose（脚本可自动安装）

### 一键部署

```bash
git clone https://github.com/Yangdongle668/CRM && cd CRM
chmod +x deploy.sh
./deploy.sh
```

脚本会自动：
1. 检测/安装 Docker
2. 生成随机数据库密码和 JWT 密钥
3. 创建 `.env` 配置
4. 构建镜像并启动所有容器
5. 执行数据库迁移和种子数据
6. 显示访问地址

访问 `http://<服务器IP>` 进入系统。

### 升级
```bash
./deploy.sh upgrade    # 拉取最新代码 → 重新构建 → 执行新迁移 → 重启
```

---

## 本地开发

```bash
# 启动 PostgreSQL + Redis + 安装依赖 + 初始化 DB
./deploy.sh dev

# 或手动启动
cd backend && npm install && npx prisma migrate dev && npm run start:dev
cd frontend && npm install && npm run dev
```

- 前端：http://localhost:3000
- 后端：http://localhost:3001
- Swagger：http://localhost:3001/api/docs

---

## 环境变量

### `backend/.env`
```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/crm"
JWT_SECRET="随机字符串"
JWT_EXPIRES_IN="7d"
PORT=3001
REDIS_HOST=localhost
REDIS_PORT=6379
```

### 根目录 `.env`（Docker Compose 用）
```bash
POSTGRES_USER=crm
POSTGRES_PASSWORD=自动生成
POSTGRES_DB=crm
JWT_SECRET=自动生成
```

---

## 数据库设计

共 21 个模型，主要包括：

- **User**（用户，含 bio 个性签名）
- **Customer / Contact / CustomerWebsite**
- **Lead / LeadActivity**
- **EmailConfig / Email / EmailTracking**（多账户邮件）
- **Quotation / QuotationItem**
- **ProformaInvoice / ProformaInvoiceItem**
- **Order / OrderItem**（含 `costTypes[]` 和 `floorPrice`）
- **Task**（含 `assigneeId`）
- **Message**（团队消息）
- **Document**（文件）
- **Activity**（客户时间线）
- **Memo**（备忘录）
- **Setting**（系统参数 KV 存储）

### 枚举类型
- `Role`: `ADMIN` | `SALESPERSON` | `FINANCE`
- `OrderStatus`: `PENDING` | `CONFIRMED` | `IN_PRODUCTION` | `SHIPPED` | `DELIVERED` | `CANCELLED`
- `PaymentStatus`: `UNPAID` | `PARTIAL` | `PAID` | `REFUNDED`
- `LeadStatus`: `NEW` | `CONTACTING` | `QUALIFIED` | `QUOTATION` | `NEGOTIATING` | `WON` | `LOST`
- `TaskPriority`: `LOW` | `MEDIUM` | `HIGH` | `URGENT`
- `TaskStatus`: `PENDING` | `IN_PROGRESS` | `COMPLETED` | `CANCELLED`

---

## 主要 API

### 认证
- `POST /auth/login` - 登录
- `GET /auth/profile` - 获取当前用户资料
- `PATCH /auth/profile` - 更新自己的资料（password / phone / bio / avatar）
- `POST /auth/avatar` - 上传头像

### 消息
- `GET /messages/conversations` - 会话列表
- `GET /messages/users` - 所有可对话的用户（含头像 / 资料）
- `GET /messages/:userId/profile` - 获取某用户的资料卡
- `GET /messages/:userId` - 与某用户的历史消息（自动标记已读）
- `POST /messages` - 发送消息
- `GET /messages/unread-count` - 未读数量

### 订单（写操作仅限 ADMIN / SALESPERSON）
- `GET /orders` - 列表（FINANCE / ADMIN 可见全部；业务员只看自己的）
- `GET /orders/:id` - 详情
- `POST /orders` - 新建
- `PATCH /orders/:id` - 更新
- `DELETE /orders/:id` - 删除
- `PATCH /orders/:id/status` - 更新订单状态
- `PATCH /orders/:id/payment` - 更新付款状态

其余模块提供标准 CRUD，完整文档见 Swagger。

---

## 目录结构

```
CRM/
├── backend/
│   ├── src/
│   │   ├── modules/            # 业务模块（每个模块 controller/service/dto/module）
│   │   │   ├── auth, users, customers, contacts, leads
│   │   │   ├── emails, quotations, pis, orders
│   │   │   ├── tasks, messages, documents, memos
│   │   │   ├── activities, dashboard, settings, backup
│   │   ├── common/             # Guards / Decorators / Interceptors / Filters
│   │   ├── prisma/             # PrismaService
│   │   └── main.ts
│   ├── prisma/
│   │   ├── schema.prisma       # 21 个模型
│   │   └── migrations/         # 所有迁移文件
│   └── uploads/                # 上传文件存储
├── frontend/
│   └── src/
│       ├── app/                # Next.js 14 App Router 各页面
│       ├── components/         # 可复用组件（Sidebar / Modal / Pagination...）
│       ├── contexts/           # AuthContext / LogoContext
│       ├── lib/                # API 客户端 / constants
│       └── types/              # TypeScript 类型定义
├── nginx/                      # Nginx 反向代理配置
├── docker-compose.yml
├── deploy.sh                   # 一键部署脚本
└── README.md
```

---

## 默认账户

首次部署时系统进入初始化流程，在登录页创建第一个管理员账户。

---

## 常用运维命令

```bash
# 查看日志
docker compose logs -f backend
docker compose logs -f frontend

# 进入数据库
docker compose exec postgres psql -U crm -d crm

# 执行迁移
docker compose exec backend npx prisma migrate deploy

# 重启服务
docker compose restart backend

# 完全重新构建
docker compose down && docker compose up -d --build
```

---

## 优化方向

以下是当前系统可进一步改进的方向，按优先级和性价比排序：

### 高优先级 ⭐⭐⭐

1. **WebSocket 替代消息轮询**
   - 当前消息中心每 3 秒 HTTP 轮询，服务器压力大、延迟高
   - 接入 `@nestjs/websockets` + Socket.io，实现真正的实时推送
   - 顺便支持"正在输入..."、已读回执、在线状态等

2. **邮件后台任务队列**
   - 当前 IMAP 同步阻塞请求、SMTP 发送同步等待
   - 引入 BullMQ（Redis 队列）异步处理邮件收发、PDF 生成、数据备份
   - 前端轮询任务状态或通过 WebSocket 推送完成通知

3. **文件存储迁移到对象存储**
   - 当前头像、Logo、附件都存本地 `uploads/`，多实例部署和备份都不方便
   - 接入 S3 兼容存储（阿里云 OSS / MinIO / AWS S3），含预签名 URL
   - 顺便添加图片压缩和 CDN 加速

4. **完善测试覆盖**
   - 目前没有单元测试和 E2E 测试
   - 添加 Jest 单测覆盖 `*.service.ts` 核心业务逻辑
   - 用 Playwright 做关键路径 E2E（登录、创建订单、发邮件）

### 中优先级 ⭐⭐

5. **前端性能优化**
   - 订单/客户列表用 `react-window` 虚拟滚动（大数据量场景）
   - 客户详情页的时间线用分页或无限滚动
   - 邮件列表 IntersectionObserver 懒加载正文
   - Next.js 图片组件统一替换 `<img>`

6. **权限体系升级为 RBAC**
   - 当前基于三个固定角色硬编码，灵活度差
   - 引入 Role-Permission 中间表，前端根据权限列表动态渲染按钮
   - 新增角色不需要改代码

7. **审计日志**
   - 关键操作（删除订单、修改价格、导出数据）记入 `AuditLog` 表
   - 含操作者、IP、时间、前后值对比
   - 管理中心增加审计日志查看页

8. **全文搜索**
   - 当前搜索基于 `ILIKE`，客户/订单/邮件量大时性能下降
   - 集成 PostgreSQL `tsvector` + `tsquery`，或引入 MeiliSearch/Elasticsearch
   - 支持跨模块全局搜索

9. **邮件模板引擎化**
   - 当前模板是纯文本 + 简单变量
   - 升级为 Handlebars/MJML，支持条件判断、列表渲染、响应式 HTML 邮件
   - 模板变量自动从客户资料提取（称呼、公司名、国家）

10. **API 限流**
    - 未登录接口、登录接口接入 `@nestjs/throttler`
    - 防止暴力破解和恶意刷接口

### 低优先级 ⭐

11. **多语言 i18n**
    - 当前仅中文，外贸场景其实需要英文界面给海外同事或客户演示
    - 引入 `next-intl`，支持中英切换

12. **数据可视化增强**
    - 仪表盘加入销售漏斗、客户地图分布、邮件打开率趋势图
    - 订单按月/季度/国家维度统计报表

13. **移动端适配**
    - 当前响应式仅满足大屏，手机访问体验差
    - 适配 iPad / 手机布局，或单独做 React Native 小程序

14. **系统监控**
    - 接入 Prometheus + Grafana 采集 API 响应时间、错误率
    - Sentry 收集前后端异常

15. **数据库性能优化**
    - `Email`、`Activity`、`Message` 表随时间膨胀，加分区（按月）或归档
    - 为常用查询字段增加复合索引（已有一部分，可继续优化）

16. **CI/CD 流水线**
    - GitHub Actions 做 lint + 测试 + Docker 镜像构建与推送
    - 服务器端 Webhook 自动拉取新镜像重启（蓝绿部署或滚动更新）

17. **安全加固**
    - HTTPS 强制（Let's Encrypt 自动续签脚本）
    - 安全响应头（CSP / HSTS / X-Frame-Options）
    - 文件上传 MIME 校验 + 病毒扫描
    - 二次验证（TOTP）

### 产品层面 💡

18. **客户标签系统**：自定义标签，快速筛选潜在客户
19. **邮件合并发送**：批量群发定制化邮件（不同变量）
20. **客户跟进提醒**：超过 N 天未联系自动提醒业务员
21. **展会/询盘管理**：从广交会、阿里国际站等渠道导入询盘数据
22. **汇率换算**：订单多币种换算到公司基准货币统计
23. **佣金/提成计算**：按订单自动计算业务员提成

---

## License

Private project.
