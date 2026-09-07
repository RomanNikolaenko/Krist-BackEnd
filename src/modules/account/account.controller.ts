import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import { CurrentUser } from 'src/common/decorators/current-user.decorator';
import type { RequestUser } from 'src/common/types/request-user';
import { AccountService } from './account.service';
import { AvatarService, UploadedImage } from './avatar.service';
import { DeleteAccountDto, UpdateProfileDto } from './dto/account.dto';

/**
 * The account's own record of itself.
 *
 * Nothing here is public and nothing takes an id for whose account to read:
 * the subject is always the session's own user, which removes a whole class of
 * "change the number in the URL" bug before it can be written.
 */
@Controller('account')
export class AccountController {
  constructor(
    private readonly account: AccountService,
    private readonly avatars: AvatarService,
  ) {}

  @Get('profile')
  profile(@CurrentUser() user: RequestUser) {
    return this.account.profile(user.id);
  }

  @Patch('profile')
  updateProfile(@CurrentUser() user: RequestUser, @Body() dto: UpdateProfileDto) {
    return this.account.updateProfile(user.id, dto);
  }

  /**
   * The profile picture. Held in memory rather than streamed to a temporary
   * file, because it has to be inspected before anything is written to disk,
   * and two megabytes is small enough to look at whole.
   */
  @Post('avatar')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 2 * 1024 * 1024 + 1 } }))
  uploadAvatar(@CurrentUser() user: RequestUser, @UploadedFile() file?: UploadedImage) {
    return this.avatars.replace(user.id, file);
  }

  @Delete('avatar')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeAvatar(@CurrentUser() user: RequestUser) {
    return this.avatars.remove(user.id);
  }

  /**
   * Closes the account. Irreversible, and the only thing here that is.
   *
   * The response carries a message rather than a 204, because the browser has
   * something to say to the person afterwards, and the cookies are cleared on
   * the way out.
   */
  @Delete()
  @HttpCode(HttpStatus.OK)
  deleteAccount(
    @CurrentUser() user: RequestUser,
    @Body() dto: DeleteAccountDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.account.deleteAccount(user, dto, request, response);
  }
  @Get('notifications')
  notifications(@CurrentUser() user: RequestUser) {
    return this.account.notifications(user.id);
  }

  @Post('notifications/read-all')
  @HttpCode(HttpStatus.OK)
  readAll(@CurrentUser() user: RequestUser) {
    return this.account.markAllRead(user.id);
  }

  @Post('notifications/:id/read')
  @HttpCode(HttpStatus.OK)
  read(@CurrentUser() user: RequestUser, @Param('id') id: string) {
    return this.account.markRead(user.id, id);
  }
}
