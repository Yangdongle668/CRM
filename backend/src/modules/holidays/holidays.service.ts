import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';

export interface HolidayDto {
  date: string; // YYYY-MM-DD
  name: string;
  nameEn?: string;
  type?: 'CN' | 'CN_TRAD' | 'INTL';
  isOff?: boolean;
  lunar?: boolean;
  note?: string;
}

function parseDate(v: string): Date {
  // Treat date-only strings as UTC midnight so year/month/day don't shift
  // across timezones when the Postgres @db.Date column rounds.
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return new Date(`${v}T00:00:00.000Z`);
  }
  const d = new Date(v);
  if (isNaN(d.getTime())) {
    throw new BadRequestException(`Invalid date: ${v}`);
  }
  return d;
}

@Injectable()
export class HolidaysService {
  constructor(private readonly prisma: PrismaService) {}

  async listByRange(startDate: string, endDate: string) {
    return this.prisma.holiday.findMany({
      where: {
        date: {
          gte: parseDate(startDate),
          lte: parseDate(endDate),
        },
      },
      orderBy: { date: 'asc' },
    });
  }

  async listByYear(year: number) {
    return this.prisma.holiday.findMany({
      where: { year },
      orderBy: { date: 'asc' },
    });
  }

  async create(dto: HolidayDto) {
    const date = parseDate(dto.date);
    return this.prisma.holiday.create({
      data: {
        year: date.getUTCFullYear(),
        date,
        name: dto.name,
        nameEn: dto.nameEn,
        type: dto.type ?? 'CN',
        isOff: dto.isOff ?? false,
        lunar: dto.lunar ?? false,
        note: dto.note,
      },
    });
  }

  async update(id: string, dto: Partial<HolidayDto>) {
    const existing = await this.prisma.holiday.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Holiday not found');

    const data: Prisma.HolidayUpdateInput = {};
    if (dto.date !== undefined) {
      const d = parseDate(dto.date);
      data.date = d;
      data.year = d.getUTCFullYear();
    }
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.nameEn !== undefined) data.nameEn = dto.nameEn;
    if (dto.type !== undefined) data.type = dto.type;
    if (dto.isOff !== undefined) data.isOff = dto.isOff;
    if (dto.lunar !== undefined) data.lunar = dto.lunar;
    if (dto.note !== undefined) data.note = dto.note;

    return this.prisma.holiday.update({ where: { id }, data });
  }

  async remove(id: string) {
    const existing = await this.prisma.holiday.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Holiday not found');
    await this.prisma.holiday.delete({ where: { id } });
    return { message: 'Holiday deleted' };
  }

  async bulkUpsert(year: number, items: HolidayDto[]) {
    // Admin uploads the full list for a year — replace everything for that year
    // in a single transaction so the calendar never shows a half-applied update.
    return this.prisma.$transaction(async (tx) => {
      await tx.holiday.deleteMany({ where: { year } });
      if (items.length === 0) return { count: 0 };
      await tx.holiday.createMany({
        data: items.map((dto) => {
          const date = parseDate(dto.date);
          return {
            year: date.getUTCFullYear(),
            date,
            name: dto.name,
            nameEn: dto.nameEn,
            type: dto.type ?? 'CN',
            isOff: dto.isOff ?? false,
            lunar: dto.lunar ?? false,
            note: dto.note,
          };
        }),
        skipDuplicates: true,
      });
      return { count: items.length };
    });
  }

  async listYearsWithData() {
    const rows = await this.prisma.holiday.groupBy({
      by: ['year'],
      _count: { _all: true },
      orderBy: { year: 'asc' },
    });
    return rows.map((r) => ({ year: r.year, count: r._count._all }));
  }
}
