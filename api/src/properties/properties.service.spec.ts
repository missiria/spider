import { BadRequestException } from '@nestjs/common';
import { displayNameFor, normalizeSiteUrl } from './properties.service';

describe('normalizeSiteUrl', () => {
  it('turns loose input into the GSC URL-prefix form', () => {
    expect(normalizeSiteUrl('www.puntomira.com')).toBe(
      'https://www.puntomira.com/',
    );
    expect(normalizeSiteUrl('https://www.puntomira.com')).toBe(
      'https://www.puntomira.com/',
    );
    expect(normalizeSiteUrl('https://www.puntomira.com/tarifs/?x=1')).toBe(
      'https://www.puntomira.com/',
    );
    expect(normalizeSiteUrl('HTTPS://WWW.IPTV-X.COM/')).toBe(
      'https://www.iptv-x.com/',
    );
  });

  it('keeps domain properties', () => {
    expect(normalizeSiteUrl('sc-domain:example.com')).toBe(
      'sc-domain:example.com',
    );
  });

  it('rejects garbage', () => {
    expect(() => normalizeSiteUrl('')).toThrow(BadRequestException);
    expect(() => normalizeSiteUrl('not a url')).toThrow(BadRequestException);
    expect(() => normalizeSiteUrl('sc-domain:nope')).toThrow(
      BadRequestException,
    );
  });
});

describe('displayNameFor', () => {
  it('strips scheme, www and slash', () => {
    expect(displayNameFor('https://www.iptv-shark.com/')).toBe(
      'iptv-shark.com',
    );
    expect(displayNameFor('sc-domain:example.com')).toBe('example.com');
  });
});
