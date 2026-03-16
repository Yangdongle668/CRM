import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { EmailsService } from './emails.service';
import { SendEmailDto } from './dto/send-email.dto';
import { CreateTemplateDto } from './dto/create-template.dto';

@ApiTags('邮件')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('emails')
export class EmailsController {
  constructor(private readonly emailsService: EmailsService) {}

  @Post('send')
  async sendEmail(
    @CurrentUser() user: any,
    @Body() dto: SendEmailDto,
  ) {
    return this.emailsService.sendEmail(user.id, dto);
  }

  @Get()
  async findAll(
    @CurrentUser() user: any,
    @Query('customerId') customerId?: string,
    @Query('page') page?: number,
    @Query('pageSize') pageSize?: number,
  ) {
    return this.emailsService.findAll(user.id, user.role, {
      customerId,
      page,
      pageSize,
    });
  }

  @Get('templates')
  async findAllTemplates() {
    return this.emailsService.findAllTemplates();
  }

  @Post('templates')
  async createTemplate(@Body() dto: CreateTemplateDto) {
    return this.emailsService.createTemplate(dto);
  }

  @Put('templates/:id')
  async updateTemplate(
    @Param('id') id: string,
    @Body() dto: CreateTemplateDto,
  ) {
    return this.emailsService.updateTemplate(id, dto);
  }

  @Delete('templates/:id')
  async deleteTemplate(@Param('id') id: string) {
    return this.emailsService.deleteTemplate(id);
  }

  @Get(':id')
  async findOne(@CurrentUser() user: any, @Param('id') id: string) {
    return this.emailsService.findOne(id, user.id, user.role);
  }

  @Post('fetch')
  async fetchEmails(@CurrentUser() user: any) {
    return this.emailsService.fetchEmails(user.id);
  }
}
