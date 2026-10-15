import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { google, searchconsole_v1 } from 'googleapis';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export interface GscSite {
  siteUrl: string;
  permissionLevel: string;
}

export interface GscRow {
  keys: string[];
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export type GscDimension = 'date' | 'page' | 'query';

/**
 * Thin wrapper over the Search Console API (service-account auth, ADR-0002).
 * GSC_MOCK=1 serves recorded fixtures from fixtures/gsc so the app and tests run
 * without credentials.
 */
@Injectable()
export class GscService {
  private readonly logger = new Logger(GscService.name);
  private client: searchconsole_v1.Searchconsole | null = null;
  private serviceAccountEmail: string | null = null;
  private readonly mock: boolean;
  private readonly fixturesDir: string;

  constructor(private readonly config: ConfigService) {
    this.mock = (config.get<string>('GSC_MOCK') ?? '0') === '1';
    this.fixturesDir = this.resolveFixturesDir();
    if (this.mock) {
      this.logger.warn(`GSC_MOCK=1: serving fixtures from ${this.fixturesDir}`);
    }
  }

  isMock(): boolean {
    return this.mock;
  }

  /** Email the client must add as a GSC user (Settings → Users and permissions). */
  getServiceAccountEmail(): string {
    if (this.serviceAccountEmail) {
      return this.serviceAccountEmail;
    }
    if (this.mock) {
      this.serviceAccountEmail = 'spider-reader@example.iam.gserviceaccount.com';
      return this.serviceAccountEmail;
    }
    const creds = this.loadCredentials();
    this.serviceAccountEmail = creds.client_email;
    return this.serviceAccountEmail;
  }

  async listSites(): Promise<GscSite[]> {
    if (this.mock) {
      const data = this.readFixture<{ siteEntry?: GscSite[] }>('sites.json');
      return data?.siteEntry ?? [];
    }
    const res = await this.withRetry(() => this.api().sites.list());
    return (res.data.siteEntry ?? []).map((e) => ({
      siteUrl: e.siteUrl ?? '',
      permissionLevel: e.permissionLevel ?? '',
    }));
  }

  async query(
    siteUrl: string,
    startDate: string,
    endDate: string,
    dimensions: GscDimension[],
    rowLimit = 25000,
  ): Promise<GscRow[]> {
    if (this.mock) {
      return this.mockQuery(siteUrl, startDate, endDate, dimensions, rowLimit);
    }
    const res = await this.withRetry(() =>
      this.api().searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions,
          rowLimit,
          type: 'web',
        },
      }),
    );
    return (res.data.rows ?? []).map((r) => ({
      keys: r.keys ?? [],
      clicks: r.clicks ?? 0,
      impressions: r.impressions ?? 0,
      ctr: r.ctr ?? 0,
      position: r.position ?? 0,
    }));
  }

  // ---- real client -------------------------------------------------------

  private api(): searchconsole_v1.Searchconsole {
    if (this.client) {
      return this.client;
    }
    const creds = this.loadCredentials();
    const auth = new google.auth.JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    });
    this.client = google.searchconsole({ version: 'v1', auth });
    return this.client;
  }

  private loadCredentials(): { client_email: string; private_key: string } {
    const raw = this.config.get<string>('GSC_SERVICE_ACCOUNT_JSON') ?? '';
    if (!raw) {
      throw new Error(
        'GSC_SERVICE_ACCOUNT_JSON is not set (base64 of the service-account key) and GSC_MOCK is not 1',
      );
    }
    const json = Buffer.from(raw, 'base64').toString('utf8');
    const parsed = JSON.parse(json) as {
      client_email?: string;
      private_key?: string;
    };
    if (!parsed.client_email || !parsed.private_key) {
      throw new Error('GSC_SERVICE_ACCOUNT_JSON does not look like a service-account key');
    }
    return { client_email: parsed.client_email, private_key: parsed.private_key };
  }

  private async withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        const status = (err as { code?: number; response?: { status?: number } })
          .code ?? (err as { response?: { status?: number } }).response?.status;
        const retryable = status === 429 || (typeof status === 'number' && status >= 500);
        if (!retryable || i === attempts - 1) {
          throw err;
        }
        const delay = 500 * 2 ** i;
        this.logger.warn(`GSC call failed with ${status}, retry in ${delay}ms`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
    throw lastError;
  }

  // ---- fixtures ----------------------------------------------------------

  private resolveFixturesDir(): string {
    const fromEnv = this.config.get<string>('GSC_FIXTURES_DIR');
    const candidates = [
      fromEnv,
      resolve(process.cwd(), 'fixtures/gsc'),
      resolve(process.cwd(), 'api/fixtures/gsc'),
      resolve(__dirname, '../../fixtures/gsc'),
    ].filter(Boolean) as string[];
    return candidates.find((c) => existsSync(c)) ?? candidates[1];
  }

  private readFixture<T>(name: string): T | null {
    const file = resolve(this.fixturesDir, name);
    if (!existsSync(file)) {
      return null;
    }
    return JSON.parse(readFileSync(file, 'utf8')) as T;
  }

  static fixtureHost(siteUrl: string): string {
    return siteUrl
      .replace(/^https?:\/\//, '')
      .replace(/^sc-domain:/, '')
      .replace(/\/+$/, '')
      .replace(/\//g, '_');
  }

  private mockQuery(
    siteUrl: string,
    startDate: string,
    endDate: string,
    dimensions: GscDimension[],
    rowLimit: number,
  ): GscRow[] {
    const host = GscService.fixtureHost(siteUrl);
    const dim = dimensions[0];
    const file = dim === 'date' ? `daily/${host}.json` : `top/${host}.${dim}.json`;
    const data = this.readFixture<{ rows?: GscRow[] }>(file);
    const rows = data?.rows ?? [];
    const filtered =
      dim === 'date'
        ? rows.filter((r) => r.keys[0] >= startDate && r.keys[0] <= endDate)
        : rows;
    return filtered.slice(0, rowLimit);
  }
}
