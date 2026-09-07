import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { Locale, RequestLocale } from 'src/common/decorators/locale.decorator';
import { RequirePermissions } from 'src/common/decorators/roles.decorator';
import { PERMISSIONS } from 'src/modules/rbac/rbac.constants';
import { AdminProductsService } from './admin-products.service';
import { AdminProductQueryDto, CreateProductDto, UpdateProductDto } from './dto/admin-product.dto';

/**
 * The catalogue, from the other side.
 *
 * Separate from the public `products` controller rather than sharing it with a
 * decorator per route: the reason this exists at all is that a different set of
 * people may use it, and a controller whose every route needs the same
 * permission should say so once, at the top, where it cannot be forgotten on
 * the next route somebody adds.
 *
 * `products.write` covers reading too. There is nothing here a person without
 * it would want — the shop itself is public — and requiring one permission
 * rather than two keeps the roles honest about what the screen actually needs.
 */
@Controller('admin')
@RequirePermissions(PERMISSIONS.PRODUCTS_WRITE)
export class AdminProductsController {
  constructor(private readonly products: AdminProductsService) {}

  @Get('products')
  list(@Query() query: AdminProductQueryDto, @RequestLocale() locale: Locale) {
    return this.products.list(query, locale);
  }

  /** Declared before `products/:id`, or Nest reads "options" as an id. */
  @Get('products/options')
  options() {
    return this.products.options();
  }

  @Get('products/:id')
  byId(@Param('id', ParseUUIDPipe) id: string, @RequestLocale() locale: Locale) {
    return this.products.byId(id, locale);
  }

  @Post('products')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Patch('products/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) {
    return this.products.update(id, dto);
  }

  @Delete('products/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.products.remove(id);
  }
}
