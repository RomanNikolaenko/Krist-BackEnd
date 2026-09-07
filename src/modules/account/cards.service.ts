import { Injectable, NotFoundException } from '@nestjs/common';
import { CardBrand, SavedCard } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { SavedCardDto } from './dto/account.dto';

@Injectable()
export class CardsService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string): Promise<SavedCard[]> {
    return this.prisma.savedCard.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  async create(userId: string, dto: SavedCardDto): Promise<SavedCard> {
    const existing = await this.prisma.savedCard.count({ where: { userId } });
    const isDefault = dto.isDefault ?? existing === 0;

    return this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.savedCard.updateMany({ where: { userId }, data: { isDefault: false } });
      }

      return tx.savedCard.create({
        data: { ...dto, brand: CardBrand[dto.brand], userId, isDefault },
      });
    });
  }

  async remove(userId: string, id: string): Promise<void> {
    const card = await this.own(userId, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.savedCard.delete({ where: { id } });

      if (!card.isDefault) return;

      const next = await tx.savedCard.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      if (next) await tx.savedCard.update({ where: { id: next.id }, data: { isDefault: true } });
    });
  }

  async setDefault(userId: string, id: string): Promise<SavedCard> {
    await this.own(userId, id);

    return this.prisma.$transaction(async (tx) => {
      await tx.savedCard.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.savedCard.update({ where: { id }, data: { isDefault: true } });
    });
  }

  /** Someone else's card is "not found", for the same reason an address is. */
  private async own(userId: string, id: string): Promise<SavedCard> {
    const card = await this.prisma.savedCard.findFirst({ where: { id, userId } });
    if (!card) throw new NotFoundException('No such card');
    return card;
  }
}
