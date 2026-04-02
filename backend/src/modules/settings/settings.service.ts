import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { EmailConfigDto } from './dto/email-config.dto';
import * as nodemailer from 'nodemailer';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async getAllSettings() {
    return this.prisma.systemSetting.findMany({
      orderBy: { key: 'asc' },
    });
  }

  async updateSettings(dto: UpdateSettingsDto) {
    const results = await Promise.all(
      dto.settings.map((item) =>
        this.prisma.systemSetting.upsert({
          where: { key: item.key },
          update: {
            value: item.value,
            ...(item.label !== undefined && { label: item.label }),
          },
          create: {
            key: item.key,
            value: item.value,
            label: item.label,
          },
        }),
      ),
    );

    return results;
  }

  async getEmailConfig(userId: string) {
    const config = await this.prisma.emailConfig.findUnique({
      where: { userId },
    });

    if (!config) {
      return null;
    }

    // Mask passwords in response
    return {
      ...config,
      smtpPass: config.smtpPass ? '********' : '',
      imapPass: config.imapPass ? '********' : '',
    };
  }

  async updateEmailConfig(userId: string, dto: EmailConfigDto) {
    const existing = await this.prisma.emailConfig.findUnique({
      where: { userId },
    });

    const data = {
      smtpHost: dto.smtpHost,
      smtpPort: dto.smtpPort,
      smtpUser: dto.smtpUser,
      smtpPass: dto.smtpPass,
      smtpSecure: dto.smtpSecure ?? true,
      imapHost: dto.imapHost,
      imapPort: dto.imapPort,
      imapUser: dto.imapUser,
      imapPass: dto.imapPass,
      imapSecure: dto.imapSecure ?? true,
      fromName: dto.fromName,
      signature: dto.signature,
    };

    if (existing) {
      // If password is masked, keep the existing one
      if (dto.smtpPass === '********') {
        data.smtpPass = existing.smtpPass;
      }
      if (dto.imapPass === '********') {
        data.imapPass = existing.imapPass;
      }

      return this.prisma.emailConfig.update({
        where: { userId },
        data,
      });
    }

    return this.prisma.emailConfig.create({
      data: {
        ...data,
        userId,
      },
    });
  }

  async saveLogoUrl(url: string) {
    return this.prisma.systemSetting.upsert({
      where: { key: 'company_logo' },
      update: { value: url },
      create: { key: 'company_logo', value: url, label: '公司Logo' },
    });
  }

  async getLogoUrl(): Promise<string | null> {
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'company_logo' },
    });
    return setting?.value || null;
  }

  async testEmailConnection(userId: string) {
    const config = await this.prisma.emailConfig.findUnique({
      where: { userId },
    });

    if (!config) {
      throw new NotFoundException(
        'Email configuration not found. Please configure your email settings first.',
      );
    }

    try {
      const transporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort,
        secure: config.smtpSecure,
        auth: {
          user: config.smtpUser,
          pass: config.smtpPass,
        },
        connectionTimeout: 10000,
      });

      await transporter.verify();

      return {
        success: true,
        message: 'SMTP connection successful',
      };
    } catch (error) {
      return {
        success: false,
        message: `SMTP connection failed: ${error.message}`,
      };
    }
  }

  async getBankInfo(): Promise<any | null> {
    const [
      accountNumber,
      holderName,
      currency,
      bankName,
      bankAddress,
      accountType,
      swiftBic,
      routingNumber,
      country,
      paymentMemo,
    ] = await Promise.all<any>([
      this.prisma.systemSetting.findUnique({
        where: { key: 'bank_account_number' },
      }),
      this.prisma.systemSetting.findUnique({
        where: { key: 'bank_holder_name' },
      }),
      this.prisma.systemSetting.findUnique({
        where: { key: 'bank_currency' },
      }),
      this.prisma.systemSetting.findUnique({
        where: { key: 'bank_name' },
      }),
      this.prisma.systemSetting.findUnique({
        where: { key: 'bank_address' },
      }),
      this.prisma.systemSetting.findUnique({
        where: { key: 'bank_account_type' },
      }),
      this.prisma.systemSetting.findUnique({
        where: { key: 'bank_swift_bic' },
      }),
      this.prisma.systemSetting.findUnique({
        where: { key: 'bank_routing_number' },
      }),
      this.prisma.systemSetting.findUnique({
        where: { key: 'bank_country' },
      }),
      this.prisma.systemSetting.findUnique({
        where: { key: 'bank_payment_memo' },
      }),
    ]);

    // Return null if no bank info is set
    if (
      !accountNumber &&
      !holderName &&
      !bankName
    ) {
      return null;
    }

    return {
      accountNumber: accountNumber?.value,
      holderName: holderName?.value,
      currency: currency?.value,
      bankName: bankName?.value,
      bankAddress: bankAddress?.value,
      accountType: accountType?.value,
      swiftBic: swiftBic?.value,
      routingNumber: routingNumber?.value,
      country: country?.value,
      paymentMemo: paymentMemo?.value,
    };
  }

  async updateBankInfo(data: {
    accountNumber?: string;
    holderName?: string;
    currency?: string;
    bankName?: string;
    bankAddress?: string;
    accountType?: string;
    swiftBic?: string;
    routingNumber?: string;
    country?: string;
    paymentMemo?: string;
  }) {
    const updates: Promise<any>[] = [];

    if (data.accountNumber !== undefined) {
      updates.push(
        this.prisma.systemSetting.upsert({
          where: { key: 'bank_account_number' },
          update: { value: data.accountNumber },
          create: { key: 'bank_account_number', value: data.accountNumber },
        }),
      );
    }

    if (data.holderName !== undefined) {
      updates.push(
        this.prisma.systemSetting.upsert({
          where: { key: 'bank_holder_name' },
          update: { value: data.holderName },
          create: { key: 'bank_holder_name', value: data.holderName },
        }),
      );
    }

    if (data.currency !== undefined) {
      updates.push(
        this.prisma.systemSetting.upsert({
          where: { key: 'bank_currency' },
          update: { value: data.currency },
          create: { key: 'bank_currency', value: data.currency },
        }),
      );
    }

    if (data.bankName !== undefined) {
      updates.push(
        this.prisma.systemSetting.upsert({
          where: { key: 'bank_name' },
          update: { value: data.bankName },
          create: { key: 'bank_name', value: data.bankName },
        }),
      );
    }

    if (data.bankAddress !== undefined) {
      updates.push(
        this.prisma.systemSetting.upsert({
          where: { key: 'bank_address' },
          update: { value: data.bankAddress },
          create: { key: 'bank_address', value: data.bankAddress },
        }),
      );
    }

    if (data.accountType !== undefined) {
      updates.push(
        this.prisma.systemSetting.upsert({
          where: { key: 'bank_account_type' },
          update: { value: data.accountType },
          create: { key: 'bank_account_type', value: data.accountType },
        }),
      );
    }

    if (data.swiftBic !== undefined) {
      updates.push(
        this.prisma.systemSetting.upsert({
          where: { key: 'bank_swift_bic' },
          update: { value: data.swiftBic },
          create: { key: 'bank_swift_bic', value: data.swiftBic },
        }),
      );
    }

    if (data.routingNumber !== undefined) {
      updates.push(
        this.prisma.systemSetting.upsert({
          where: { key: 'bank_routing_number' },
          update: { value: data.routingNumber },
          create: { key: 'bank_routing_number', value: data.routingNumber },
        }),
      );
    }

    if (data.country !== undefined) {
      updates.push(
        this.prisma.systemSetting.upsert({
          where: { key: 'bank_country' },
          update: { value: data.country },
          create: { key: 'bank_country', value: data.country },
        }),
      );
    }

    if (data.paymentMemo !== undefined) {
      updates.push(
        this.prisma.systemSetting.upsert({
          where: { key: 'bank_payment_memo' },
          update: { value: data.paymentMemo },
          create: { key: 'bank_payment_memo', value: data.paymentMemo },
        }),
      );
    }

    if (updates.length === 0) {
      return this.getBankInfo();
    }

    await Promise.all(updates);
    return this.getBankInfo();
  }
}
