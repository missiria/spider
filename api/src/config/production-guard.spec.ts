import { assertProductionConfig } from './production-guard';

const logger = { warn: jest.fn(), error: jest.fn() };

describe('assertProductionConfig', () => {
  beforeEach(() => jest.clearAllMocks());

  it('throws in production with placeholder secrets and lists every problem', () => {
    expect(() =>
      assertProductionConfig(
        {
          NODE_ENV: 'production',
          JWT_SECRET: 'replace-with-a-long-random-secret',
          ADMIN_PASSWORD: 'admin12345',
          GSC_MOCK: '1',
          CORS_ORIGINS: '',
        },
        logger,
      ),
    ).toThrow(
      /JWT_SECRET.*ADMIN_PASSWORD.*GSC_MOCK.*INTERNAL_PROXY_SECRET.*CORS_ORIGINS/s,
    );
    expect(logger.error).toHaveBeenCalledTimes(5);
  });

  it('passes in production with real values', () => {
    expect(() =>
      assertProductionConfig(
        {
          NODE_ENV: 'production',
          JWT_SECRET: 'x'.repeat(40),
          ADMIN_PASSWORD: 'S0me-long-passphrase!',
          GSC_MOCK: '0',
          CORS_ORIGINS: 'https://spider.missiria.dev',
          INTERNAL_PROXY_SECRET: 'p'.repeat(24),
        },
        logger,
      ),
    ).not.toThrow();
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('only warns outside production', () => {
    expect(() =>
      assertProductionConfig(
        { NODE_ENV: 'development', JWT_SECRET: 'short', GSC_MOCK: '1' },
        logger,
      ),
    ).not.toThrow();
    expect(logger.warn).toHaveBeenCalled();
  });
});
