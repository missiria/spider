import { inflateRawSync } from 'node:zlib';

/**
 * Minimal readers for Search Console exports (MITP-0833), so the import needs no new
 * dependency: a ZIP reader (stored + deflate entries, central directory) and an RFC 4180 CSV
 * parser. Inputs are size-capped by the controller.
 */

export interface ZipEntry {
  name: string;
  data: Buffer;
}

const MAX_ENTRY_BYTES = 50 * 1024 * 1024;

export function isZip(buf: Buffer): boolean {
  return buf.length > 4 && buf.readUInt32LE(0) === 0x04034b50;
}

export function readZip(buf: Buffer): ZipEntry[] {
  // End of central directory: last 0x06054b50 within the final 64 KiB + 22 bytes
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65_557); i -= 1) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) {
    throw new Error(
      'Not a valid ZIP file (no end-of-central-directory record)',
    );
  }
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n += 1) {
    if (buf.readUInt32LE(p) !== 0x02014b50) {
      throw new Error('Corrupt ZIP central directory');
    }
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const size = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;
    if (name.endsWith('/')) continue;
    if (size > MAX_ENTRY_BYTES) {
      throw new Error(`ZIP entry ${name} is too large`);
    }
    const lNameLen = buf.readUInt16LE(localOffset + 26);
    const lExtraLen = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lNameLen + lExtraLen;
    const raw = buf.subarray(start, start + compSize);
    let data: Buffer;
    if (method === 0) data = Buffer.from(raw);
    else if (method === 8) data = inflateRawSync(raw);
    else
      throw new Error(
        `ZIP entry ${name} uses unsupported compression ${method}`,
      );
    entries.push({ name: name.split('/').pop() ?? name, data });
  }
  return entries;
}

/** Parses CSV text (quoted fields, "" escapes, CRLF/LF, optional UTF-8 BOM). */
export function parseCsv(text: string): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (quoted) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ''));
}

/** CSV rows as objects keyed by the header row (header names trimmed). */
export function csvObjects(text: string): {
  header: string[];
  rows: Record<string, string>[];
} {
  const all = parseCsv(text);
  const header = (all[0] ?? []).map((h) => h.trim());
  const rows = all.slice(1).map((r) => {
    const o: Record<string, string> = {};
    header.forEach((h, i) => (o[h] = (r[i] ?? '').trim()));
    return o;
  });
  return { header, rows };
}
