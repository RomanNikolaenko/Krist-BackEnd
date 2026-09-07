import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { RequestUser } from 'src/common/types/request-user';
import { AddressesService } from './addresses.service';
import { AddressDto } from './dto/account.dto';

/** The shipping address book. Every route is scoped to the session's own user. */
@Controller('account/addresses')
export class AddressesController {
  constructor(private readonly addresses: AddressesService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.addresses.list(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: RequestUser, @Body() dto: AddressDto) {
    return this.addresses.create(user.id, dto);
  }

  @Put(':id')
  update(@CurrentUser() user: RequestUser, @Param('id') id: string, @Body() dto: AddressDto) {
    return this.addresses.update(user.id, id, dto);
  }

  @Post(':id/default')
  @HttpCode(HttpStatus.OK)
  setDefault(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.addresses.setDefault(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.addresses.remove(user.id, id);
  }
}
