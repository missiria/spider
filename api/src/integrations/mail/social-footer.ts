import { SOCIAL_LINKS } from './social-links';

/**
 * Appends the MISSIRIA social profiles to a transactional mail (MISS-0126).
 *
 * Today every Spider mail is plain text, so the text footer is what customers see; the HTML
 * branch only runs when a caller passes `html`. Once the shared branded layout lands
 * (MISS-0121, `renderEmail` in ./layout.ts prints the same SOCIAL_LINKS), MailerService
 * should call that instead of this helper, otherwise the links would appear twice.
 */
export const SOCIAL_FOOTER_HEADING = 'MISSIRIA on social media';

export function socialFooterText(): string {
  return [
    SOCIAL_FOOTER_HEADING,
    ...SOCIAL_LINKS.map(({ label, href }) => `${label}: ${href}`),
  ].join('\n');
}

export function socialFooterHtml(): string {
  const links = SOCIAL_LINKS.map(
    ({ label, href }) => `<a href="${href}">${label}</a>`,
  ).join(' &middot; ');
  return `<p style="font-size:12px;line-height:1.6;color:#64748b">${SOCIAL_FOOTER_HEADING}: ${links}</p>`;
}

export function withSocialFooter(input: { text: string; html?: string }): {
  text: string;
  html?: string;
} {
  const text = `${input.text.replace(/\s+$/, '')}\n\n${socialFooterText()}\n`;
  if (!input.html) {
    return { text };
  }
  const footer = socialFooterHtml();
  const html = /<\/body>/i.test(input.html)
    ? input.html.replace(/<\/body>/i, `${footer}</body>`)
    : `${input.html}${footer}`;
  return { text, html };
}
