import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  NotFoundException,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { CurrentSession, CurrentUser } from 'src/common/decorators/current-user.decorator';
import { Public } from 'src/common/decorators/public.decorator';
import { RateLimit } from 'src/common/decorators/rate-limit.decorator';
import type { RequestSession, RequestUser } from 'src/common/types/request-user';
import { AuthService } from './auth.service';
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResendVerificationDto,
  ResetPasswordDto,
  SessionIdParam,
  VerifyEmailDto,
} from './dto/auth.dto';
import { SessionService } from './session.service';

/**
 * The authentication surface.
 *
 * Every handler that changes something goes through the global CSRF guard;
 * `@Public()` only lifts the requirement for a session, never the CSRF check —
 * login and password reset are exactly the endpoints a cross-site form would
 * like to submit on someone's behalf.
 *
 * No endpoint returns a token of any kind in its body. The session token
 * travels in a Set-Cookie header the browser app cannot read, and verification
 * and reset tokens only ever leave through email.
 */
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
  ) {}

  @Public()
  @Post('register')
  @RateLimit({ bucket: 'signup', keyFrom: 'ip+email' })
  @HttpCode(HttpStatus.ACCEPTED)
  register(@Body() dto: RegisterDto, @Req() request: Request) {
    return this.auth.register(dto, request);
  }

  @Public()
  @Post('login')
  @RateLimit({ bucket: 'login', keyFrom: 'ip+email' })
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const user = await this.auth.login(dto, request, response);
    return { authenticated: true, user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentSession() session: RequestSession,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logout(session.id, request, response);
    return { authenticated: false };
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser() user: RequestUser,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    await this.auth.logoutAll(user.id, request, response);
    return { authenticated: false };
  }

  /**
   * The call the browser app makes on startup.
   *
   * Public, because "nobody is signed in" is an answer rather than an error —
   * a 401 here would make the app treat a first visit as a failure and is the
   * usual source of redirect loops.
   */
  @Public()
  @Get('me')
  async me(@Req() request: Request) {
    if (!request.user) return { authenticated: false };

    return {
      authenticated: true,
      user: await this.auth.currentUser(request.user.id),
    };
  }

  @Public()
  @Post('verify-email')
  @RateLimit({ bucket: 'reset' })
  @HttpCode(HttpStatus.OK)
  verifyEmail(@Body() dto: VerifyEmailDto, @Req() request: Request) {
    return this.auth.verifyEmail(dto, request);
  }

  @Public()
  @Post('resend-verification')
  @RateLimit({ bucket: 'reset', keyFrom: 'ip+email' })
  @HttpCode(HttpStatus.ACCEPTED)
  resendVerification(@Body() dto: ResendVerificationDto, @Req() request: Request) {
    return this.auth.resendVerification(dto, request);
  }

  @Public()
  @Post('forgot-password')
  @RateLimit({ bucket: 'reset', keyFrom: 'ip+email' })
  @HttpCode(HttpStatus.ACCEPTED)
  forgotPassword(@Body() dto: ForgotPasswordDto, @Req() request: Request) {
    return this.auth.forgotPassword(dto, request);
  }

  @Public()
  @Post('reset-password')
  @RateLimit({ bucket: 'reset' })
  @HttpCode(HttpStatus.OK)
  resetPassword(@Body() dto: ResetPasswordDto, @Req() request: Request) {
    return this.auth.resetPassword(dto, request);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  changePassword(
    @CurrentUser() user: RequestUser,
    @Body() dto: ChangePasswordDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    return this.auth.changePassword(user, dto, request, response);
  }

  /** The "signed-in devices" screen. */
  @Get('sessions')
  async listSessions(@CurrentUser() user: RequestUser, @CurrentSession() current: RequestSession) {
    const sessions = await this.sessions.listActive(user.id);

    return sessions.map((session) => ({
      id: session.id,
      current: session.id === current.id,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      createdAt: session.createdAt,
      lastUsedAt: session.lastUsedAt,
      expiresAt: session.expiresAt,
    }));
  }

  /**
   * Revokes one session. Scoped to the caller's own sessions — without the
   * ownership check this would let any signed-in user sign out any other by
   * guessing an id.
   */
  @Delete('sessions/:id')
  @HttpCode(HttpStatus.OK)
  async revokeSession(
    @Param() params: SessionIdParam,
    @CurrentUser() user: RequestUser,
    @CurrentSession() current: RequestSession,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const owned = await this.sessions.listActive(user.id);
    if (!owned.some((session) => session.id === params.id)) {
      throw new NotFoundException('Session not found');
    }

    await this.sessions.revoke(params.id, request);

    // Revoking the session you are sitting on is a logout.
    if (params.id === current.id) this.sessions.clearCookies(response);

    return { revoked: params.id, authenticated: params.id !== current.id };
  }
}
