import { newSecret, signPayload, verifySignature } from './signature';

describe('webhook signature', () => {
  const secret = 'whsec_test';
  const body = JSON.stringify({ event: 'test', data: { hello: 'world' } });

  it('signs and verifies', () => {
    const sig = signPayload(secret, body, 1_760_000_000);
    expect(sig).toMatch(/^t=1760000000,v1=[0-9a-f]{64}$/);
    expect(verifySignature(secret, body, sig, 300, 1_760_000_100)).toBe(true);
  });

  it('rejects a tampered body, wrong secret or stale timestamp', () => {
    const sig = signPayload(secret, body, 1_760_000_000);
    expect(verifySignature(secret, body + ' ', sig, 300, 1_760_000_100)).toBe(
      false,
    );
    expect(verifySignature('other', body, sig, 300, 1_760_000_100)).toBe(false);
    expect(verifySignature(secret, body, sig, 300, 1_760_001_000)).toBe(false);
    expect(verifySignature(secret, body, 'garbage', 300, 1_760_000_100)).toBe(
      false,
    );
  });

  it('generates distinct secrets with a recognisable prefix', () => {
    const a = newSecret();
    expect(a.startsWith('whsec_')).toBe(true);
    expect(a).not.toBe(newSecret());
  });
});
