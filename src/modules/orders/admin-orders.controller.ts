import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { Locale, RequestLocale } from 'src/common/decorators/locale.decorator';
import { RequirePermissions } from 'src/common/decorators/roles.decorator';
import { PERMISSIONS } from 'src/modules/rbac/rbac.constants';
import { AdminOrdersService } from './admin-orders.service';
import { AdminOrderQueryDto, SetOrderStatusDto } from './dto/admin-order.dto';

/**
 * The order book, from the shop's side.
 *
 * Both routes take `orders.write` rather than read for one and write for the
 * other: the screen exists to move orders along, and a page of selects that
 * somebody may not use is worse than not showing it to them. Support, who holds
 * `orders.read` alone, needs a read-only screen of its own before that
 * permission means anything.
 */
@Controller('admin/orders')
@RequirePermissions(PERMISSIONS.ORDERS_WRITE)
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrdersService) {}

  @Get()
  list(@Query() query: AdminOrderQueryDto, @RequestLocale() locale: Locale) {
    return this.orders.list(query, locale);
  }

  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetOrderStatusDto,
    @RequestLocale() locale: Locale,
  ) {
    return this.orders.setStatus(id, dto.status, locale);
  }
}
