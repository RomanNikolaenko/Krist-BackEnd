import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Locale, RequestLocale } from 'src/common/decorators/locale.decorator';
import type { RequestUser } from 'src/common/types/request-user';
import { MergeWishlistDto, WishlistItemDto } from './dto/account.dto';
import { WishlistService } from './wishlist.service';

/**
 * The wish list.
 *
 * `GET` answers with whole products because that is what the wish list screen
 * draws; the mutations answer with ids alone, which is all the heart on a
 * product card needs to settle into the right state.
 */
@Controller('account/wishlist')
export class WishlistController {
  constructor(private readonly wishlist: WishlistService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @RequestLocale() locale: Locale) {
    return this.wishlist.list(user.id, locale);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  add(@CurrentUser() user: RequestUser, @Body() dto: WishlistItemDto) {
    return this.wishlist.add(user.id, dto.productId);
  }

  @Post('merge')
  @HttpCode(HttpStatus.OK)
  merge(@CurrentUser() user: RequestUser, @Body() dto: MergeWishlistDto) {
    return this.wishlist.merge(user.id, dto.productIds);
  }

  @Delete(':productId')
  @HttpCode(HttpStatus.OK)
  remove(@CurrentUser() user: RequestUser, @Param('productId') productId: string) {
    return this.wishlist.remove(user.id, productId);
  }
}
