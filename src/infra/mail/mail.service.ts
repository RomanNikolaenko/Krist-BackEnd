import { Injectable } from '@nestjs/common';
import { AppConfigService } from 'src/config/app-config.service';
import { MailTransport } from './mail.types';

/**
 * The messages the auth flows send. Copy lives here rather than in the
 * services, so wording changes never touch security code.
 *
 * Links point at the frontend, not the API: the browser app owns the screens
 * that then call the verification and reset endpoints.
 */
@Injectable()
export class MailService {
  constructor(
    private readonly transport: MailTransport,
    private readonly config: AppConfigService,
  ) {}

  async sendEmailVerification(to: string, token: string): Promise<void> {
    const link = `${this.config.frontendUrl}/verify-email?token=${encodeURIComponent(token)}`;
    const hours = Math.round(this.config.emailVerificationTtl / 3600);

    await this.transport.send({
      to,
      subject: 'Confirm your Krist account',
      text: [
        'Welcome to Krist.',
        '',
        'Confirm this address to finish setting up your account:',
        link,
        '',
        `The link is good for ${hours} hour${hours === 1 ? '' : 's'} and can be used once.`,
        'If you did not create an account, you can ignore this message.',
      ].join('\n'),
    });
  }

  /**
   * A customer's message, forwarded to the shop.
   *
   * `replyTo` rather than `from`: sending as the customer would be a forgery
   * that most receiving servers reject outright, so it goes out as the shop and
   * answering it goes to them.
   */
  async sendContactMessage(message: {
    name: string;
    email: string;
    subject: string;
    body: string;
  }): Promise<void> {
    await this.transport.send({
      to: this.config.mail.inbox,
      replyTo: message.email,
      subject: `Krist contact: ${message.subject}`,
      text: [`From: ${message.name} <${message.email}>`, '', message.body].join('\n'),
    });
  }

  async sendPasswordReset(to: string, token: string): Promise<void> {
    const link = `${this.config.frontendUrl}/reset-password?token=${encodeURIComponent(token)}`;
    const minutes = Math.round(this.config.passwordResetTtl / 60);

    await this.transport.send({
      to,
      subject: 'Reset your Krist password',
      text: [
        'Someone asked to reset the password on this address.',
        '',
        link,
        '',
        `The link is good for ${minutes} minutes and can be used once.`,
        'If it was not you, nothing has changed and you can ignore this message.',
      ].join('\n'),
    });
  }

  async sendPasswordChanged(to: string): Promise<void> {
    await this.transport.send({
      to,
      subject: 'Your Krist password was changed',
      text: [
        'The password on your Krist account has just been changed.',
        '',
        'Every other signed-in device has been signed out.',
        'If this was not you, reset your password immediately.',
      ].join('\n'),
    });
  }
}
