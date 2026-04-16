import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreatePITemplateDto,
  UpdatePITemplateDto,
} from './dto/pi-template.dto';

/**
 * PITemplatesService — manages reusable PI presets.
 *
 * A template captures the "how this kind of PI looks" — trade term, payment
 * term, shipping / payment method, default bank account, notes, etc. When a
 * salesperson picks a template while creating a PI, those fields get copied
 * into the PI form; from there the user is free to override anything.
 *
 * `isDefault` — there is at most one default; it is used as the initial
 * selection when the create-PI form loads so a fresh PI starts pre-filled.
 */
@Injectable()
export class PITemplatesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.pITemplate.findMany({
      orderBy: [
        { isDefault: 'desc' },
        { sortOrder: 'asc' },
        { createdAt: 'asc' },
      ],
      include: { bankAccount: true },
    });
  }

  async findOne(id: string) {
    const template = await this.prisma.pITemplate.findUnique({
      where: { id },
      include: { bankAccount: true },
    });
    if (!template) throw new NotFoundException('PI template not found');
    return template;
  }

  async findDefault() {
    return this.prisma.pITemplate.findFirst({
      where: { isDefault: true },
      include: { bankAccount: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async create(dto: CreatePITemplateDto) {
    const count = await this.prisma.pITemplate.count();
    const shouldBeDefault = dto.isDefault ?? count === 0;

    if (shouldBeDefault) {
      await this.prisma.pITemplate.updateMany({
        where: { isDefault: true },
        data: { isDefault: false },
      });
    }

    return this.prisma.pITemplate.create({
      data: {
        ...dto,
        isDefault: shouldBeDefault,
      },
      include: { bankAccount: true },
    });
  }

  async update(id: string, dto: UpdatePITemplateDto) {
    await this.findOne(id);

    if (dto.isDefault === true) {
      await this.prisma.pITemplate.updateMany({
        where: { isDefault: true, NOT: { id } },
        data: { isDefault: false },
      });
    }

    return this.prisma.pITemplate.update({
      where: { id },
      data: dto,
      include: { bankAccount: true },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.pITemplate.delete({ where: { id } });
  }

  async setDefault(id: string) {
    await this.findOne(id);
    await this.prisma.pITemplate.updateMany({
      where: { isDefault: true, NOT: { id } },
      data: { isDefault: false },
    });
    return this.prisma.pITemplate.update({
      where: { id },
      data: { isDefault: true },
      include: { bankAccount: true },
    });
  }
}
