import { isPrivateAddress, parseV6, resolvePublicAddress } from './ssrf';

describe('ssrf guard', () => {
  it('parses IPv6 text forms into bytes', () => {
    expect(parseV6('::1')!.slice(14)).toEqual([0, 1]);
    expect(parseV6('::ffff:10.0.0.1')!.slice(10)).toEqual([
      0xff, 0xff, 10, 0, 0, 1,
    ]);
    expect(parseV6('2001:db8::1')!.slice(0, 4)).toEqual([
      0x20, 0x01, 0x0d, 0xb8,
    ]);
    expect(parseV6('fe80::1%eth0')!.slice(0, 2)).toEqual([0xfe, 0x80]);
    expect(parseV6('1:2:3:4:5:6:7:8:9')).toBeNull();
    expect(parseV6('1::2::3')).toBeNull();
  });

  it('classifies private, loopback, link-local, CGNAT, documentation and reserved IPv4', () => {
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
      '192.0.2.1',
      '198.51.100.1',
      '203.0.113.1',
      '192.88.99.1',
      '255.255.255.255',
    ]) {
      expect({ ip, private: isPrivateAddress(ip) }).toEqual({
        ip,
        private: true,
      });
    }
  });

  it('classifies IPv6 including every IPv4-embedding form', () => {
    for (const ip of [
      '::1',
      '::',
      'fe80::1',
      'fec0::1', // site-local
      'fd00::1',
      'fc00::1',
      'ff02::1',
      '::ffff:10.0.0.1', // mapped, dotted
      '::ffff:a00:1', // mapped, hex form of 10.0.0.1
      '::ffff:0:7f00:1', // SIIT 127.0.0.1
      '::10.0.0.1', // compat
      '64:ff9b::a00:1', // NAT64 → 10.0.0.1
      '64:ff9b:1::1', // local-use NAT64
      '2002:a00:1::1', // 6to4 → 10.0.0.1
      '2001::1', // Teredo
      '2001:db8::1', // documentation
      '100::1', // discard prefix / non-global
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
      '64:ff9b::808:808',
      '2002:808:808::1',
      '2a00:1450:4007:80d::200e',
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
