import { Injectable, NotFoundException } from '@nestjs/common';
import { Address } from '@prisma/client';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { AddressDto } from './dto/account.dto';

@Injectable()
export class AddressesService {
  constructor(private readonly prisma: PrismaService) {}

  list(userId: string): Promise<Address[]> {
    // Default first, then oldest: the address book reads as "where things go
    // unless you say otherwise", followed by the rest in the order they were added.
    return this.prisma.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });
  }

  /**
   * The first address someone saves becomes their default whether they asked
   * for it or not — an address book with no default makes checkout ask a
   * question it could have answered itself.
   */
  async create(userId: string, dto: AddressDto): Promise<Address> {
    const existing = await this.prisma.address.count({ where: { userId } });
    const isDefault = dto.isDefault ?? existing === 0;

    return this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }

      return tx.address.create({ data: { ...dto, userId, isDefault } });
    });
  }

  async update(userId: string, id: string, dto: AddressDto): Promise<Address> {
    await this.own(userId, id);

    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault) {
        await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      }

      return tx.address.update({
        where: { id },
        data: { ...dto, isDefault: dto.isDefault ?? false },
      });
    });
  }

  /**
   * Removing the default promotes whatever is left, so the account never ends
   * up with addresses but no default.
   */
  async remove(userId: string, id: string): Promise<void> {
    const address = await this.own(userId, id);

    await this.prisma.$transaction(async (tx) => {
      await tx.address.delete({ where: { id } });

      if (!address.isDefault) return;

      const next = await tx.address.findFirst({
        where: { userId },
        orderBy: { createdAt: 'asc' },
      });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    });
  }

  async setDefault(userId: string, id: string): Promise<Address> {
    await this.own(userId, id);

    return this.prisma.$transaction(async (tx) => {
      await tx.address.updateMany({ where: { userId }, data: { isDefault: false } });
      return tx.address.update({ where: { id }, data: { isDefault: true } });
    });
  }

  /**
   * Ownership and existence in one question, answered the same way.
   *
   * Someone else's address is "not found" rather than "forbidden", because the
   * difference between the two tells a stranger that the id is real.
   */
  private async own(userId: string, id: string): Promise<Address> {
    const address = await this.prisma.address.findFirst({ where: { id, userId } });
    if (!address) throw new NotFoundException('No such address');
    return address;
  }
}
