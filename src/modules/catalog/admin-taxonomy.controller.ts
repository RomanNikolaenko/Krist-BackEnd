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
} from '@nestjs/common';
import { Locale, RequestLocale } from 'src/common/decorators/locale.decorator';
import { RequirePermissions } from 'src/common/decorators/roles.decorator';
import { PERMISSIONS } from 'src/modules/rbac/rbac.constants';
import { AdminTaxonomyService } from './admin-taxonomy.service';
import {
  CreateCategoryDto,
  CreateColorDto,
  CreateSizeDto,
  UpdateCategoryDto,
  UpdateColorDto,
  UpdateSizeDto,
} from './dto/taxonomy.dto';

/**
 * The words the catalogue is written in.
 *
 * Behind the same permission as the products themselves: somebody who may
 * create a product may create the colour it comes in, and splitting the two
 * would only mean an administrator blocked halfway through one task.
 */
@Controller('admin')
@RequirePermissions(PERMISSIONS.PRODUCTS_WRITE)
export class AdminTaxonomyController {
  constructor(private readonly taxonomy: AdminTaxonomyService) {}

  @Get('colors')
  colors(@RequestLocale() locale: Locale) {
    return this.taxonomy.colors(locale);
  }

  @Post('colors')
  @HttpCode(HttpStatus.CREATED)
  createColor(@Body() dto: CreateColorDto) {
    return this.taxonomy.createColor(dto);
  }

  @Patch('colors/:id')
  updateColor(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateColorDto) {
    return this.taxonomy.updateColor(id, dto);
  }

  @Delete('colors/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeColor(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxonomy.removeColor(id);
  }

  @Get('sizes')
  sizes() {
    return this.taxonomy.sizes();
  }

  @Post('sizes')
  @HttpCode(HttpStatus.CREATED)
  createSize(@Body() dto: CreateSizeDto) {
    return this.taxonomy.createSize(dto);
  }

  @Patch('sizes/:id')
  updateSize(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateSizeDto) {
    return this.taxonomy.updateSize(id, dto);
  }

  @Delete('sizes/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeSize(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxonomy.removeSize(id);
  }

  @Get('categories')
  categories(@RequestLocale() locale: Locale) {
    return this.taxonomy.categories(locale);
  }

  @Post('categories')
  @HttpCode(HttpStatus.CREATED)
  createCategory(@Body() dto: CreateCategoryDto) {
    return this.taxonomy.createCategory(dto);
  }

  @Patch('categories/:id')
  updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCategoryDto) {
    return this.taxonomy.updateCategory(id, dto);
  }

  @Delete('categories/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeCategory(@Param('id', ParseUUIDPipe) id: string) {
    return this.taxonomy.removeCategory(id);
  }
}
