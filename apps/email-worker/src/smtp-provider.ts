import nodemailer, { type Transporter } from 'nodemailer';
import type { EmailProviderPort, EmailProviderSendInput, EmailProviderSendResult } from './runtime';

export interface SmtpEmailProviderOptions {
  readonly host: string;
  readonly port: number;
  readonly secure: boolean;
  readonly user?: string | null;
  readonly password?: string | null;
  readonly from: string;
  readonly providerEvidence?: 'gmail' | 'outlook' | 'other';
  readonly connectionTimeoutMs?: number;
}

export class SmtpEmailProvider implements EmailProviderPort {
  readonly from: string;
  readonly providerEvidence: 'gmail' | 'outlook' | 'other';
  private readonly transporter: Transporter;

  constructor(options: SmtpEmailProviderOptions) {
    this.from = options.from;
    this.providerEvidence = options.providerEvidence ?? 'other';
    const auth = options.user && options.password ? { user: options.user, pass: options.password } : undefined;
    this.transporter = nodemailer.createTransport({
      host: options.host,
      port: options.port,
      secure: options.secure,
      ...(auth ? { auth } : {}),
      connectionTimeout: options.connectionTimeoutMs ?? 15_000,
      greetingTimeout: options.connectionTimeoutMs ?? 15_000,
      socketTimeout: 60_000,
    });
  }

  async verify(): Promise<void> {
    await this.transporter.verify();
  }

  async send(input: EmailProviderSendInput): Promise<EmailProviderSendResult> {
    const info = await this.transporter.sendMail({
      from: input.from,
      to: input.to,
      subject: input.subject,
      text: input.text,
      attachments: [{ filename: input.attachment.fileName, content: Buffer.from(input.attachment.bytes), contentType: input.attachment.mimeType }],
    });
    return {
      messageId: String(info.messageId ?? ''),
      accepted: Array.isArray(info.accepted) ? info.accepted.map(String) : [],
      rejected: Array.isArray(info.rejected) ? info.rejected.map(String) : [],
    };
  }
}
