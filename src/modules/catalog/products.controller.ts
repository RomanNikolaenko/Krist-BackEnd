import { Controller, DefaultValuePipe, Get, Param, ParseIntPipe, Query } from '@nestjs/common';
import { Locale, RequestLocale } from 'src/common/decorators/locale.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { ProductQueryDto } from './dto/product-query.dto';
import { ProductsService } from './products.service';

/**
 * The catalogue, and it is open to everyone.
 *
 * A shop that demands a session before it will show a product has lost the sale
 * already, so every route here is `@Public()`. CSRF still applies to anything
 * that writes — there is nothing that writes.
 */
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Public()
  @Get()
  list(@Query() query: ProductQueryDto, @RequestLocale() locale: Locale) {
    return this.products.list(query, locale);
  }

  // Declared before `:slug`, or Nest would read "facets" as a product slug.
  @Public()
  @Get('facets')
  facets(@RequestLocale() locale: Locale) {
    return this.products.facets(locale);
  }

  @Public()
  @Get('bestsellers')
  bestsellers(
    @Query('count', new DefaultValuePipe(8), ParseIntPipe) count: number,
    @RequestLocale() locale: Locale,
  ) {
    return this.products.bestsellers(Math.min(Math.max(count, 1), 24), locale);
  }

  @Public()
  @Get(':slug')
  bySlug(@Param('slug') slug: string, @RequestLocale() locale: Locale) {
    return this.products.bySlug(slug, locale);
  }

  @Public()
  @Get(':slug/related')
  related(
    @Param('slug') slug: string,
    @Query('count', new DefaultValuePipe(4), ParseIntPipe) count: number,
    @RequestLocale() locale: Locale,
  ) {
    return this.products.related(slug, Math.min(Math.max(count, 1), 12), locale);
  }
}
