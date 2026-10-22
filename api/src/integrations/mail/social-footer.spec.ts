import { SOCIAL_LINKS } from './social-links';
import {
  SOCIAL_FOOTER_HEADING,
  socialFooterHtml,
  socialFooterText,
} from './social-footer';
import { escapeHtml } from './layout';

describe('social footer', () => {
  it('lists every official profile as plain text', () => {
    const text = socialFooterText();
    expect(text.startsWith(`${SOCIAL_FOOTER_HEADING}\n`)).toBe(true);
    for (const { label, href } of SOCIAL_LINKS) {
      expect(text).toContain(`${label}: ${href}`);
    }
    expect(text).toContain('https://www.instagram.com/missiria.devi');
  });

  it('renders an escaped, class-styled HTML fragment', () => {
    const html = socialFooterHtml(escapeHtml);
    expect(html).not.toContain('style=');
    for (const { label, href } of SOCIAL_LINKS) {
      expect(html).toContain(`<a href="${href}">${label}</a>`);
    }
  });
});
