import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('开始初始化数据...');

  // 创建管理员用户
  const adminPassword = await bcrypt.hash('admin123', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@crm.com' },
    update: {},
    create: {
      email: 'admin@crm.com',
      password: adminPassword,
      name: '系统管理员',
      role: Role.ADMIN,
      phone: '13800000000',
    },
  });
  console.log('管理员账户已创建:', admin.email);

  // 创建业务员用户
  const salesPassword = await bcrypt.hash('sales123', 10);
  const salesperson1 = await prisma.user.upsert({
    where: { email: 'zhangsan@crm.com' },
    update: {},
    create: {
      email: 'zhangsan@crm.com',
      password: salesPassword,
      name: '张三',
      role: Role.SALESPERSON,
      phone: '13800000001',
    },
  });

  const salesperson2 = await prisma.user.upsert({
    where: { email: 'lisi@crm.com' },
    update: {},
    create: {
      email: 'lisi@crm.com',
      password: salesPassword,
      name: '李四',
      role: Role.SALESPERSON,
      phone: '13800000002',
    },
  });
  console.log('业务员账户已创建:', salesperson1.email, salesperson2.email);

  // 创建示例客户
  const customer1 = await prisma.customer.create({
    data: {
      companyName: 'ABC Trading Co., Ltd',
      country: '美国',
      address: '123 Main St, New York, NY 10001',
      website: 'https://www.abctrading.com',
      industry: '电子产品',
      scale: '中型企业',
      source: '展会',
      status: 'ACTIVE',
      ownerId: salesperson1.id,
    },
  });

  const customer2 = await prisma.customer.create({
    data: {
      companyName: 'Euro Imports GmbH',
      country: '德国',
      address: 'Berliner Str. 45, 10115 Berlin',
      website: 'https://www.euroimports.de',
      industry: '机械设备',
      scale: '大型企业',
      source: '阿里巴巴',
      status: 'ACTIVE',
      ownerId: salesperson1.id,
    },
  });

  const customer3 = await prisma.customer.create({
    data: {
      companyName: 'Tokyo Electronics Inc.',
      country: '日本',
      address: '1-1-1 Shibuya, Tokyo',
      industry: '电子产品',
      scale: '大型企业',
      source: 'Google广告',
      status: 'POTENTIAL',
      ownerId: salesperson2.id,
    },
  });
  console.log('示例客户已创建');

  // 创建联系人
  await prisma.contact.createMany({
    data: [
      {
        name: 'John Smith',
        title: '采购经理',
        email: 'john@abctrading.com',
        phone: '+1-212-555-0100',
        whatsapp: '+1-212-555-0100',
        isPrimary: true,
        customerId: customer1.id,
      },
      {
        name: 'Hans Mueller',
        title: '总经理',
        email: 'hans@euroimports.de',
        phone: '+49-30-555-0100',
        wechat: 'hans_mueller',
        isPrimary: true,
        customerId: customer2.id,
      },
      {
        name: '田中太郎',
        title: '技术部长',
        email: 'tanaka@tokyoelec.jp',
        phone: '+81-3-5555-0100',
        isPrimary: true,
        customerId: customer3.id,
      },
    ],
  });
  console.log('联系人已创建');

  // 创建销售线索
  await prisma.lead.createMany({
    data: [
      {
        title: 'ABC Trading 年度采购计划',
        description: '客户计划在Q2大批量采购电子元器件',
        stage: 'PROPOSAL',
        expectedAmount: 150000,
        expectedDate: new Date('2026-06-30'),
        source: '展会',
        priority: 2,
        customerId: customer1.id,
        ownerId: salesperson1.id,
      },
      {
        title: 'Euro Imports 新产品线合作',
        description: '客户对我们的新型机械设备感兴趣',
        stage: 'NEGOTIATION',
        expectedAmount: 280000,
        expectedDate: new Date('2026-05-15'),
        source: '客户推荐',
        priority: 3,
        customerId: customer2.id,
        ownerId: salesperson1.id,
      },
      {
        title: 'Tokyo Electronics 样品测试',
        description: '客户需要5个样品进行测试',
        stage: 'CONTACTED',
        expectedAmount: 50000,
        source: 'Google广告',
        priority: 1,
        customerId: customer3.id,
        ownerId: salesperson2.id,
      },
    ],
  });
  console.log('销售线索已创建');

  // 创建任务
  await prisma.task.createMany({
    data: [
      {
        title: '跟进ABC Trading报价',
        description: '发送最新报价单并确认交期',
        priority: 'HIGH',
        status: 'PENDING',
        dueDate: new Date('2026-03-20'),
        ownerId: salesperson1.id,
        relatedType: 'customer',
        relatedId: customer1.id,
      },
      {
        title: '安排Euro Imports视频会议',
        description: '讨论Q2合作细节',
        priority: 'MEDIUM',
        status: 'IN_PROGRESS',
        dueDate: new Date('2026-03-25'),
        ownerId: salesperson1.id,
        relatedType: 'customer',
        relatedId: customer2.id,
      },
      {
        title: '准备Tokyo Electronics样品',
        description: '联系工厂准备5个样品',
        priority: 'URGENT',
        status: 'PENDING',
        dueDate: new Date('2026-03-18'),
        ownerId: salesperson2.id,
        relatedType: 'customer',
        relatedId: customer3.id,
      },
    ],
  });
  console.log('任务已创建');

  // 创建活动记录
  await prisma.activity.createMany({
    data: [
      {
        type: 'MEETING',
        content: '在广交会上与客户初次见面，交换了名片和产品目录',
        customerId: customer1.id,
        ownerId: salesperson1.id,
      },
      {
        type: 'EMAIL',
        content: '发送了产品报价单和公司介绍',
        customerId: customer1.id,
        ownerId: salesperson1.id,
      },
      {
        type: 'CALL',
        content: '电话沟通了技术参数和交期要求',
        customerId: customer2.id,
        ownerId: salesperson1.id,
      },
      {
        type: 'NOTE',
        content: '客户对产品质量非常满意，计划下月下单',
        customerId: customer3.id,
        ownerId: salesperson2.id,
      },
    ],
  });
  console.log('活动记录已创建');

  // 创建邮件模板
  await prisma.emailTemplate.createMany({
    data: [
      {
        name: '初次联系开发信',
        subject: 'Introduction - Quality Products from China',
        bodyHtml: `<p>Dear Sir/Madam,</p>
<p>This is {{senderName}} from {{companyName}}. We are a professional manufacturer and exporter specializing in {{productCategory}}.</p>
<p>We have been in this industry for over 10 years and have rich experience in serving international clients.</p>
<p>I would like to introduce our products to you and explore the possibility of establishing a business relationship.</p>
<p>Please find attached our latest product catalog for your reference.</p>
<p>Looking forward to hearing from you.</p>
<p>Best regards,<br/>{{senderName}}</p>`,
        category: '开发信',
      },
      {
        name: '报价跟进',
        subject: 'Following up on our quotation',
        bodyHtml: `<p>Dear {{contactName}},</p>
<p>I hope this email finds you well.</p>
<p>I am writing to follow up on the quotation we sent on {{quotationDate}}. Have you had a chance to review it?</p>
<p>If you have any questions or need any modifications, please don't hesitate to let me know.</p>
<p>We are flexible on the terms and willing to provide the best possible offer.</p>
<p>Looking forward to your reply.</p>
<p>Best regards,<br/>{{senderName}}</p>`,
        category: '跟进',
      },
      {
        name: '订单确认',
        subject: 'Order Confirmation - {{orderNo}}',
        bodyHtml: `<p>Dear {{contactName}},</p>
<p>Thank you for your order. We are pleased to confirm the following:</p>
<p><strong>Order No:</strong> {{orderNo}}<br/>
<strong>Total Amount:</strong> {{totalAmount}}<br/>
<strong>Estimated Delivery:</strong> {{deliveryDate}}</p>
<p>We will keep you updated on the production progress.</p>
<p>Best regards,<br/>{{senderName}}</p>`,
        category: '订单',
      },
    ],
  });
  console.log('邮件模板已创建');

  console.log('数据初始化完成！');
  console.log('---');
  console.log('管理员账户: admin@crm.com / admin123');
  console.log('业务员账户: zhangsan@crm.com / sales123');
  console.log('业务员账户: lisi@crm.com / sales123');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
