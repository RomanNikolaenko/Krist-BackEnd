import { Module } from '@nestjs/common';
import { AdminProductsController } from './admin-products.controller';
import { AdminProductsService } from './admin-products.service';
import { AdminTaxonomyController } from './admin-taxonomy.controller';
import { AdminTaxonomyService } from './admin-taxonomy.service';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

/**
 * ProductsService is exported because a wish list and an order both answer with
 * products, and there should be exactly one place that decides what a product
 * looks like on the wire.
 */
@Module({
  controllers: [ProductsController, AdminProductsController, AdminTaxonomyController],
  providers: [ProductsService, AdminProductsService, AdminTaxonomyService],
  exports: [ProductsService],
})
export class CatalogModule {}
