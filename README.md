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
