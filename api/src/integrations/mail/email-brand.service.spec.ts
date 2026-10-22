import { ConfigService } from '@nestjs/config';
import { Repository } from 'typeorm';
import { EmailBrandRevision } from './email-brand.entity';
import { EmailBrandService } from './email-brand.service';

describe('global email brand revisions', () => {
  const findOne = jest.fn();
  const save = jest.fn((v: unknown) => v);
  const repo = {
    findOne,
    save,
    create: (v: unknown) => v,
  } as unknown as Repository<EmailBrandRevision>;
  const service = new EmailBrandService(
    repo,
    new ConfigService({ APP_PUBLIC_URL: 'https://example.com' }),
  );
  beforeEach(() => jest.clearAllMocks());
  it('uses defaults before any brand is published', async () => {
    findOne.mockResolvedValue(null);
    expect((await service.published()).logoUrl).toBe(
      'https://example.com/brand/spider-logo.png',
    );
    expect(findOne).toHaveBeenCalledWith({
      where: { status: 'published' },
      order: { id: 'DESC' },
    });
  });
  it('saving a draft cannot publish it', async () => {
    await service.saveDraft(service.defaults(), 42);
    expect(save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'draft', actor_id: 42 }),
    );
  });
  it('publishes only the selected persisted draft and records the actor', async () => {
    const brand = service.defaults();
    findOne.mockResolvedValue({ id: 9, brand, status: 'draft' });
    await service.publish(9, 42);
    expect(findOne).toHaveBeenCalledWith({ where: { id: 9, status: 'draft' } });
    expect(save).toHaveBeenCalledWith({
      brand,
      status: 'published',
      actor_id: 42,
    });
  });
  it('rejects publishing an unknown revision', async () => {
    findOne.mockResolvedValue(null);
    await expect(service.publish(999, 42)).rejects.toThrow(
      'Email branding draft not found',
    );
    expect(save).not.toHaveBeenCalled();
  });
});
