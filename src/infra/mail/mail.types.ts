export interface MailMessage {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  readonly html?: string;
}

/**
 * The seam between "the app wants to send something" and "something goes out
 * over the wire". Swapping the transport is a configuration change, not a code
 * change, and the auth flows never learn which one is in use.
 */
export abstract class MailTransport {
  abstract send(message: MailMessage): Promise<void>;
}
