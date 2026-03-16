import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { Prisma } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  async upload(
    userId: string,
    file: Express.Multer.File,
    body: {
      customerId?: string;
      category?: string;
      relatedType?: string;
      relatedId?: string;
    },
  ) {
    return this.prisma.document.create({
      data: {
        fileName: file.originalname,
        filePath: file.path,
        fileSize: file.size,
        mimeType: file.mimetype,
        category: body.category,
        customerId: body.customerId,
        relatedType: body.relatedType,
        relatedId: body.relatedId,
        ownerId: userId,
      },
      include: {
        owner: { select: { id: true, name: true, email: true } },
        customer: { select: { id: true, companyName: true } },
      },
    });
  }

  async findAll(
    userId: string,
    role: string,
    query: {
      customerId?: string;
      category?: string;
      page?: string;
      pageSize?: string;
    },
  ) {
    const page = parseInt(query.page || '1', 10);
    const pageSize = parseInt(query.pageSize || '20', 10);
    const skip = (page - 1) * pageSize;

    const where: Prisma.DocumentWhereInput = {};

    if (role !== 'ADMIN') {
      where.ownerId = userId;
    }

    if (query.customerId) {
      where.customerId = query.customerId;
    }

    if (query.category) {
      where.category = query.category;
    }

    const [data, total] = await Promise.all([
      this.prisma.document.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          owner: { select: { id: true, name: true, email: true } },
          customer: { select: { id: true, companyName: true } },
        },
      }),
      this.prisma.document.count({ where }),
    ]);

    return {
      data,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOneForDownload(id: string, userId: string, role: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (role !== 'ADMIN' && document.ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this document');
    }

    if (!fs.existsSync(document.filePath)) {
      throw new NotFoundException('File not found on disk');
    }

    return document;
  }

  async remove(id: string, userId: string, role: string) {
    const document = await this.prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      throw new NotFoundException('Document not found');
    }

    if (role !== 'ADMIN' && document.ownerId !== userId) {
      throw new ForbiddenException('You do not have access to this document');
    }

    // Delete file from disk
    if (fs.existsSync(document.filePath)) {
      fs.unlinkSync(document.filePath);
    }

    await this.prisma.document.delete({ where: { id } });
    return { message: 'Document deleted successfully' };
  }
}
