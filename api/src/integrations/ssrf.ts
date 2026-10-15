import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

/**
 * Outbound-request guard for webhooks: a hostname is acceptable only if EVERY address it
 * resolves to is public. Addresses are parsed to bytes; IPv6 forms that embed an IPv4
 * address (mapped, compat, NAT64, 6to4, Teredo) are classified by the embedded address.
 * Used at creation and again at delivery, where the validated address is pinned for the
 * connection (DNS rebinding).
 */
export function isPrivateAddress(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const b = parseV4(ip);
    return !b || isPrivateV4Bytes(b);
  }
  if (v === 6) {
    const b = parseV6(ip);
    return !b || isPrivateV6Bytes(b);
  }
  return true; // not an IP literal → treat as unsafe
}

function parseV4(ip: string): number[] | null {
  const p = ip.split('.');
  if (p.length !== 4) return null;
  const b = p.map((x) => (/^\d{1,3}$/.test(x) ? Number(x) : NaN));
  return b.some((n) => Number.isNaN(n) || n > 255) ? null : b;
}

/** Expand any textual IPv6 (incl. "::" and embedded dotted IPv4) into 16 bytes. */
export function parseV6(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const zone = s.indexOf('%');
  if (zone !== -1) s = s.slice(0, zone);
  // embedded dotted quad at the end → two hextets
  const dotted = s.match(/^(.*:)(\d+\.\d+\.\d+\.\d+)$/);
  if (dotted) {
    const v4 = parseV4(dotted[2]);
    if (!v4) return null;
    s = `${dotted[1]}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array(missing).fill('0'), ...tail];
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  return bytes;
}

function isPrivateV4Bytes(b: number[]): boolean {
  const [a, c] = b;
  if (a === 0 || a === 10 || a === 127) return true; // this-network, private, loopback
  if (a === 100 && c >= 64 && c <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && c === 254) return true; // link-local
  if (a === 172 && c >= 16 && c <= 31) return true; // private
  if (a === 192 && c === 168) return true; // private
  if (a === 192 && c === 0 && (b[2] === 0 || b[2] === 2)) return true; // 192.0.0/24, TEST-NET-1
  if (a === 192 && c === 88 && b[2] === 99) return true; // 6to4 relay anycast
  if (a === 198 && (c === 18 || c === 19)) return true; // benchmarking
  if (a === 198 && c === 51 && b[2] === 100) return true; // TEST-NET-2
  if (a === 203 && c === 0 && b[2] === 113) return true; // TEST-NET-3
  if (a >= 224) return true; // multicast + reserved + broadcast
  return false;
}

function isPrivateV6Bytes(b: number[]): boolean {
  const allZero = (from: number, to: number) =>
    b.slice(from, to).every((x) => x === 0);
  // :: and ::1
  if (allZero(0, 15) && (b[15] === 0 || b[15] === 1)) return true;
  // ::ffff:a.b.c.d (IPv4-mapped) and ::ffff:0:a.b.c.d (SIIT)
  if (allZero(0, 10) && b[10] === 0xff && b[11] === 0xff)
    return isPrivateV4Bytes(b.slice(12));
  if (
    allZero(0, 8) &&
    b[8] === 0xff &&
    b[9] === 0xff &&
    b[10] === 0 &&
    b[11] === 0
  )
    return isPrivateV4Bytes(b.slice(12));
  // ::a.b.c.d (deprecated IPv4-compatible) → ::/96
  if (allZero(0, 12)) return isPrivateV4Bytes(b.slice(12));
  // 64:ff9b::/96 (NAT64) and 64:ff9b:1::/48 (local-use NAT64) → embedded v4 in the last 4 bytes
  if (b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b) {
    if (b[4] === 0 && b[5] === 1) return true; // local-use prefix: never public
    return isPrivateV4Bytes(b.slice(12));
  }
  // 2002::/16 (6to4): embedded v4 in bytes 2..5
  if (b[0] === 0x20 && b[1] === 0x02) return isPrivateV4Bytes(b.slice(2, 6));
  // 2001::/32 (Teredo): client address is obfuscated → block outright
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0 && b[3] === 0) return true;
  // 2001:db8::/32 documentation
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8)
    return true;
  if ((b[0] & 0xfe) === 0xfc) return true; // fc00::/7 ULA
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0xc0) return true; // fec0::/10 site-local
  if (b[0] === 0xff) return true; // ff00::/8 multicast
  // everything else must be global unicast 2000::/3
  return (b[0] & 0xe0) !== 0x20;
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
