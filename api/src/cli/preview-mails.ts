/** Offline previews: no database or SMTP needed. */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EMAIL_SAMPLES, renderEmail } from '../integrations/mail/layout';
const output = resolve('tmp/mail-preview');
mkdirSync(output, { recursive: true });
for (const [name, sample] of Object.entries(EMAIL_SAMPLES)) {
  const rendered = renderEmail(
    {
      name: 'Spider',
      logoUrl: '',
      accentColor: '#4f46e5',
      supportEmail: 'support@example.com',
      company: 'Spider by MISSIRIA',
      footer:
        'You received this email because of your Spider account or account request.',
      websiteUrl: 'https://example.com',
    },
    sample.subject,
    sample.text,
  );
  writeFileSync(resolve(output, `${name}.html`), rendered.html);
  writeFileSync(resolve(output, `${name}.txt`), rendered.text);
}
console.log(`Email previews written to ${output}`);
