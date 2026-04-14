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
    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'bank_info_text' },
    });

    if (!setting) {
      return null;
    }

    return {
      bankInfoText: setting.value,
    };
  }

  async updateBankInfo(data: { bankInfoText?: string }) {
    if (data.bankInfoText === undefined) {
      return this.getBankInfo();
    }

    await this.prisma.systemSetting.upsert({
      where: { key: 'bank_info_text' },
      update: { value: data.bankInfoText },
      create: { key: 'bank_info_text', value: data.bankInfoText },
    });

    return this.getBankInfo();
  }

  // ==================== Company Info ====================

  private readonly COMPANY_INFO_KEYS = [
    'company_name',
    'company_address',
    'company_phone',
    'company_email',
    'company_website',
  ];

  async getCompanyInfo() {
    const settings = await this.prisma.systemSetting.findMany({
      where: { key: { in: this.COMPANY_INFO_KEYS } },
    });
    const map: Record<string, string> = {};
    for (const s of settings) {
      // Convert snake_case key to camelCase
      const camel = s.key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
      map[camel] = s.value;
    }
    return map;
  }

  async updateCompanyInfo(data: Record<string, string>) {
    const keyMap: Record<string, string> = {
      companyName: 'company_name',
      companyAddress: 'company_address',
      companyPhone: 'company_phone',
      companyEmail: 'company_email',
      companyWebsite: 'company_website',
    };

    const labelMap: Record<string, string> = {
      companyName: '公司名称',
      companyAddress: '公司地址',
      companyPhone: '公司电话',
      companyEmail: '公司邮箱',
      companyWebsite: '公司网站',
    };

    await Promise.all(
      Object.entries(data)
        .filter(([k]) => keyMap[k])
        .map(([k, v]) =>
          this.prisma.systemSetting.upsert({
            where: { key: keyMap[k] },
            update: { value: v || '' },
            create: { key: keyMap[k], value: v || '', label: labelMap[k] },
          }),
        ),
    );

    return this.getCompanyInfo();
  }
}
