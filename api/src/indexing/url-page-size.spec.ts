import { BadRequestException } from '@nestjs/common';
import { parseUrlPageSize } from './url-page-size';

describe('parseUrlPageSize (MISS-0195)', () => {
  it('defaults to 10', () => {
    expect(parseUrlPageSize(undefined)).toBe(10);
    expect(parseUrlPageSize('')).toBe(10);
  });

  it('accepts 10, 50 and 250', () => {
    expect(parseUrlPageSize('10')).toBe(10);
    expect(parseUrlPageSize('50')).toBe(50);
    expect(parseUrlPageSize('250')).toBe(250);
  });

  it.each(['100', '0', '-10', '25', '10.5', '50abc', 'abc', '1e2'])(
    'rejects %s with 400',
    (raw) => {
      expect(() => parseUrlPageSize(raw)).toThrow(BadRequestException);
    },
  );
});
