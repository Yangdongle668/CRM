import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
  Res,
  BadRequestException,
} from '@nestjs/common';
import { Response } from 'express';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PIsService } from './pis.service';
import { CreatePIDto } from './dto/create-pi.dto';
import { UpdatePIDto } from './dto/update-pi.dto';
import { QueryPIDto } from './dto/query-pi.dto';

@Controller('pis')
@UseGuards(JwtAuthGuard)
export class PIsController {
  constructor(private readonly pisService: PIsService) {}

  @Post()
  async create(
    @CurrentUser() user: any,
    @Body() dto: CreatePIDto,
  ) {
    return this.pisService.create(user.id, user.role, dto);
  }

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query() query: QueryPIDto,
  ) {
    return this.pisService.findAll(user.id, user.role, query);
  }

  @Get(':id')
  async findOne(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.pisService.findOne(id, user.id, user.role);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() dto: UpdatePIDto,
  ) {
    return this.pisService.update(id, user.id, user.role, dto);
  }

  @Delete(':id')
  async remove(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.pisService.remove(id, user.id, user.role);
  }

  @Post(':id/submit-approval')
  async submitForApproval(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.pisService.submitForApproval(id, user.id);
  }

  @Post(':id/approve')
  async approvePI(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.pisService.approvePI(id, user.id, user.role);
  }

  @Post(':id/reject')
  async rejectPI(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() body: { reason: string },
  ) {
    if (!body.reason) {
      throw new BadRequestException('Rejection reason is required');
    }
    return this.pisService.rejectPI(id, user.id, user.role, body.reason);
  }

  @Post(':id/pdf')
  async generatePdf(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    const pdfBuffer = await this.pisService.generatePdf(id, user.id, user.role);
    return { buffer: pdfBuffer.toString('base64') };
  }

  @Get(':id/download')
  async downloadPdf(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const pdfBuffer = await this.pisService.generatePdf(id, user.id, user.role);
    const pi = await this.pisService.findOne(id, user.id, user.role);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${pi.piNo}.pdf"`);
    res.send(pdfBuffer);
  }
}
