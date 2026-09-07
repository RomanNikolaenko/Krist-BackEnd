import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import { MaybeUser } from 'src/common/decorators/maybe-user.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import type { RequestUser } from 'src/common/types/request-user';
import { WriteReviewDto } from './dto/review.dto';
import { ReviewsService } from './reviews.service';

/**
 * Reviews, and what people do to them.
 *
 * The paths are written out in full rather than sharing a controller prefix,
 * because the two halves live at different roots: a review is read under the
 * product it is about, and acted on by its own id.
 *
 * Reading is public — reviews are most of the reason a product page persuades
 * anyone — while writing, deleting and liking all require a session, and the
 * global CSRF guard covers every one of them.
 */
@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Public()
  @Get('products/:slug/reviews')
  list(@Param('slug') slug: string, @MaybeUser() viewer: RequestUser | null) {
    return this.reviews.listForProduct(slug, viewer?.id ?? null);
  }

  @Public()
  @Get('reviews')
  all(@Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number) {
    return this.reviews.recent(Math.min(Math.max(limit, 1), 200));
  }

  @Post('products/:slug/reviews')
  write(
    @Param('slug') slug: string,
    @CurrentUser() user: RequestUser,
    @Body() dto: WriteReviewDto,
  ) {
    return this.reviews.write(slug, user.id, dto);
  }

  @Delete('reviews/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  remove(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.reviews.remove(id, user.id);
  }

  @Post('reviews/:id/like')
  @HttpCode(HttpStatus.OK)
  like(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.reviews.setLike(id, user.id, true);
  }

  @Delete('reviews/:id/like')
  @HttpCode(HttpStatus.OK)
  unlike(@Param('id') id: string, @CurrentUser() user: RequestUser) {
    return this.reviews.setLike(id, user.id, false);
  }
}
