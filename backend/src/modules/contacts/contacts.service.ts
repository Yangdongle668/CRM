import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { Prisma } from '@prisma/client';

@Injectable()
export class ContactsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Verify that the current user has access to the given customer.
   * SALESPERSON can only access customers they own.
   */
  private async verifyCustomerAccess(
    customerId: string,
    userId: string,
    role: string,
  ) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, ownerId: true },
    });

    if (!customer) {
      throw new NotFoundException(
        `Customer with ID "${customerId}" not found`,
      );
    }

    if (role === 'SALESPERSON' && customer.ownerId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this customer',
      );
    }

    return customer;
  }

  async findAll(
    userId: string,
    role: string,
    query: {
      page?: string;
      pageSize?: string;
      search?: string;
      customerId?: string;
    },
  ) {
    const page = parseInt(query.page || '1', 10);
    const pageSize = parseInt(query.pageSize || '20', 10);
    const skip = (page - 1) * pageSize;

    const where: Prisma.ContactWhereInput = {};

    // If customerId is provided, filter by it
    if (query.customerId) {
      where.customerId = query.customerId;
    }

    // SALESPERSON can only see contacts belonging to their customers
    if (role !== 'ADMIN') {
      where.customer = { ownerId: userId };
    }

    // Search by name, email, or phone
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' } },
        { email: { contains: query.search, mode: 'insensitive' } },
        { phone: { contains: query.search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      this.prisma.contact.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
        include: {
          customer: { select: { id: true, companyName: true } },
        },
      }),
      this.prisma.contact.count({ where }),
    ]);

    return { items, total, page, pageSize };
  }

  async findOne(id: string, userId: string, role: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, companyName: true, ownerId: true } },
      },
    });

    if (!contact) {
      throw new NotFoundException(`Contact with ID "${id}" not found`);
    }

    if (role === 'SALESPERSON' && contact.customer.ownerId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to access this contact',
      );
    }

    return contact;
  }

  async create(dto: CreateContactDto, userId: string, role: string) {
    await this.verifyCustomerAccess(dto.customerId, userId, role);

    return this.prisma.contact.create({
      data: dto,
      include: {
        customer: { select: { id: true, companyName: true } },
      },
    });
  }

  async update(
    id: string,
    dto: UpdateContactDto,
    userId: string,
    role: string,
  ) {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, ownerId: true } },
      },
    });

    if (!contact) {
      throw new NotFoundException(`Contact with ID "${id}" not found`);
    }

    if (role === 'SALESPERSON' && contact.customer.ownerId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to update this contact',
      );
    }

    return this.prisma.contact.update({
      where: { id },
      data: dto,
      include: {
        customer: { select: { id: true, companyName: true } },
      },
    });
  }

  async remove(id: string, userId: string, role: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, ownerId: true } },
      },
    });

    if (!contact) {
      throw new NotFoundException(`Contact with ID "${id}" not found`);
    }

    if (role === 'SALESPERSON' && contact.customer.ownerId !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this contact',
      );
    }

    return this.prisma.contact.delete({ where: { id } });
  }
}
