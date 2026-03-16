import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  Res,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseFilePipe,
  MaxFileSizeValidator,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import * as path from 'path';
import { DocumentsService } from './documents.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

const uploadStorage = diskStorage({
  destination: (_req, _file, cb) => {
    const uploadDir = path.join(process.cwd(), 'uploads');
    const fs = require('fs');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const filename = `${uuidv4()}${ext}`;
    cb(null, filename);
  },
});

@Controller('api/documents')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: uploadStorage,
      limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
    }),
  )
  upload(
    @CurrentUser() user: any,
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 50 * 1024 * 1024 })],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
    @Body()
    body: {
      customerId?: string;
      category?: string;
      relatedType?: string;
      relatedId?: string;
    },
  ) {
    return this.documentsService.upload(user.id, file, body);
  }

  @Get()
  findAll(
    @CurrentUser() user: any,
    @Query() query: { customerId?: string; category?: string; page?: string; pageSize?: string },
  ) {
    return this.documentsService.findAll(user.id, user.role, query);
  }

  @Get(':id/download')
  async download(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const document = await this.documentsService.findOneForDownload(
      id,
      user.id,
      user.role,
    );

    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(document.fileName)}"`,
    );
    res.setHeader('Content-Type', document.mimeType);
    res.sendFile(path.resolve(document.filePath));
  }

  @Delete(':id')
  remove(@CurrentUser() user: any, @Param('id') id: string) {
    return this.documentsService.remove(id, user.id, user.role);
  }
}
