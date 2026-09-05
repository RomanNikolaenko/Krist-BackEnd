import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import { AppConfigService } from 'src/config/app-config.service';
import { MailMessage, MailTransport } from './mail.types';

/** Real delivery. Selected with MAIL_TRANSPORT=smtp. */
@Injectable()
export class SmtpMailTransport extends MailTransport {
  private readonly logger = new Logger('Mail');
  private readonly transporter: Transporter;
  private readonly from: string;

  constructor(config: AppConfigService) {
    super();
    const { smtp, from } = config.mail;
    this.from = from;
    this.transporter = createTransport({
      host: smtp.host,
      port: smtp.port ?? 587,
      secure: smtp.secure,
      auth: smtp.user ? { user: smtp.user, pass: smtp.password } : undefined,
    });
  }

  async send(message: MailMessage): Promise<void> {
    try {
      await this.transporter.sendMail({ from: this.from, ...message });
    } catch (error) {
      // Registration should not fail because the mail server is having a bad
      // day; the user can ask for another verification mail.
      this.logger.error(`Delivery to ${message.to} failed: ${(error as Error).message}`);
    }
  }
}
