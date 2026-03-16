import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ContactsService } from './contacts.service';
import { CreateContactDto } from './dto/create-contact.dto';
import { UpdateContactDto } from './dto/update-contact.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';

@Controller('contacts')
@UseGuards(JwtAuthGuard)
export class ContactsController {
  constructor(private readonly contactsService: ContactsService) {}

  @Get()
  findAllByCustomer(
    @Query('customerId') customerId: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.contactsService.findAllByCustomer(
      customerId,
      user.id,
      user.role,
    );
  }

  @Get(':id')
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.contactsService.findOne(id, user.id, user.role);
  }

  @Post()
  create(
    @Body() dto: CreateContactDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.contactsService.create(dto, user.id, user.role);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateContactDto,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.contactsService.update(id, dto, user.id, user.role);
  }

  @Delete(':id')
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: string },
  ) {
    return this.contactsService.remove(id, user.id, user.role);
  }
}
