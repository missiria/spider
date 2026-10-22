import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { MailerService } from '../mailer.service';
import { EmailBrandService } from './email-brand.service';

describe('mailer branding boundary', () => {
  const brand = {
    name: 'Published brand',
    logoUrl: 'https://example.com/logo.png',
    accentColor: '#112233',
    company: 'Company',
    footer: 'Shared published footer',
    websiteUrl: 'https://example.com',
    supportEmail: 'help@example.com',
  };
  const published = jest.fn().mockResolvedValue(brand);
  const brands = { published } as unknown as EmailBrandService;
  afterEach(() => jest.restoreAllMocks());
  it('adds the shared layout to every delivery and preserves attachments', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'id' });
    jest
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue({ sendMail } as unknown as nodemailer.Transporter);
    const mailer = new MailerService(
      new ConfigService({
        SMTP_HOST: 'smtp.example.com',
        MAIL_FROM: 'sender@example.com',
      }),
      brands,
    );
    const attachments = [
      {
        filename: 'report.csv',
        content: 'clicks\n42',
        contentType: 'text/csv',
      },
    ];
    await mailer.send({
      to: ['user@example.com'],
      subject: 'Report',
      text: 'Clicks: 42',
      attachments,
    });
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('Shared published footer'),
        text: expect.stringContaining('Clicks: 42'),
        attachments,
      }),
    );
    const sent = sendMail.mock.calls[0][0] as { html: string; text: string };
    // social profiles come from the layout footer only (MISS-0126 + MISS-0121)
    for (const body of [sent.html, sent.text]) {
      expect(body.split('MISSIRIA on social media')).toHaveLength(2);
    }
  });
  it('keeps draft test branding separate from the published brand', async () => {
    const sendMail = jest.fn().mockResolvedValue({ messageId: 'test' });
    jest
      .spyOn(nodemailer, 'createTransport')
      .mockReturnValue({ sendMail } as unknown as nodemailer.Transporter);
    const mailer = new MailerService(
      new ConfigService({ SMTP_HOST: 'smtp.example.com' }),
      brands,
    );
    await mailer.send(
      { to: ['admin@example.com'], subject: 'Test', text: 'Preview' },
      { ...brand, footer: 'Unpublished preview' },
    );
    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        html: expect.stringContaining('Unpublished preview'),
      }),
    );
  });
  it('reports skipped delivery when SMTP is unavailable', async () => {
    const mailer = new MailerService(new ConfigService({}), brands);
    await expect(
      mailer.send({ to: ['user@example.com'], subject: 'Test', text: 'Test' }),
    ).resolves.toEqual({ skipped: true });
  });
});
