import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Locale, RequestLocale } from 'src/common/decorators/locale.decorator';
import type { RequestUser } from 'src/common/types/request-user';
import { PlaceOrderDto } from './dto/order.dto';
import { OrdersService } from './orders.service';

/**
 * Orders belong to whoever placed them, and every route here reads the owner
 * from the session rather than the URL.
 */
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(@CurrentUser() user: RequestUser, @RequestLocale() locale: Locale) {
    return this.orders.list(user.id, locale);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  place(@CurrentUser() user: RequestUser, @Body() dto: PlaceOrderDto) {
    return this.orders.place(user.id, dto);
  }

  /*
   * Declared before ":id" so Nest does not read "items" as an order id, and a
   * POST because it changes something. The front end has been calling this
   * since the Orders screen was built; nothing was listening.
   */
  @Post('items/:lineId/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  cancelLine(@CurrentUser() user: RequestUser, @Param('lineId') lineId: string) {
    return this.orders.cancelLine(user.id, lineId);
  }

  @Get(':id')
  byId(@CurrentUser() user: RequestUser, @Param('id') id: string, @RequestLocale() locale: Locale) {
    return this.orders.byId(user.id, id, locale);
  }
}
