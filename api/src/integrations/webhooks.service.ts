import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { WorkspacesService } from '../workspaces/workspaces.service';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import {
  Webhook,
  WEBHOOK_EVENTS,
  WebhookEvent,
} from './entities/webhook.entity';
import { newSecret, signPayload } from './signature';

const MAX_ATTEMPTS = 4;
const BACKOFF_MINUTES = [0, 5, 30, 120];

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  private readonly publicUrl: string;

  constructor(
    @InjectRepository(Webhook) private readonly repo: Repository<Webhook>,
    @InjectRepository(WebhookDelivery)
    private readonly deliveries: Repository<WebhookDelivery>,
    private readonly workspaces: WorkspacesService,
    config: ConfigService,
  ) {
    this.publicUrl = (config.get<string>('APP_PUBLIC_URL') ?? '').replace(
      /\/$/,
      '',
    );
  }

  present(w: Webhook) {
    return {
      ...w,
      secret: undefined,
      secret_hint: `${w.secret.slice(0, 10)}…`,
      events: safeParse<string[]>(w.events, []),
    };
  }

  async list() {
    const ws = await this.workspaces.current();
    const items = await this.repo.find({
      where: { workspace_id: ws.id },
      order: { name: 'ASC' },
    });
    return { items: items.map((w) => this.present(w)) };
  }

  async create(input: { name: string; url: string; events: string[] }) {
    const ws = await this.workspaces.current();
    validateUrl(input.url);
    const events = input.events.filter((e): e is WebhookEvent =>
      (WEBHOOK_EVENTS as readonly string[]).includes(e),
    );
    if (!events.length)
      throw new BadRequestException('Pick at least one event');
    const secret = newSecret();
    const w = await this.repo.save(
      this.repo.create({
        workspace_id: ws.id,
        name: input.name.trim(),
        url: input.url.trim(),
        secret,
        events: JSON.stringify(events),
        enabled: true,
      }),
    );
    // the clear secret is returned once, at creation
    return { ...this.present(w), secret };
  }

  async update(
    id: number,
    input: {
      name?: string;
      url?: string;
      events?: string[];
      enabled?: boolean;
    },
  ) {
    const w = await this.find(id);
    if (input.name !== undefined) w.name = input.name.trim();
    if (input.url !== undefined) {
      validateUrl(input.url);
      w.url = input.url.trim();
    }
    if (input.events !== undefined) {
      const events = input.events.filter((e): e is WebhookEvent =>
        (WEBHOOK_EVENTS as readonly string[]).includes(e),
      );
      if (!events.length)
        throw new BadRequestException('Pick at least one event');
      w.events = JSON.stringify(events);
    }
    if (input.enabled !== undefined) w.enabled = input.enabled;
    return this.present(await this.repo.save(w));
  }

  async remove(id: number): Promise<void> {
    await this.repo.remove(await this.find(id));
  }

  async recentDeliveries(id: number) {
    await this.find(id);
    const items = await this.deliveries.find({
      where: { webhook_id: id },
      order: { created_at: 'DESC' },
      take: 25,
    });
    return {
      items: items.map((d) => ({ ...d, payload: safeParse(d.payload, {}) })),
    };
  }

  /** Immediate test delivery; returns the result so the UI can show it. */
  async test(id: number) {
    const w = await this.find(id);
    const delivery = await this.enqueueFor(w, 'test', `test:${Date.now()}`, {
      message: 'Spider webhook test',
      sent_at: new Date().toISOString(),
    });
    if (!delivery)
      throw new BadRequestException('Could not create the test delivery');
    await this.attempt(delivery, w);
    return { ...delivery, payload: safeParse(delivery.payload, {}) };
  }

  /**
   * Queue `event` for every enabled webhook subscribed to it. `dedupeKey` makes repeated
   * calls for the same subject a no-op per endpoint.
   */
  async emit(
    event: WebhookEvent,
    dedupeKey: string,
    data: Record<string, unknown>,
  ): Promise<number> {
    const ws = await this.workspaces.current();
    const hooks = await this.repo.find({
      where: { workspace_id: ws.id, enabled: true },
    });
    let queued = 0;
    for (const w of hooks) {
      const events = safeParse<string[]>(w.events, []);
      if (!events.includes(event)) continue;
      const d = await this.enqueueFor(w, event, dedupeKey, data);
      if (d) queued += 1;
    }
    return queued;
  }

  private async enqueueFor(
    w: Webhook,
    event: WebhookEvent,
    dedupeKey: string,
    data: Record<string, unknown>,
  ): Promise<WebhookDelivery | null> {
    const ws = await this.workspaces.current();
    const payload = {
      id: `${event}:${dedupeKey}`,
      event,
      created_at: new Date().toISOString(),
      workspace: { id: ws.id, slug: ws.slug },
      app_url: this.publicUrl || undefined,
      data,
    };
    try {
      return await this.deliveries.save(
        this.deliveries.create({
          webhook_id: w.id,
          event,
          dedupe_key: dedupeKey.slice(0, 191),
          payload: JSON.stringify(payload),
          status: 'pending',
          attempts: 0,
          next_attempt_at: new Date(),
        }),
      );
    } catch (err) {
      if ((err as { code?: string }).code === 'ER_DUP_ENTRY') return null; // already sent/queued
      throw err;
    }
  }

  /** Worker: deliver everything pending whose time has come. */
  async processPending(
    limit = 50,
  ): Promise<{ attempted: number; ok: number; failed: number }> {
    const due = await this.deliveries.find({
      where: {
        status: 'pending',
        next_attempt_at: LessThanOrEqual(new Date()),
      },
      order: { next_attempt_at: 'ASC' },
      take: limit,
    });
    const result = { attempted: 0, ok: 0, failed: 0 };
    for (const d of due) {
      const w = await this.repo.findOne({ where: { id: d.webhook_id } });
      if (!w || !w.enabled) {
        d.status = 'failed';
        d.error = 'Webhook disabled or deleted';
        await this.deliveries.save(d);
        continue;
      }
      result.attempted += 1;
      const ok = await this.attempt(d, w);
      if (ok) result.ok += 1;
      else result.failed += 1;
    }
    return result;
  }

  private async attempt(d: WebhookDelivery, w: Webhook): Promise<boolean> {
    d.attempts += 1;
    const body = d.payload;
    const signature = signPayload(w.secret, body);
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const res = await fetch(w.url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'user-agent': 'Spider-Webhooks/1.0',
          'x-spider-event': d.event,
          'x-spider-delivery': String(d.id),
          'x-spider-signature': signature,
        },
        body,
        signal: controller.signal,
        redirect: 'manual',
      });
      clearTimeout(timer);
      d.response_status = res.status;
      if (res.status >= 200 && res.status < 300) {
        d.status = 'ok';
        d.delivered_at = new Date();
        d.error = null;
        w.last_status = 'ok';
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err) {
      const message =
        (err as Error).name === 'AbortError'
          ? 'Timeout after 10s'
          : (err as Error).message;
      d.error = message.slice(0, 1000);
      if (d.attempts >= MAX_ATTEMPTS) {
        d.status = 'failed';
      } else {
        d.status = 'pending';
        d.next_attempt_at = new Date(
          Date.now() +
            BACKOFF_MINUTES[Math.min(d.attempts, BACKOFF_MINUTES.length - 1)] *
              60_000,
        );
      }
      w.last_status = 'failed';
      this.logger.warn(
        `webhook ${w.id} ${d.event} attempt ${d.attempts}: ${message}`,
      );
    }
    w.last_delivery_at = new Date();
    await this.repo.save(w);
    await this.deliveries.save(d);
    return d.status === 'ok';
  }

  async find(id: number): Promise<Webhook> {
    const ws = await this.workspaces.current();
    const w = await this.repo.findOne({ where: { id, workspace_id: ws.id } });
    if (!w) throw new NotFoundException('Webhook not found');
    return w;
  }
}

function validateUrl(raw: string): void {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    throw new BadRequestException('Invalid URL');
  }
  if (
    u.protocol !== 'https:' &&
    !(u.protocol === 'http:' && process.env.NODE_ENV !== 'production')
  ) {
    throw new BadRequestException('Webhook URL must use https');
  }
  const host = u.hostname.toLowerCase();
  // basic SSRF guard: no loopback / link-local / private ranges in production
  if (
    process.env.NODE_ENV === 'production' &&
    (host === 'localhost' ||
      /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(host) ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.endsWith('.local'))
  ) {
    throw new BadRequestException('Webhook URL must be a public host');
  }
}

function safeParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}
