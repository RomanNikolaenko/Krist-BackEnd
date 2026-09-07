import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { RequestUser } from 'src/common/types/request-user';
import { CardsService } from './cards.service';
import { SavedCardDto } from './dto/account.dto';

/**
 * Saved cards — brand, holder, expiry and the last four digits.
 *
 * There is no update route on purpose. A card is not edited; a new one is
 * saved and the old one removed, which is also what happens at the bank.
 */
@Controller('account/cards')
export class CardsController {
  constructor(private readonly cards: CardsService) {}

  @Get()
  list(@CurrentUser() user: RequestUser) {
    return this.cards.list(user.id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@CurrentUser() user: RequestUser, @Body() dto: SavedCardDto) {
    return this.cards.create(user.id, dto);
  }

  @Post(':id/default')
  @HttpCode(HttpStatus.OK)
  setDefault(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.cards.setDefault(user.id, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.cards.remove(user.id, id);
  }
}
