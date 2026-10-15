import { isPrivateAddress, resolvePublicAddress } from './ssrf';

describe('ssrf guard', () => {
  it('classifies private, loopback, link-local, CGNAT and reserved ranges', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '172.31.255.255',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '224.0.0.1',
      '::1',
      '::',
      'fe80::1',
      'fd00::1',
      'fc00::1',
      '::ffff:10.0.0.1',
      'not-an-ip',
    ]) {
      expect({ ip, private: isPrivateAddress(ip) }).toEqual({
        ip,
        private: true,
      });
    }
  });

  it('accepts public addresses', () => {
    for (const ip of [
      '8.8.8.8',
      '81.17.98.31',
      '172.32.0.1',
      '100.128.0.1',
      '2606:4700::1111',
      '::ffff:8.8.8.8',
    ]) {
      expect({ ip, private: isPrivateAddress(ip) }).toEqual({
        ip,
        private: false,
      });
    }
  });

  it('rejects hostnames that resolve to private space unless allowed', async () => {
    await expect(resolvePublicAddress('127.0.0.1')).rejects.toThrow(
      /non-public/,
    );
    await expect(resolvePublicAddress('localhost')).rejects.toThrow(
      /non-public/,
    );
    await expect(resolvePublicAddress('127.0.0.1', true)).resolves.toEqual({
      address: '127.0.0.1',
      family: 4,
    });
    await expect(resolvePublicAddress('8.8.8.8')).resolves.toEqual({
      address: '8.8.8.8',
      family: 4,
    });
  });
});
