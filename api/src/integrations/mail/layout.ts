import { EmailBrand } from './email-brand.entity';
import { socialFooterHtml, socialFooterText } from './social-footer';

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ]!,
  );
}

export function safeUrl(value: string): string {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : '';
  } catch {
    return '';
  }
}

/**
 * All mail bodies are plain structured data, never user-authored HTML. Only links to
 * `linkOrigin` (the app's own APP_PUBLIC_URL origin) become buttons or anchors: a URL typed by a
 * user (signup name, company, alert payload) stays plain escaped text, so it cannot pose as a
 * branded call to action.
 */
export function renderEmail(
  brand: EmailBrand,
  subject: string,
  text: string,
  linkOrigin = '',
) {
  const e = escapeHtml;
  const accent = /^#[0-9a-f]{6}$/i.test(brand.accentColor)
    ? brand.accentColor
    : '#4f46e5';
  const logo = safeUrl(brand.logoUrl);
  const website = safeUrl(brand.websiteUrl);
  const ownUrl = (value: string): string => {
    const url = safeUrl(value);
    return url && linkOrigin && new URL(url).origin === linkOrigin ? url : '';
  };
  const body = text
    .split(/\n\s*\n/)
    .map((paragraph) => {
      // Link only HTTPS URLs, preserving the exact token-bearing destination.
      const standalone = ownUrl(paragraph.trim());
      if (standalone) {
        const path = new URL(standalone).pathname;
        const label = path.includes('verify-email')
          ? 'Confirm email'
          : path.includes('reset-password')
            ? 'Reset password'
            : path.includes('login')
              ? 'Sign in'
              : path.includes('report')
                ? 'View report'
                : 'Open dashboard';
        return `<p><a class="button" href="${e(standalone)}">${label}</a></p><p class="fallback">${e(standalone)}</p>`;
      }
      const lines = paragraph.split('\n');
      if (
        lines.length > 1 &&
        lines.every((line) => /^[^:]{1,60}:\s/.test(line))
      ) {
        return `<table role="presentation" class="facts" width="100%">${lines
          .map((line) => {
            const split = line.indexOf(':');
            return `<tr><th align="left">${e(line.slice(0, split))}</th><td>${e(line.slice(split + 1).trim())}</td></tr>`;
          })
          .join('')}</table>`;
      }
      const content = paragraph
        .split(/(https:\/\/[^\s<>]+)/g)
        .map((part) => {
          const url = ownUrl(part);
          return url
            ? `<a href="${e(url)}">${e(part)}</a>`
            : e(part).replace(/\n/g, '<br>');
        })
        .join('');
      return `<p>${content}</p>`;
    })
    .join('');
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${e(subject)}</title><style>
body{margin:0;background:#f8fafc;color:#0f172a;font-family:Arial,Helvetica,sans-serif}table{border-collapse:collapse} .shell{width:100%;max-width:600px} .outer{padding:24px 12px}.header{padding:24px;background:#fff;border-bottom:3px solid ${accent}}.content{padding:28px 24px;background:#fff}h1{font-size:24px;line-height:1.3;margin:0 0 24px}p{font-size:16px;line-height:1.65;margin:0 0 20px;overflow-wrap:anywhere}a{color:${accent};word-break:break-word}.button{display:inline-block;background:${accent};color:#fff;text-decoration:none;padding:12px 20px;border-radius:6px}.fallback{font-size:12px;color:#64748b}.facts{margin-bottom:20px}.facts th,.facts td{padding:10px;border-bottom:1px solid #e2e8f0;font-size:14px;vertical-align:top}.footer{padding:24px;font-size:12px;line-height:1.6;color:#64748b}.logo{max-width:180px;max-height:64px;width:auto;height:auto;display:block}.brand{font-size:20px;font-weight:bold}.footer p{font-size:12px;margin:0 0 8px}.footer .social{margin-top:12px}@media(max-width:400px){.content,.header,.footer{padding:20px 16px}h1{font-size:22px}}
</style></head><body><table role="presentation" width="100%"><tr><td class="outer" align="center"><table role="presentation" class="shell" width="600"><tr><td class="header">${logo ? `<img class="logo" src="${e(logo)}" alt="${e(brand.name)}" width="180">` : `<span class="brand">${e(brand.name)}</span>`}</td></tr><tr><td class="content"><h1>${e(subject)}</h1>${body}</td></tr><tr><td class="footer"><p>${e(brand.footer)}</p><p>${e(brand.company)}</p>${website ? `<p><a href="${e(website)}">${e(brand.name)}</a></p>` : ''}${brand.supportEmail ? `<p>Support: ${e(brand.supportEmail)}</p>` : ''}${socialFooterHtml(e)}</td></tr></table></td></tr></table></body></html>`;
  return {
    subject,
    html,
    text: [
      text.replace(/\s+$/, ''),
      [brand.footer, brand.company, brand.supportEmail, website]
        .filter(Boolean)
        .join('\n'),
      socialFooterText(),
    ]
      .filter(Boolean)
      .join('\n\n'),
  };
}

/** Origin of the links in EMAIL_SAMPLES (previews only). */
export const SAMPLE_LINK_ORIGIN = 'https://example.com';

export const EMAIL_SAMPLES = {
  confirmation: {
    subject: 'Confirm your email',
    text: 'Hi Alex,\n\nConfirm your email to complete your account request. This link expires in 24 hours.\n\nhttps://example.com/verify-email?token=preview\n\nAfter you confirm, an admin approves your account (usually within one business day). We will email you once you can sign in.',
  },
  approved: {
    subject: 'Your account is ready',
    text: 'Hi Alex,\n\nYour account has been approved. Sign in with the email and password you chose.\n\nhttps://example.com/login',
  },
  rejected: {
    subject: 'Your account request',
    text: 'Hi Alex,\n\nWe are unable to approve your account request. Contact support if you have questions.',
  },
  created: {
    subject: 'Welcome to your workspace',
    text: 'Hi Alex,\n\nAn administrator has created your workspace. Follow your secure invitation to get started.\n\nhttps://example.com/login',
  },
  reset: {
    subject: 'Reset your password',
    text: 'Hi Alex,\n\nChoose a new password using the link below. It expires in 30 minutes and can be used once.\n\nhttps://example.com/reset-password?token=preview\n\nIf you did not request this, ignore this email.',
  },
  operator: {
    subject: 'New account request',
    text: 'Name: Alex\nEmail: alex@example.com\nCompany: Example\n\nReview this request in the operator console.\n\nhttps://example.com/x-dashboard',
  },
  alert: {
    subject: 'Search performance alert',
    text: 'Property: example.com\nRule: Clicks dropped\nChange: -20%\n\nReview your opportunities.\n\nhttps://example.com/opportunities',
  },
  report: {
    subject: 'Your performance report',
    text: 'Period: Last 28 days\nClicks: 12,480\nImpressions: 204,300\n\nYour PDF and CSV reports are attached.\n\nhttps://example.com/reports',
  },
} as const;
