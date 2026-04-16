import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RatesService } from './rates.service';

@Controller('rates')
@UseGuards(JwtAuthGuard)
export class RatesController {
  constructor(private readonly ratesService: RatesService) {}

  @Get()
  getRates() {
    return this.ratesService.getRates();
  }
}
