import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { EmailBrand } from './mail/email-brand.entity';
import { EmailBrandService } from './mail/email-brand.service';
import { renderEmail } from './mail/layout';

export interface MailAttachment {
  filename: string;
  content: Buffer | string;
  contentType: string;
}

/**
 * SMTP via SMTP_* env (same keys as shark-app). Without SMTP_HOST, mails are not sent:
 * `send()` returns { skipped: true } so callers can record "skipped" instead of failing.
 */
@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private transport: nodemailer.Transporter | null = null;
  private readonly configured: boolean;
  private readonly from: string;
  private readonly linkOrigin: string;

  constructor(
    private readonly config: ConfigService,
    private readonly brands: EmailBrandService,
  ) {
    this.linkOrigin = MailerService.originOf(
      config.get<string>('APP_PUBLIC_URL') ?? '',
    );
    const host = config.get<string>('SMTP_HOST') ?? '';
    this.configured = Boolean(host && host !== 'localhost');
    const fromName = config.get<string>('MAIL_FROM_NAME') ?? 'Spider';
    const fromEmail = config.get<string>('MAIL_FROM') ?? 'no-reply@example.com';
    this.from = `"${fromName.replace(/"/g, '')}" <${fromEmail}>`;
    if (this.configured) {
      this.transport = nodemailer.createTransport({
        host,
        port: Number.parseInt(config.get<string>('SMTP_PORT') ?? '587', 10),
        secure: (config.get<string>('SMTP_SECURE') ?? 'false') === 'true',
        requireTLS: (config.get<string>('SMTP_STARTTLS') ?? 'true') === 'true',
        auth: config.get<string>('SMTP_USER')
          ? {
              user: config.get<string>('SMTP_USER'),
              pass: config.get<string>('SMTP_PASS'),
            }
          : undefined,
        // certificate verification stays ON unless explicitly disabled for local relays
        tls: {
          rejectUnauthorized:
            (config.get<string>('SMTP_REJECT_UNAUTHORIZED') ?? 'true') !==
            'false',
        },
        name: config.get<string>('SMTP_EHLO_DOMAIN') || undefined,
      });
    } else {
      this.logger.warn(
        'SMTP_HOST not configured: emails are recorded as skipped',
      );
    }
  }

  isConfigured(): boolean {
    return this.configured;
  }

  async send(
    input: {
      to: string[];
      subject: string;
      text: string;
      attachments?: MailAttachment[];
    },
    previewBrand?: EmailBrand,
  ): Promise<{ skipped: boolean; messageId?: string }> {
    if (!this.transport) {
      return { skipped: true };
    }
    // One branded shell for every mail (MISS-0121). Its footer carries the MISSIRIA social
    // profiles (MISS-0126), so no separate social footer is appended here.
    const rendered = renderEmail(
      previewBrand ?? (await this.brands.published()),
      input.subject,
      input.text,
      this.linkOrigin,
    );
    const info = await this.transport.sendMail({
      from: this.from,
      to: input.to.join(', '),
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
      attachments: input.attachments,
    });
    return { skipped: false, messageId: info.messageId };
  }

  private static originOf(value: string): string {
    try {
      return new URL(value).origin;
    } catch {
      return '';
    }
  }
}
