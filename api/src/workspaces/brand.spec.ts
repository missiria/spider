import { BadRequestException } from '@nestjs/common';
import {
  MAX_LOGO_BYTES,
  headerName,
  inspectLogo,
  legalLines,
  missingBranding,
  sanitizeBrand,
} from './brand';
import { jpegHeader, solidPng } from '../testing/images.helper-spec';

describe('brand', () => {
  it('keeps the MISS-0094 fields and adds the entity profile, trimmed and capped', () => {
    const b = sanitizeBrand({
      name: '  MISSIRIA  ',
      accent_color: '#C8F16A',
      footer: 'Prepared for our client',
      legal_name: 'MISSIRIA LTD',
      trading_name: 'MISSIRIA',
      company_number: ' 17494304 ',
      registered_address:
        'Unit A, 82 James Carter Road\r\n\r\n Mildenhall  IP28 7DE\nUnited Kingdom',
      contact_email: 'contact@missiria.dev',
      website: 'www.missiria.dev',
    });
    expect(b).toEqual({
      name: 'MISSIRIA',
      accent_color: '#C8F16A',
      footer: 'Prepared for our client',
      legal_name: 'MISSIRIA LTD',
      trading_name: 'MISSIRIA',
      company_number: '17494304',
      registered_address:
        'Unit A, 82 James Carter Road\nMildenhall IP28 7DE\nUnited Kingdom',
      contact_email: 'contact@missiria.dev',
      website: 'https://www.missiria.dev',
    });
    expect(sanitizeBrand({ name: 'x'.repeat(200) }).name).toHaveLength(80);
    expect(
      sanitizeBrand({ registered_address: 'a\n'.repeat(400) })
        .registered_address!.length,
    ).toBeLessThanOrEqual(300);
  });

  it('empty fields are dropped, never stored as blanks', () => {
    expect(sanitizeBrand({ name: '   ', legal_name: '', website: '' })).toEqual(
      {},
    );
  });

  it('rejects an invalid email, website or colour instead of silently dropping it', () => {
    expect(() => sanitizeBrand({ contact_email: 'not-an-email' })).toThrow(
      BadRequestException,
    );
    expect(() => sanitizeBrand({ website: 'javascript:alert(1)' })).toThrow(
      BadRequestException,
    );
    expect(() => sanitizeBrand({ website: 'localhost' })).toThrow(
      BadRequestException,
    );
    expect(() => sanitizeBrand({ accent_color: 'red' })).toThrow(
      BadRequestException,
    );
  });

  it('reads PNG and JPEG sizes from the bytes', () => {
    expect(inspectLogo(solidPng(240, 60))).toMatchObject({
      mime: 'image/png',
      width: 240,
      height: 60,
    });
    expect(inspectLogo(jpegHeader(320, 100))).toMatchObject({
      mime: 'image/jpeg',
      width: 320,
      height: 100,
    });
  });

  it('rejects other types, oversize files and tiny or huge images', () => {
    expect(() =>
      inspectLogo(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toThrow('PNG or JPEG');
    expect(() => inspectLogo(Buffer.from('GIF89a........'))).toThrow(
      'PNG or JPEG',
    );
    expect(() => inspectLogo(Buffer.alloc(0))).toThrow('empty');
    const big = Buffer.concat([solidPng(20, 20), Buffer.alloc(MAX_LOGO_BYTES)]);
    expect(() => inspectLogo(big)).toThrow('larger than');
    expect(() => inspectLogo(solidPng(8, 8))).toThrow('between');
    expect(() => inspectLogo(jpegHeader(5000, 100))).toThrow('between');
  });

  it('header name falls back brand → trading → legal → none', () => {
    expect(headerName({ name: 'A', trading_name: 'B', legal_name: 'C' })).toBe(
      'A',
    );
    expect(headerName({ trading_name: 'B', legal_name: 'C' })).toBe('B');
    expect(headerName({ legal_name: 'C' })).toBe('C');
    expect(headerName({})).toBeNull();
  });

  it('legal footer lines only exist with a legal name', () => {
    expect(
      legalLines({ company_number: '1', registered_address: 'x' }),
    ).toEqual([]);
    expect(
      legalLines({
        legal_name: 'MISSIRIA LTD',
        trading_name: 'MISSIRIA',
        company_number: '17494304',
        registered_address: 'Unit A\nMildenhall IP28 7DE',
        contact_email: 'contact@missiria.dev',
        website: 'https://www.missiria.dev',
      }),
    ).toEqual([
      'MISSIRIA LTD (trading as MISSIRIA) · Company no. 17494304',
      'Registered office: Unit A, Mildenhall IP28 7DE',
      'contact@missiria.dev · www.missiria.dev',
    ]);
  });

  it('explains every missing piece with its fallback', () => {
    const all = missingBranding({}, false);
    expect(all.join(' ')).toMatch(/No logo/);
    expect(all.join(' ')).toMatch(/No legal entity name/);
    expect(missingBranding({ name: 'A', legal_name: 'L' }, true)).toEqual([
      'No company number: it is left out of the PDF footer.',
      'No registered address: it is left out of the PDF footer.',
    ]);
    expect(
      missingBranding(
        {
          name: 'A',
          legal_name: 'L',
          company_number: '1',
          registered_address: 'x',
        },
        true,
      ),
    ).toEqual([]);
  });
});
