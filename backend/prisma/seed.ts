import { PrismaClient } from '@prisma/client';
import { seedHolidays } from './seed-holidays';

const prisma = new PrismaClient();

async function main() {
  console.log('开始初始化数据...');

  // 创建邮件模板
  const templateCount = await prisma.emailTemplate.count();
  if (templateCount === 0) {
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
  } else {
    console.log('邮件模板已存在，跳过');
  }

  await seedHolidays(prisma);

  console.log('数据初始化完成！');
  console.log('---');
  console.log('请通过首次访问系统时的初始化页面设置管理员账户');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
