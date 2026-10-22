import { SOCIAL_LINKS } from './social-links';

/**
 * MISSIRIA social profiles printed in the footer of every transactional mail (MISS-0126).
 *
 * The shared branded layout (`renderEmail` in ./layout.ts, MISS-0121) is the only caller:
 * MailerService no longer appends a separate footer, so the links print exactly once.
 */
export const SOCIAL_FOOTER_HEADING = 'MISSIRIA on social media';

export function socialFooterText(): string {
  return [
    SOCIAL_FOOTER_HEADING,
    ...SOCIAL_LINKS.map(({ label, href }) => `${label}: ${href}`),
  ].join('\n');
}

/** Class-styled fragment for the layout footer; `escape` is the layout's HTML escaper. */
export function socialFooterHtml(escape: (value: string) => string): string {
  const links = SOCIAL_LINKS.map(
    ({ label, href }) => `<a href="${escape(href)}">${escape(label)}</a>`,
  ).join(' &middot; ');
  return `<p class="social">${escape(SOCIAL_FOOTER_HEADING)}: ${links}</p>`;
}
