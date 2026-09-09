import { Injectable, Logger } from '@nestjs/common';
import { firstFilled } from 'src/common/utils/text.util';
import { MailService } from 'src/infra/mail/mail.service';
import { PrismaService } from 'src/infra/prisma/prisma.service';
import { ContactMessageDto, SubscribeDto } from './dto/contact.dto';

/**
 * The two things a visitor can send the shop without an account.
 *
 * Both used to be theatre on the front end: the contact form announced that the
 * message had been sent and sent nothing, and the newsletter box did not even
 * do that — it cancelled its own submit.
 */
@Injectable()
export class ContactService {
  private readonly logger = new Logger('Contact');

  constructor(
    private readonly mail: MailService,
    private readonly prisma: PrismaService,
  ) {}

  async send(dto: ContactMessageDto): Promise<{ message: string }> {
    await this.mail.sendContactMessage({
      name: dto.name,
      email: dto.email,
      subject: firstFilled(dto.subject?.trim(), 'No subject'),
      body: dto.message,
    });

    return { message: 'Thanks — we will be in touch' };
  }

  /**
   * Keeps an address on the list.
   *
   * Idempotent on purpose: subscribing twice is somebody who forgot they had,
   * and an error would be a strange way to tell them they are already on it.
   */
  async subscribe(dto: SubscribeDto): Promise<{ message: string }> {
    const email = dto.email.trim().toLowerCase();

    await this.prisma.newsletterSubscriber.upsert({
      where: { email },
      update: {},
      create: { email },
    });

    this.logger.log(`Subscribed ${email}`);

    return { message: 'You are on the list' };
  }
}
