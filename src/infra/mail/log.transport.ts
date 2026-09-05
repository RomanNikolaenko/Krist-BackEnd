import { Injectable, Logger } from '@nestjs/common';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MailMessage, MailTransport } from './mail.types';

/**
 * Development transport: prints the message and drops a copy in tmp/mail.
 *
 * It exists so the verification and reset flows can be walked end to end
 * without an SMTP account — the link is in the log, ready to paste.
 */
@Injectable()
export class LogMailTransport extends MailTransport {
  private readonly logger = new Logger('Mail');
  private readonly dir = join(process.cwd(), 'tmp', 'mail');

  async send(message: MailMessage): Promise<void> {
    this.logger.log(`To: ${message.to} — ${message.subject}\n${message.text}`);

    try {
      await mkdir(this.dir, { recursive: true });
      const name = `${Date.now()}-${message.to.replace(/[^a-z0-9]/gi, '_')}.txt`;
      await writeFile(
        join(this.dir, name),
        `To: ${message.to}\nSubject: ${message.subject}\n\n${message.text}\n`,
        'utf8',
      );
    } catch (error) {
      // A dev-only convenience must never break the request that triggered it.
      this.logger.warn(`Could not write the mail copy: ${(error as Error).message}`);
    }
  }
}
