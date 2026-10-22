/**
 * Workspace report branding (MISS-0094, extended MISS-0135): display brand, legal entity
 * profile and an approved logo. Pure helpers, unit-tested. Values come only from what the
 * workspace admin saved; nothing here assumes which entity a workspace belongs to.
 */
import { BadRequestException } from '@nestjs/common';

export interface Brand {
  /** display name in the PDF header (kept from MISS-0094) */
  name?: string;
  accent_color?: string;
  /** free footer line (kept from MISS-0094) */
  footer?: string;
  legal_name?: string;
  trading_name?: string;
  company_number?: string;
  registered_address?: string;
  contact_email?: string;
  website?: string;
}

export interface LogoMeta {
  mime: 'image/png' | 'image/jpeg';
  width: number;
  height: number;
  bytes: number;
}

export interface StoredLogo extends LogoMeta {
  /** base64 image bytes */
  data: string;
}

export const MAX_LOGO_BYTES = 256 * 1024;
export const MIN_LOGO_SIDE = 16;
export const MAX_LOGO_SIDE = 4000;

const LIMITS: Record<Exclude<keyof Brand, 'accent_color'>, number> = {
  name: 80,
  footer: 160,
  legal_name: 120,
  trading_name: 120,
  company_number: 40,
  registered_address: 300,
  contact_email: 120,
  website: 200,
};

const oneLine = (v: unknown, max: number): string | undefined => {
  if (typeof v !== 'string') return undefined;
  const s = v.replace(/\s+/g, ' ').trim().slice(0, max);
  return s || undefined;
};

/** Normalises an admin's input; invalid email / website / colour are rejected, not dropped. */
export function sanitizeBrand(input: Record<string, unknown>): Brand {
  const out: Brand = {};
  for (const key of Object.keys(LIMITS) as (keyof typeof LIMITS)[]) {
    if (key === 'registered_address') continue;
    const v = oneLine(input[key], LIMITS[key]);
    if (v) out[key] = v;
  }
  // an address keeps its line breaks (one per line in the footer), blank lines removed
  if (typeof input.registered_address === 'string') {
    const lines = input.registered_address
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    const addr = lines.join('\n').slice(0, LIMITS.registered_address);
    if (addr) out.registered_address = addr;
  }
  const color = input.accent_color;
  if (typeof color === 'string' && color) {
    if (!/^#[0-9a-fA-F]{6}$/.test(color))
      throw new BadRequestException('Accent colour must look like #4f46e5');
    out.accent_color = color;
  }
  if (
    out.contact_email &&
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.contact_email)
  )
    throw new BadRequestException('Contact email is not a valid address');
  if (out.website) {
    const withScheme = /^https?:\/\//i.test(out.website)
      ? out.website
      : `https://${out.website}`;
    let url: URL;
    try {
      url = new URL(withScheme);
    } catch {
      throw new BadRequestException('Website must be a web address');
    }
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.'))
      throw new BadRequestException('Website must be a web address');
    out.website = withScheme;
  }
  return out;
}

export function parseBrand(raw: string | null | undefined): Brand {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw) as unknown;
    return v && typeof v === 'object' ? (v as Brand) : {};
  } catch {
    return {};
  }
}

/**
 * Validates an uploaded logo by its bytes (never the client's file name or declared type)
 * and reads its pixel size so the PDF can keep the aspect ratio.
 */
export function inspectLogo(buf: Buffer): LogoMeta {
  if (!buf.length) throw new BadRequestException('The logo file is empty');
  if (buf.length > MAX_LOGO_BYTES)
    throw new BadRequestException(
      `The logo is larger than ${MAX_LOGO_BYTES / 1024} KB`,
    );
  let dims: { width: number; height: number } | null = null;
  let mime: LogoMeta['mime'];
  if (
    buf.length > 24 &&
    buf.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    buf.toString('ascii', 12, 16) === 'IHDR'
  ) {
    mime = 'image/png';
    dims = { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } else if (buf[0] === 0xff && buf[1] === 0xd8) {
    mime = 'image/jpeg';
    dims = jpegSize(buf);
  } else {
    throw new BadRequestException('The logo must be a PNG or JPEG image');
  }
  if (!dims) throw new BadRequestException('The logo image could not be read');
  const { width, height } = dims;
  if (
    width < MIN_LOGO_SIDE ||
    height < MIN_LOGO_SIDE ||
    width > MAX_LOGO_SIDE ||
    height > MAX_LOGO_SIDE
  )
    throw new BadRequestException(
      `The logo must be between ${MIN_LOGO_SIDE} and ${MAX_LOGO_SIDE} pixels on each side`,
    );
  return { mime, width, height, bytes: buf.length };
}

function jpegSize(buf: Buffer): { width: number; height: number } | null {
  let i = 2;
  while (i + 9 < buf.length) {
    if (buf[i] !== 0xff) return null;
    const marker = buf[i + 1];
    // standalone markers carry no length
    if (
      marker === 0xd8 ||
      marker === 0x01 ||
      (marker >= 0xd0 && marker <= 0xd7)
    ) {
      i += 2;
      continue;
    }
    const len = buf.readUInt16BE(i + 2);
    // SOF0..SOF15 except DHT (C4), JPG (C8), DAC (CC)
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      return {
        height: buf.readUInt16BE(i + 5),
        width: buf.readUInt16BE(i + 7),
      };
    }
    i += 2 + len;
  }
  return null;
}

/** What Settings explains when part of the profile is missing (text-only fallbacks). */
export function missingBranding(brand: Brand, hasLogo: boolean): string[] {
  const out: string[] = [];
  if (!hasLogo)
    out.push('No logo: the PDF header shows the brand name as text.');
  if (!brand.name && !brand.trading_name && !brand.legal_name)
    out.push(
      'No brand, trading or legal name: the PDF header reads "Search performance report" only.',
    );
  if (!brand.legal_name)
    out.push(
      'No legal entity name: the PDF footer shows no legal details, only the footer line, date and page number.',
    );
  else {
    if (!brand.company_number)
      out.push('No company number: it is left out of the PDF footer.');
    if (!brand.registered_address)
      out.push('No registered address: it is left out of the PDF footer.');
  }
  return out;
}

/** Name printed in the PDF header: brand name, else trading name, else legal name. */
export function headerName(brand: Brand): string | null {
  return brand.name || brand.trading_name || brand.legal_name || null;
}

/** Legal footer lines, in print order. Empty when no legal name is configured. */
export function legalLines(brand: Brand): string[] {
  if (!brand.legal_name) return [];
  const id = [
    brand.trading_name && brand.trading_name !== brand.legal_name
      ? `${brand.legal_name} (trading as ${brand.trading_name})`
      : brand.legal_name,
    brand.company_number ? `Company no. ${brand.company_number}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const lines = [id];
  if (brand.registered_address)
    lines.push(
      `Registered office: ${brand.registered_address.split('\n').join(', ')}`,
    );
  const contact = [
    brand.contact_email,
    brand.website?.replace(/^https?:\/\//i, ''),
  ]
    .filter(Boolean)
    .join(' · ');
  if (contact) lines.push(contact);
  return lines;
}
