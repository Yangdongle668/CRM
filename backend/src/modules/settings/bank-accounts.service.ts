import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateBankAccountDto, UpdateBankAccountDto } from './dto/bank-account.dto';

/**
 * BankAccountsService — multi-bank management for PI / invoicing.
 *
 * Why this exists:
 *   The old design stored a single bank info blob in `system_settings`
 *   (key: `bank_info_text`). But in practice, a foreign-trade company
 *   maintains several accounts (USD / EUR / CNY / HKD ...) and needs to
 *   pick one per PI. This service owns the BankAccount CRUD and supports:
 *     - `alias` for quick picking in the PI dropdown (e.g. "招行 USD")
 *     - optional `isDefault` — used as the fallback for legacy code paths
 *       that still call `getBankInfo()`.
 */
@Injectable()
export class BankAccountsService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.bankAccount.findMany({
      orderBy: [
        { isDefault: 'desc' },
        { sortOrder: 'asc' },
        { createdAt: 'asc' },
      ],
    });
  }

  async findOne(id: string) {
    const account = await this.prisma.bankAccount.findUnique({ where: { id } });
    if (!account) throw new NotFoundException('Bank account not found');
    return account;
  }

  async findDefault() {
    return this.prisma.bankAccount.findFirst({
      where: { isDefault: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(dto: CreateBankAccountDto) {
    // If this is the first account, mark it as default automatically so the
    // PDF generator always has something to fall back on.
    const count = await this.prisma.bankAccount.count();
    const shouldBeDefault = dto.isDefault ?? count === 0;

    if (shouldBeDefault) {
      await this.prisma.bankAccount.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.bankAccount.create({
      data: {
        ...dto,
        isDefault: shouldBeDefault,
      },
    });
  }

  async update(id: string, dto: UpdateBankAccountDto) {
    await this.findOne(id); // ensure exists

    if (dto.isDefault === true) {
      await this.prisma.bankAccount.updateMany({
        where: { isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.bankAccount.update({
      where: { id },
      data: dto,
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    // Detach from PIs that reference it (Prisma SET NULL via FK)
    return this.prisma.bankAccount.delete({ where: { id } });
  }

  async setDefault(id: string) {
    await this.findOne(id);
    await this.prisma.bankAccount.updateMany({
      where: { isDefault: true, NOT: { id } },
      data: { isDefault: false },
    });
    return this.prisma.bankAccount.update({
      where: { id },
      data: { isDefault: true },
    });
  }
}
