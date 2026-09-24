import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { TranslateService } from './translate.service';
import { TranslateDto } from './dto/translate.dto';

@Controller('translate')
@UseGuards(JwtAuthGuard)
export class TranslateController {
  constructor(private readonly translateService: TranslateService) {}

  @Post()
  translate(@CurrentUser() user: any, @Body() body: TranslateDto) {
    return this.translateService.translateSegments(
      body.segments,
      body.target || 'zh-CN',
      { emailId: body.emailId, actor: user },
    );
  }
}
