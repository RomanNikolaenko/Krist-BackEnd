import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { NotificationKind } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { WriteReviewDto } from './dto/review.dto';

export interface ReviewView {
  id: string;
  rating: number;
  title: string;
  body: string;
  createdAt: Date;
  author: {
    name: string;
    avatarUrl: string | null;
  };
  likes: number;
  /** Whether the person reading this has already found it useful. */
  likedByMe: boolean;
  /** Whether they wrote it — the UI offers edit and delete only for their own. */
  mine: boolean;
}

export interface ShopReview {
  id: string;
  rating: number;
  title: string;
  body: string;
  author: { name: string; avatarUrl: string | null };
  product: { slug: string; name: string };
}

@Injectable()
export class ReviewsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForProduct(slug: string, viewerId: string | null): Promise<ReviewView[]> {
    const product = await this.productBySlug(slug);

    const rows = await this.prisma.review.findMany({
      where: { productId: product.id },
      orderBy: [{ likes: { _count: 'desc' } }, { createdAt: 'desc' }],
      include: {
        user: { select: { id: true, email: true, profile: true } },
        likes: { select: { userId: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      title: row.title,
      body: row.body,
      createdAt: row.createdAt,
      author: {
        // Falls back to the address only when there is no name to show; an
        // anonymous-looking review is better than a blank byline.
        name:
          [row.user.profile?.firstName, row.user.profile?.lastName].filter(Boolean).join(' ') ||
          row.user.email,
        avatarUrl: row.user.profile?.avatarUrl ?? null,
      },
      likes: row.likes.length,
      likedByMe: viewerId !== null && row.likes.some((like) => like.userId === viewerId),
      mine: row.user.id === viewerId,
    }));
  }

  /**
   * Writes the reviewer's opinion of a product, replacing their previous one.
   *
   * An upsert rather than a create, because the schema allows one review per
   * person per product: posting a second one is someone changing their mind,
   * and answering with a unique-constraint error would be a worse way to say so.
   */
  async write(slug: string, userId: string, dto: WriteReviewDto): Promise<ReviewView> {
    const product = await this.productBySlug(slug);

    await this.prisma.review.upsert({
      where: { productId_userId: { productId: product.id, userId } },
      update: { rating: dto.rating, title: dto.title, body: dto.body },
      create: {
        productId: product.id,
        userId,
        rating: dto.rating,
        title: dto.title,
        body: dto.body,
      },
    });

    await this.prisma.notification.create({
      data: {
        userId,
        kind: NotificationKind.REVIEW_POSTED,
        metadata: { product: `${product.brand} ${product.name}` },
      },
    });

    const reviews = await this.listForProduct(slug, userId);
    const mine = reviews.find((review) => review.mine);
    if (!mine) throw new NotFoundException('The review went missing after it was written');

    return mine;
  }

  /**
   * Every review in the shop, for the rail on the home page.
   *
   * Not only the five-star ones. A page that quotes exclusively its happiest
   * customers is advertising rather than reporting, and the reader can tell.
   * Most-liked first, then newest, so the ones other shoppers found useful lead.
   *
   * The limit is a ceiling rather than a page size: there is no paging behind a
   * carousel, and a rail with ten thousand slides in it is a stalled browser.
   */
  async recent(limit: number): Promise<ShopReview[]> {
    const rows = await this.prisma.review.findMany({
      orderBy: [{ likes: { _count: 'desc' } }, { createdAt: 'desc' }],
      take: limit,
      include: {
        user: { select: { email: true, profile: true } },
        product: { select: { name: true, brand: true, slug: true } },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      rating: row.rating,
      title: row.title,
      body: row.body,
      author: {
        name:
          [row.user.profile?.firstName, row.user.profile?.lastName].filter(Boolean).join(' ') ||
          row.user.email,
        avatarUrl: row.user.profile?.avatarUrl ?? null,
      },
      product: { slug: row.product.slug, name: `${row.product.brand} ${row.product.name}` },
    }));
  }

  async remove(reviewId: string, userId: string): Promise<void> {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { userId: true },
    });

    if (!review) throw new NotFoundException('No such review');
    // Ownership is checked here rather than folded into the delete, so removing
    // someone else's review is a 403 and not a silent no-op.
    if (review.userId !== userId) throw new ForbiddenException('That review is not yours');

    await this.prisma.review.delete({ where: { id: reviewId } });
  }

  /**
   * Marks a review useful, or takes the mark back. Idempotent in both
   * directions: liking twice leaves one like, unliking what was never liked is
   * not an error.
   */
  async setLike(reviewId: string, userId: string, liked: boolean): Promise<{ likes: number }> {
    const review = await this.prisma.review.findUnique({
      where: { id: reviewId },
      select: { id: true, userId: true },
    });

    if (!review) throw new NotFoundException('No such review');
    if (review.userId === userId) {
      throw new ForbiddenException('You cannot mark your own review useful');
    }

    if (liked) {
      await this.prisma.reviewLike.upsert({
        where: { reviewId_userId: { reviewId, userId } },
        update: {},
        create: { reviewId, userId },
      });
    } else {
      await this.prisma.reviewLike.deleteMany({ where: { reviewId, userId } });
    }

    return { likes: await this.prisma.reviewLike.count({ where: { reviewId } }) };
  }

  private async productBySlug(slug: string) {
    const product = await this.prisma.product.findUnique({
      where: { slug },
      select: { id: true, brand: true, name: true },
    });

    if (!product) throw new NotFoundException('No such product');
    return product;
  }
}
