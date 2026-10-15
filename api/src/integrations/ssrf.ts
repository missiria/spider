import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Outbound-request guard for webhooks: a hostname is acceptable only if EVERY address it
 * resolves to is public. Blocks loopback, RFC 1918, link-local, CGNAT, unspecified,
 * multicast, IPv6 ULA / link-local and IPv4-mapped IPv6. Used at creation and again at
 * delivery, where the validated address is pinned for the connection (DNS rebinding).
 */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) return isPrivateV4(ip);
  if (v === 6) {
    const lower = ip.toLowerCase();
    if (lower === '::' || lower === '::1') return true;
    if (
      lower.startsWith('fe8') ||
      lower.startsWith('fe9') ||
      lower.startsWith('fea') ||
      lower.startsWith('feb')
    )
      return true; // link-local fe80::/10
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // ULA fc00::/7
    if (lower.startsWith('ff')) return true; // multicast
    const mapped = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isPrivateV4(mapped[1]);
    return false;
  }
  return true; // not an IP literal → treat as unsafe
}

function isPrivateV4(ip: string): boolean {
  const p = ip.split('.').map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255))
    return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && b === 254) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0 && p[2] === 0) return true; // 192.0.0.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a >= 224) return true; // multicast + reserved
  return false;
}

export interface ResolvedTarget {
  address: string;
  family: 4 | 6;
}

/**
 * Resolve `hostname` and return one public address to connect to, or throw listing the
 * offending address. `allowPrivate` is for local development only.
 */
export async function resolvePublicAddress(
  hostname: string,
  allowPrivate = false,
): Promise<ResolvedTarget> {
  const literal = isIP(hostname);
  const addresses = literal
    ? [{ address: hostname, family: literal as 4 | 6 }]
    : await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length) throw new Error(`${hostname} does not resolve`);
  for (const a of addresses) {
    if (!allowPrivate && isPrivateAddress(a.address)) {
      throw new Error(
        `${hostname} resolves to a non-public address (${a.address})`,
      );
    }
  }
  return {
    address: addresses[0].address,
    family: addresses[0].family as 4 | 6,
  };
}
