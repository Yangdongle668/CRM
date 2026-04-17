import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { TranslateService } from './translate.service';

@Controller('translate')
@UseGuards(JwtAuthGuard)
export class TranslateController {
  constructor(private readonly translateService: TranslateService) {}

  @Post()
  translate(
    @Body()
    body: {
      segments: { index: number; text: string }[];
      target?: string;
    },
  ) {
    return this.translateService.translateSegments(
      body.segments,
      body.target || 'zh-CN',
    );
  }
}
