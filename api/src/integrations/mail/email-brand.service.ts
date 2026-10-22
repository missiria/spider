import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { EmailBrand, EmailBrandRevision } from './email-brand.entity';

@Injectable()
export class EmailBrandService {
  constructor(
    @InjectRepository(EmailBrandRevision)
    private readonly revisions: Repository<EmailBrandRevision>,
    private readonly config: ConfigService,
  ) {}

  defaults(): EmailBrand {
    const url = (this.config.get<string>('APP_PUBLIC_URL') ?? '').replace(
      /\/+$/,
      '',
    );
    return {
      name: this.config.get<string>('MAIL_FROM_NAME') || 'Spider',
      logoUrl: `${url}/brand/spider-logo.png`,
      accentColor: '#4f46e5',
      supportEmail: this.config.get<string>('MAIL_FROM') || '',
      company: 'Spider by MISSIRIA',
      footer:
        'You received this email because of your Spider account or account request.',
      websiteUrl: url,
    };
  }

  async published(): Promise<EmailBrand> {
    const row = await this.revisions.findOne({
      where: { status: 'published' },
      order: { id: 'DESC' },
    });
    return row?.brand ?? this.defaults();
  }

  async settings() {
    const [latest, published, history] = await Promise.all([
      this.revisions.findOne({ where: {}, order: { id: 'DESC' } }),
      this.published(),
      this.revisions.find({ order: { id: 'DESC' }, take: 20 }),
    ]);
    return {
      draft: latest?.brand ?? this.defaults(),
      draftId: latest?.status === 'draft' ? latest.id : null,
      published,
      history,
    };
  }

  saveDraft(brand: EmailBrand, actor: number) {
    return this.revisions.save(
      this.revisions.create({ brand, actor_id: actor, status: 'draft' }),
    );
  }

  async publish(id: number, actor: number) {
    const draft = await this.revisions.findOne({
      where: { id, status: 'draft' },
    });
    if (!draft) throw new NotFoundException('Email branding draft not found');
    return this.revisions.save(
      this.revisions.create({
        brand: draft.brand,
        actor_id: actor,
        status: 'published',
      }),
    );
  }
}
