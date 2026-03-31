import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class BackupService {
  constructor(private prisma: PrismaService) {}

  async exportAll() {
    const [
      users,
      emailConfigs,
      customers,
      contacts,
      leads,
      emails,
      emailThreads,
      emailTemplates,
      quotations,
      quotationItems,
      orders,
      orderItems,
      tasks,
      activities,
      documents,
      systemSettings,
    ] = await Promise.all([
      this.prisma.user.findMany(),
      this.prisma.emailConfig.findMany(),
      this.prisma.customer.findMany(),
      this.prisma.contact.findMany(),
      this.prisma.lead.findMany(),
      this.prisma.email.findMany(),
      this.prisma.emailThread.findMany(),
      this.prisma.emailTemplate.findMany(),
      this.prisma.quotation.findMany(),
      this.prisma.quotationItem.findMany(),
      this.prisma.order.findMany(),
      this.prisma.orderItem.findMany(),
      this.prisma.task.findMany(),
      this.prisma.activity.findMany(),
      this.prisma.document.findMany(),
      this.prisma.systemSetting.findMany(),
    ]);

    return {
      version: '1.0',
      exportedAt: new Date().toISOString(),
      data: {
        users,
        emailConfigs,
        customers,
        contacts,
        leads,
        emailThreads,
        emails,
        emailTemplates,
        quotations,
        quotationItems,
        orders,
        orderItems,
        tasks,
        activities,
        documents,
        systemSettings,
      },
    };
  }

  async importAll(backup: any) {
    if (!backup || !backup.data) {
      throw new BadRequestException('无效的备份文件格式');
    }

    const { data } = backup;

    // Use a transaction to ensure atomicity
    await this.prisma.$transaction(async (tx) => {
      // Delete in reverse dependency order
      await tx.activity.deleteMany();
      await tx.document.deleteMany();
      await tx.task.deleteMany();
      await tx.orderItem.deleteMany();
      await tx.order.deleteMany();
      await tx.quotationItem.deleteMany();
      await tx.quotation.deleteMany();
      await tx.email.deleteMany();
      await tx.emailThread.deleteMany();
      await tx.emailTemplate.deleteMany();
      await tx.lead.deleteMany();
      await tx.contact.deleteMany();
      await tx.customer.deleteMany();
      await tx.emailConfig.deleteMany();
      await tx.systemSetting.deleteMany();
      await tx.user.deleteMany();

      // Insert in dependency order
      if (data.users?.length) {
        await tx.user.createMany({ data: data.users });
      }
      if (data.emailConfigs?.length) {
        await tx.emailConfig.createMany({ data: data.emailConfigs });
      }
      if (data.systemSettings?.length) {
        await tx.systemSetting.createMany({ data: data.systemSettings });
      }
      if (data.customers?.length) {
        await tx.customer.createMany({ data: data.customers });
      }
      if (data.contacts?.length) {
        await tx.contact.createMany({ data: data.contacts });
      }
      if (data.leads?.length) {
        await tx.lead.createMany({ data: data.leads });
      }
      if (data.emailThreads?.length) {
        await tx.emailThread.createMany({ data: data.emailThreads });
      }
      if (data.emails?.length) {
        await tx.email.createMany({ data: data.emails });
      }
      if (data.emailTemplates?.length) {
        await tx.emailTemplate.createMany({ data: data.emailTemplates });
      }
      if (data.quotations?.length) {
        await tx.quotation.createMany({ data: data.quotations });
      }
      if (data.quotationItems?.length) {
        await tx.quotationItem.createMany({ data: data.quotationItems });
      }
      if (data.orders?.length) {
        await tx.order.createMany({ data: data.orders });
      }
      if (data.orderItems?.length) {
        await tx.orderItem.createMany({ data: data.orderItems });
      }
      if (data.tasks?.length) {
        await tx.task.createMany({ data: data.tasks });
      }
      if (data.activities?.length) {
        await tx.activity.createMany({ data: data.activities });
      }
      if (data.documents?.length) {
        await tx.document.createMany({ data: data.documents });
      }
    }, { timeout: 60000 });

    return { message: '备份数据已成功导入' };
  }
}
