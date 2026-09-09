import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query } from '@nestjs/common';
import { Locale, RequestLocale } from 'src/common/decorators/locale.decorator';
import { RequirePermissions } from 'src/common/decorators/roles.decorator';
import { PERMISSIONS } from 'src/modules/rbac/rbac.constants';
import { AdminOrdersService } from './admin-orders.service';
import { AdminOrderQueryDto, SetOrderStatusDto } from './dto/admin-order.dto';

/**
 * The order book, from the shop's side.
 *
 * Read and write are separate permissions because the people are: support
 * answers "where is my parcel" and has no business changing the answer, while
 * whoever packs it does. The screen reads `orders.write` back from the session
 * and shows the status as text to anybody without it.
 */
@Controller('admin/orders')
@RequirePermissions(PERMISSIONS.ORDERS_READ)
export class AdminOrdersController {
  constructor(private readonly orders: AdminOrdersService) {}

  @Get()
  list(@Query() query: AdminOrderQueryDto, @RequestLocale() locale: Locale) {
    return this.orders.list(query, locale);
  }

  @RequirePermissions(PERMISSIONS.ORDERS_WRITE)
  @Patch(':id/status')
  setStatus(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetOrderStatusDto,
    @RequestLocale() locale: Locale,
  ) {
    return this.orders.setStatus(id, dto.status, locale);
  }
}
