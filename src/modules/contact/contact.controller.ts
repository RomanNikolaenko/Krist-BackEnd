import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { Public } from 'src/common/decorators/public.decorator';
import { RateLimit } from 'src/common/decorators/rate-limit.decorator';
import { ContactService } from './contact.service';
import { ContactMessageDto, SubscribeDto } from './dto/contact.dto';

/**
 * Open to anybody, which is the whole point of a contact form — and the reason
 * both routes are rate limited by address and by IP. Their own budget rather
 * than the password-reset one: a shop that spends its resets on contact
 * messages locks people out of their accounts.
 */
@Controller()
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  @Public()
  @Post('contact')
  @RateLimit({ bucket: 'contact', keyFrom: 'ip+email' })
  @HttpCode(HttpStatus.ACCEPTED)
  send(@Body() dto: ContactMessageDto) {
    return this.contact.send(dto);
  }

  @Public()
  @Post('newsletter')
  @RateLimit({ bucket: 'contact', keyFrom: 'ip+email' })
  @HttpCode(HttpStatus.ACCEPTED)
  subscribe(@Body() dto: SubscribeDto) {
    return this.contact.subscribe(dto);
  }
}
