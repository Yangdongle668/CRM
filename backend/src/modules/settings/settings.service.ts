import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { UpdateSettingsDto } from './dto/update-settings.dto';
import { BankInfoDto } from './dto/bank-info.dto';

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

  /**
   * Return the default bank info block used by the PI PDF generator when
   * a PI does not reference a specific BankAccount. Falls back to the
   * legacy `bank_info_text` system setting if no default BankAccount row
   * exists yet (first-time install).
   */
  async getBankInfo(): Promise<{ bankInfoText: string } | null> {
    const defaultAccount = await this.prisma.bankAccount.findFirst({
      where: { isDefault: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });

    if (defaultAccount) {
      return defaultAccount.bankInfoText
        ? { bankInfoText: defaultAccount.bankInfoText }
        : null;
    }

    const setting = await this.prisma.systemSetting.findUnique({
      where: { key: 'bank_info_text' },
    });
    if (!setting) return null;
    return { bankInfoText: setting.value };
  }

  /**
   * Resolve the bank info block to embed in a PI PDF:
   *   1. If the PI picked a specific BankAccount → use its `bankInfoText`.
   *   2. Otherwise fall back to the default BankAccount (getBankInfo).
   */
  async getBankInfoForPi(
    bankAccountId?: string | null,
  ): Promise<{ bankInfoText: string } | null> {
    if (bankAccountId) {
      const account = await this.prisma.bankAccount.findUnique({
        where: { id: bankAccountId },
      });
      if (account?.bankInfoText) {
        return { bankInfoText: account.bankInfoText };
      }
    }
    return this.getBankInfo();
  }

  async updateBankInfo(data: { bankInfoText?: string }) {
    // Kept for backward compatibility with old admin setup scripts. New UI
    // should use the `/settings/bank-accounts` endpoints instead.
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
