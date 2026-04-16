import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/permissions/permissions.guard';
import { RequirePermissions } from '../../common/permissions/require-permissions.decorator';
import { BankAccountsService } from './bank-accounts.service';
import { CreateBankAccountDto, UpdateBankAccountDto } from './dto/bank-account.dto';

@Controller('settings/bank-accounts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class BankAccountsController {
  constructor(private readonly bankAccountsService: BankAccountsService) {}

  // Readers: anyone with pi:read (business users) can see the list so they
  // can pick a bank when creating a PI. Writes require settings:update.
  @Get()
  @RequirePermissions('pi:read')
  findAll() {
    return this.bankAccountsService.findAll();
  }

  @Get(':id')
  @RequirePermissions('pi:read')
  findOne(@Param('id') id: string) {
    return this.bankAccountsService.findOne(id);
  }

  @Post()
  @RequirePermissions('settings:update')
  create(@Body() dto: CreateBankAccountDto) {
    return this.bankAccountsService.create(dto);
  }

  @Put(':id')
  @RequirePermissions('settings:update')
  update(@Param('id') id: string, @Body() dto: UpdateBankAccountDto) {
    return this.bankAccountsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('settings:update')
  remove(@Param('id') id: string) {
    return this.bankAccountsService.remove(id);
  }

  @Patch(':id/default')
  @RequirePermissions('settings:update')
  setDefault(@Param('id') id: string) {
    return this.bankAccountsService.setDefault(id);
  }
}
