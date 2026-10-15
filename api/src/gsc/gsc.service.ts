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

export type GscDimension =
  'date' | 'query' | 'page' | 'country' | 'device' | 'searchAppearance';

export interface GscPagedResult {
  rows: GscRow[];
  /** number of API calls spent */
  calls: number;
  /** true when the API kept returning full pages up to the safety cap: the dataset is cut */
  truncated: boolean;
}

/** GSC hard limit per request. */
export const GSC_ROW_LIMIT = 25000;
/** Safety cap per (property, dimension, date-chunk): 20 pages = 500k rows. */
const MAX_PAGES = 20;

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
  /** Minimum spacing between live calls (ms); 1,200 QPM per site is the Google limit. */
  private readonly paceMs: number;
  private lastCallAt = 0;

  constructor(private readonly config: ConfigService) {
    this.mock = (config.get<string>('GSC_MOCK') ?? '0') === '1';
    this.paceMs = Number.parseInt(
      config.get<string>('GSC_PACE_MS') ?? '120',
      10,
    );
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
      this.serviceAccountEmail =
        'spider-reader@example.iam.gserviceaccount.com';
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

  /** Single page (≤ 25k rows). */
  async query(
    siteUrl: string,
    startDate: string,
    endDate: string,
    dimensions: GscDimension[],
    rowLimit = GSC_ROW_LIMIT,
    startRow = 0,
  ): Promise<GscRow[]> {
    if (this.mock) {
      return this.mockQuery(
        siteUrl,
        startDate,
        endDate,
        dimensions,
        rowLimit,
        startRow,
      );
    }
    await this.pace();
    const res = await this.withRetry(() =>
      this.api().searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions,
          rowLimit,
          startRow,
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

  /** All pages for a request, following startRow until a short page or the safety cap. */
  async queryAll(
    siteUrl: string,
    startDate: string,
    endDate: string,
    dimensions: GscDimension[],
  ): Promise<GscPagedResult> {
    const rows: GscRow[] = [];
    let calls = 0;
    let startRow = 0;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const batch = await this.query(
        siteUrl,
        startDate,
        endDate,
        dimensions,
        GSC_ROW_LIMIT,
        startRow,
      );
      calls += 1;
      rows.push(...batch);
      if (batch.length < GSC_ROW_LIMIT) {
        return { rows, calls, truncated: false };
      }
      startRow += GSC_ROW_LIMIT;
    }
    return { rows, calls, truncated: true };
  }

  /**
   * searchAppearance cannot be combined with other dimensions, so daily values need one
   * call per day. Returns rows keyed [date, appearance].
   */
  async querySearchAppearanceByDay(
    siteUrl: string,
    startDate: string,
    endDate: string,
  ): Promise<GscPagedResult> {
    if (this.mock) {
      const rows = this.mockQuery(
        siteUrl,
        startDate,
        endDate,
        ['searchAppearance'],
        GSC_ROW_LIMIT,
        0,
      );
      return { rows, calls: 0, truncated: false };
    }
    const rows: GscRow[] = [];
    let calls = 0;
    for (let d = startDate; d <= endDate; d = nextDay(d)) {
      const batch = await this.query(siteUrl, d, d, ['searchAppearance'], 100);
      calls += 1;
      for (const r of batch) {
        rows.push({ ...r, keys: [d, ...r.keys] });
      }
    }
    return { rows, calls, truncated: false };
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
      throw new Error(
        'GSC_SERVICE_ACCOUNT_JSON does not look like a service-account key',
      );
    }
    return {
      client_email: parsed.client_email,
      private_key: parsed.private_key,
    };
  }

  private async pace(): Promise<void> {
    const wait = this.lastCallAt + this.paceMs - Date.now();
    if (wait > 0) {
      await new Promise((r) => setTimeout(r, wait));
    }
    this.lastCallAt = Date.now();
  }

  private async withRetry<T>(fn: () => Promise<T>, attempts = 4): Promise<T> {
    let lastError: unknown;
    for (let i = 0; i < attempts; i += 1) {
      try {
        return await fn();
      } catch (err) {
        lastError = err;
        const status =
          (err as { code?: number; response?: { status?: number } }).code ??
          (err as { response?: { status?: number } }).response?.status;
        const retryable =
          status === 429 || (typeof status === 'number' && status >= 500);
        if (!retryable || i === attempts - 1) {
          throw err;
        }
        const delay = 1000 * 2 ** i;
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
    startRow: number,
  ): GscRow[] {
    const host = GscService.fixtureHost(siteUrl);
    let file: string;
    if (dimensions.length === 1 && dimensions[0] === 'date') {
      file = `daily/${host}.json`;
    } else if (dimensions[0] === 'date' && dimensions.length === 2) {
      file = `dims/${host}.${dimensions[1]}.json`;
    } else if (dimensions[0] === 'searchAppearance') {
      file = `dims/${host}.searchAppearance.json`;
    } else if (
      dimensions.length === 2 &&
      dimensions[0] === 'query' &&
      dimensions[1] === 'page'
    ) {
      file = `top/${host}.query_page.json`;
    } else {
      file = `top/${host}.${dimensions[0]}.json`;
    }
    const data = this.readFixture<{ rows?: GscRow[] }>(file);
    const rows = data?.rows ?? [];
    // fixtures for date-keyed files carry the date in keys[0]
    const dated = file.startsWith('daily/') || file.startsWith('dims/');
    const filtered = dated
      ? rows.filter((r) => r.keys[0] >= startDate && r.keys[0] <= endDate)
      : rows;
    return filtered.slice(startRow, startRow + rowLimit);
  }
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}
