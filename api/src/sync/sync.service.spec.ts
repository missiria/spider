import { chunkPeriod } from './sync.service';

describe('chunkPeriod', () => {
  it('splits a 90-day window into 31-day chunks without gaps or overlap', () => {
    const chunks = [
      ...chunkPeriod({ start: '2026-07-15', end: '2026-10-12' }, 31),
    ];
    expect(chunks).toEqual([
      { start: '2026-07-15', end: '2026-08-14' },
      { start: '2026-08-15', end: '2026-09-14' },
      { start: '2026-09-15', end: '2026-10-12' },
    ]);
  });

  it('returns one chunk when the window is shorter than the chunk', () => {
    expect([
      ...chunkPeriod({ start: '2026-10-03', end: '2026-10-12' }, 31),
    ]).toEqual([{ start: '2026-10-03', end: '2026-10-12' }]);
  });
});
