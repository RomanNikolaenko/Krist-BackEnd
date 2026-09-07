import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { CatalogModule } from '../catalog/catalog.module';
import { AccountController } from './account.controller';
import { AccountService } from './account.service';
import { AddressesController } from './addresses.controller';
import { AvatarService } from './avatar.service';
import { AddressesService } from './addresses.service';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { WishlistController } from './wishlist.controller';
import { WishlistService } from './wishlist.service';

/** Everything behind "My Profile": the record, the address book, the cards,
 *  the wish list and the notification feed. */
@Module({
  imports: [AuthModule, CatalogModule],
  controllers: [AccountController, AddressesController, CardsController, WishlistController],
  providers: [AccountService, AvatarService, AddressesService, CardsService, WishlistService],
})
export class AccountModule {}
