import { SOCIAL_LINKS } from './social-links';
import { withSocialFooter } from './social-footer';

describe('withSocialFooter', () => {
  it('lists every official profile at the end of a plain-text mail', () => {
    const { text, html } = withSocialFooter({
      text: 'Hello\n\nYour link: https://x.test/a\n',
    });
    expect(html).toBeUndefined();
    expect(
      text.startsWith(
        'Hello\n\nYour link: https://x.test/a\n\nMISSIRIA on social media\n',
      ),
    ).toBe(true);
    for (const { label, href } of SOCIAL_LINKS) {
      expect(text).toContain(`${label}: ${href}`);
    }
    expect(text).toContain('https://www.instagram.com/missiria.devi');
  });

  it('injects the links before </body> in an HTML mail, or appends them', () => {
    const inBody = withSocialFooter({
      text: 't',
      html: '<html><body><p>Hi</p></body></html>',
    });
    expect(inBody.html).toMatch(
      /<p>Hi<\/p><p[^>]*>MISSIRIA on social media: .*<\/p><\/body>/,
    );
    const fragment = withSocialFooter({ text: 't', html: '<p>Hi</p>' });
    expect(fragment.html?.startsWith('<p>Hi</p><p')).toBe(true);
    for (const { label, href } of SOCIAL_LINKS) {
      expect(inBody.html).toContain(`<a href="${href}">${label}</a>`);
      expect(fragment.html).toContain(`<a href="${href}">${label}</a>`);
    }
  });
});
