import { EMAIL_SAMPLES, renderEmail, safeUrl } from './layout';
import { EmailBrand } from './email-brand.entity';
import { SOCIAL_LINKS } from './social-links';
const brand: EmailBrand = {
  name: 'Spider',
  logoUrl: 'https://example.com/logo.png',
  accentColor: '#4f46e5',
  company: 'MISSIRIA',
  footer: 'Account notification',
  websiteUrl: 'https://example.com',
  supportEmail: 'support@example.com',
};

describe('shared email layout', () => {
  it.each(Object.entries(EMAIL_SAMPLES))(
    'renders %s through the same identity and footer',
    (_key, sample) => {
      const result = renderEmail(brand, sample.subject, sample.text);
      expect(result.html).toContain('https://example.com/logo.png');
      expect(result.html).toContain('Account notification');
      expect(result.html).toContain('MISSIRIA');
      expect(result.text).toContain(sample.text);
      expect(result.text).toContain(brand.footer);
      expect(result.html).not.toContain('style=');
      for (const { label, href } of SOCIAL_LINKS) {
        expect(result.html).toContain(`<a href="${href}">${label}</a>`);
        expect(result.text).toContain(`${label}: ${href}`);
        // printed once: the mailer no longer appends a second social footer
        expect(result.html.split(href)).toHaveLength(2);
        expect(result.text.split(href)).toHaveLength(2);
      }
    },
  );
  it('escapes <script> in signup name, company and operator payload', () => {
    const evil = '<script>alert(1)</script>';
    const result = renderEmail(
      { ...brand, company: evil, name: evil },
      `New account request from ${evil}`,
      `Name: ${evil}\nEmail: a@example.com\nCompany: ${evil}\n\nHi ${evil},\n\nPayload ${evil} https://example.com/x-dashboard`,
    );
    expect(result.html).not.toMatch(/<script/i);
    expect(result.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(result.html).toContain(
      '<th align="left">Company</th><td>&lt;script&gt;',
    );
    // the text alternative is plain text, so it keeps the literal characters
    expect(result.text).toContain(`Hi ${evil},`);
  });
  it('escapes all content and rejects executable URL/CSS values', () => {
    const result = renderEmail(
      {
        ...brand,
        name: '<script>alert(1)</script>',
        footer: '<img onerror="alert(1)">',
        logoUrl: 'javascript:alert(1)',
        accentColor: 'red;}body{display:none',
      },
      '<b>Subject</b>',
      '<script>alert(1)</script>\n\njavascript:alert(1)',
    );
    expect(result.html).not.toContain('<script>');
    expect(result.html).not.toContain('<img');
    expect(result.html).not.toContain('display:none');
    expect(result.html).toContain('&lt;b&gt;Subject&lt;/b&gt;');
    expect(result.html).not.toContain('href="javascript:');
  });
  it('preserves token-bearing links and provides a CTA and text fallback', () => {
    const link = 'https://example.com/reset-password?token=secret&next=account';
    const result = renderEmail(brand, 'Reset', link);
    expect(result.html).toContain(
      'href="https://example.com/reset-password?token=secret&amp;next=account"',
    );
    expect(result.html).toContain('Reset password');
    expect(result.text).toContain(link);
  });
  it('renders report facts as escaped table cells', () => {
    const result = renderEmail(
      brand,
      'Report',
      'Clicks: 42\nCompany: <b>test</b>',
    );
    expect(result.html).toContain('<th align="left">Clicks</th><td>42</td>');
    expect(result.html).toContain('&lt;b&gt;test&lt;/b&gt;');
  });
  it('rejects unsafe and credential-bearing asset links', () => {
    for (const url of [
      'javascript:alert(1)',
      'data:image/svg+xml,test',
      'http://example.com',
      'https://user:password@example.com',
    ])
      expect(safeUrl(url)).toBe('');
  });
});
