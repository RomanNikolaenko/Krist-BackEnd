import { Global, Module } from '@nestjs/common';
import { AppConfigService } from 'src/config/app-config.service';
import { LogMailTransport } from './log.transport';
import { MailService } from './mail.service';
import { MailTransport } from './mail.types';
import { SmtpMailTransport } from './smtp.transport';

/**
 * Picks the transport from configuration at boot. The rest of the app depends
 * on the abstract MailTransport and never learns which one it got.
 */
@Global()
@Module({
  providers: [
    {
      provide: MailTransport,
      inject: [AppConfigService],
      useFactory: (config: AppConfigService): MailTransport =>
        config.mail.transport === 'smtp' ? new SmtpMailTransport(config) : new LogMailTransport(),
    },
    MailService,
  ],
  exports: [MailService],
})
export class MailModule {}
