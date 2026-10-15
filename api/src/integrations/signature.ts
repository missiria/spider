import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Webhook signing (docs/WEBHOOKS.md): `X-Spider-Signature: t=<unix seconds>,v1=<hex>`
 * where v1 = HMAC-SHA256(secret, `${t}.${rawBody}`). Receivers reject stale timestamps.
 */
export function signPayload(
  secret: string,
  rawBody: string,
  timestamp = Math.floor(Date.now() / 1000),
): string {
  const v1 = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  return `t=${timestamp},v1=${v1}`;
}

export function verifySignature(
  secret: string,
  rawBody: string,
  header: string,
  toleranceSeconds = 300,
  now = Math.floor(Date.now() / 1000),
): boolean {
  const parts = Object.fromEntries(
    header.split(',').map((kv) => kv.split('=') as [string, string]),
  );
  const t = Number(parts.t);
  const v1 = parts.v1 ?? '';
  if (
    !Number.isFinite(t) ||
    Math.abs(now - t) > toleranceSeconds ||
    !/^[0-9a-f]{64}$/.test(v1)
  )
    return false;
  const expected = createHmac('sha256', secret)
    .update(`${t}.${rawBody}`)
    .digest('hex');
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(v1, 'hex'));
}

export function newSecret(): string {
  return `whsec_${randomBytes(24).toString('base64url')}`;
}
