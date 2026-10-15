import { Logger } from '@nestjs/common';

const PLACEHOLDERS = [
  '',
  'change-me',
  'replace-with-a-long-random-secret',
  'replace-with-a-strong-password',
  'default_dev_secret',
  'admin12345',
];

/**
 * Refuse to start in production with placeholder secrets. In development only warn.
 * Exported for unit tests; throws with every problem listed at once.
 */
export function assertProductionConfig(
  env: NodeJS.ProcessEnv,
  logger: Pick<Logger, 'warn' | 'error'>,
): void {
  const problems: string[] = [];
  const secret = env.JWT_SECRET ?? '';
  if (PLACEHOLDERS.includes(secret) || secret.length < 32) {
    problems.push(
      'JWT_SECRET must be a random string of at least 32 characters',
    );
  }
  if (PLACEHOLDERS.includes(env.ADMIN_PASSWORD ?? '')) {
    problems.push('ADMIN_PASSWORD must not be a placeholder');
  }
  if ((env.GSC_MOCK ?? '0') === '1') {
    problems.push('GSC_MOCK=1 serves fixtures, not Google data');
  }
  if (!(env.CORS_ORIGINS ?? '').trim()) {
    problems.push('CORS_ORIGINS must list the web origin(s)');
  }
  if (!problems.length) return;
  if (env.NODE_ENV === 'production') {
    for (const p of problems) logger.error(`production config: ${p}`);
    throw new Error(`Refusing to start in production: ${problems.join('; ')}`);
  }
  for (const p of problems) logger.warn(`dev config: ${p}`);
}
