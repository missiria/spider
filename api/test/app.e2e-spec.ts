/**
 * Integration tests against a real MySQL database (pro_spider_app_test by default) in
 * GSC mock mode. Schema comes from the migrations. Run: `npm run test:e2e -w api`.
 * Env: DB_* like the app; DB_DATABASE defaults to pro_spider_app_test.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as dotenv from 'dotenv';
import { resolve } from 'node:path';
// supertest is CommonJS and the api tsconfig has no esModuleInterop
// eslint-disable-next-line @typescript-eslint/no-require-imports
import request = require('supertest');
import { DataSource } from 'typeorm';
import { SchedulerRegistry } from '@nestjs/schedule';
import { getStorageToken } from '@nestjs/throttler';
import { createHmac } from 'node:crypto';
import * as nodeHttp from 'node:http';
import { MailerService } from '../src/integrations/mailer.service';
import { jpegHeader, solidPng } from '../src/testing/images.helper-spec';
import { zip } from '../src/testing/zip.helper-spec';

dotenv.config({ path: resolve(__dirname, '../.env') });
process.env.DB_DATABASE = process.env.E2E_DB_DATABASE ?? 'pro_spider_app_test';
process.env.TYPEORM_MIGRATIONS_RUN = 'true';
process.env.GSC_MOCK = '1';
process.env.GSC_FIXTURES_DIR = resolve(__dirname, '../fixtures/gsc');
process.env.ADMIN_EMAIL = 'e2e-admin@example.com';
process.env.ADMIN_PASSWORD = 'E2e-admin-pass-123';
process.env.JWT_SECRET = 'e2e-secret-e2e-secret-e2e-secret-e2e';
process.env.NODE_ENV = 'test';

// imported after the env is set so ConfigModule / TypeORM read the test values
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { AppModule } = require('../src/app.module');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { DefaultAdminSeeder } = require('../src/bootstrap/default-admin.seeder');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { GscService } = require('../src/gsc/gsc.service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { SyncService } = require('../src/sync/sync.service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { UsersService } = require('../src/users/users.service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { WorkspacesService } = require('../src/workspaces/workspaces.service');
// eslint-disable-next-line @typescript-eslint/no-require-imports
const digestModule = require('../src/opportunities/opportunity-digest.service');
const { OpportunityDigestService } = digestModule;

describe('Spider API (e2e)', () => {
  afterEach(() => jest.useRealTimers()); // a test that pins Date never leaks it
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let token = '';
  const auth = () => ({ Authorization: `Bearer ${token}` });
  // records mails instead of sending; still reports "skipped" like a mailer without SMTP
  const mails: { to: string[]; subject: string; text: string }[] = [];
  const fakeMailer = {
    isConfigured: () => false,
    send: async (m: { to: string[]; subject: string; text: string }) => {
      mails.push(m);
      return { skipped: true };
    },
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(MailerService)
      .useValue(fakeMailer)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
    // the app's cron jobs (sync checks, scans, report/alert/webhook workers) would race the
    // tests on the same tables: stop them all, the tests drive every worker explicitly
    const registry = app.get(SchedulerRegistry);
    for (const [, job] of registry.getCronJobs()) {
      job.stop();
    }
    const ds = app.get(DataSource);
    // clean slate every run, keep the schema
    await ds.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of [
      'indexing_examples',
      'indexing_trend',
      'indexing_reasons',
      'indexing_imports',
      'url_inspections',
      'tracked_urls',
      'gsc_sitemaps',
      'gsc_quota_usage',
      'webhook_deliveries',
      'webhooks',
      'alert_events',
      'alert_rules',
      'opportunity_digest_deliveries',
      'report_deliveries',
      'report_schedules',
      'reports',
      'opportunity_events',
      'opportunities',
      'opportunity_rules',
      'saved_views',
      'sync_runs',
      'dimension_metrics',
      'daily_metrics',
      'properties',
      'workspace_members',
      'password_resets',
      'users',
      'workspaces',
    ]) {
      await ds.query(`DELETE FROM \`${t}\``);
    }
    await ds.query('SET FOREIGN_KEY_CHECKS = 1');
    // seeder ran on init before cleanup → recreate the admin
    const seeder = app.get(DefaultAdminSeeder);
    await seeder.onApplicationBootstrap();
    http = request(app.getHttpServer());
  });

  // every request comes from 127.0.0.1: reset the per-IP throttle (10 logins / min) between
  // tests so the suite measures behaviour, not its own login count
  beforeEach(() => {
    // ThrottlerStorageService keeps records in `storage` and hit timestamps in a private
    // `hitExpirations` map: both must go
    const storage = app.get<{
      storage: Map<string, unknown>;
      hitExpirations?: Map<string, unknown>;
    }>(getStorageToken());
    storage.storage.clear();
    storage.hitExpirations?.clear();
  });

  afterAll(async () => {
    await app.close();
  });

  it('health is public, everything else is not', async () => {
    await http.get('/health').expect(200, { status: 'ok' });
    await http.get('/overview').expect(401);
    await http.get('/properties').expect(401);
  });

  it('rejects bad credentials and accepts the seeded admin', async () => {
    await http
      .post('/auth/login')
      .send({ email: 'e2e-admin@example.com', password: 'wrong' })
      .expect(401);
    await http
      .post('/auth/login')
      .send({ email: 'not-an-email', password: 'x' })
      .expect(400);
    const res = await http
      .post('/auth/login')
      .send({ email: 'e2e-admin@example.com', password: 'E2e-admin-pass-123' })
      .expect(200);
    token = res.body.token;
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('accepts the session cookie as well as the bearer header', async () => {
    await http
      .get('/auth/me')
      .set('Cookie', `spider_session=${token}`)
      .expect(200);
    await http
      .get('/auth/me')
      .set('Cookie', 'spider_session=garbage')
      .expect(401);
  });

  let propertyId = 0;
  it('normalizes, dedupes and lists properties', async () => {
    const created = await http
      .post('/properties')
      .set(auth())
      .send({ siteUrl: 'www.puntomira.com' })
      .expect(201);
    propertyId = created.body.property.id;
    expect(created.body.property.site_url).toBe('https://www.puntomira.com/');
    expect(created.body.property.status).toBe('pending');
    await http
      .post('/properties')
      .set(auth())
      .send({ siteUrl: 'https://www.puntomira.com/' })
      .expect(409);
    await http
      .post('/properties')
      .set(auth())
      .send({ siteUrl: 'not a url' })
      .expect(400);
    await http
      .post('/properties')
      .set(auth())
      .send({ siteUrl: 'www.x.com', extra: 1 })
      .expect(400);
    const list = await http.get('/properties').set(auth()).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.serviceAccountEmail).toContain('@');
  });

  it('checker: shared property connects and backfills; unshared stays pending', async () => {
    const unshared = await http
      .post('/properties')
      .set(auth())
      .send({ siteUrl: 'https://www.not-shared.example/' })
      .expect(201);
    const u = await http
      .post(`/properties/${unshared.body.property.id}/check`)
      .set(auth())
      .expect(200);
    expect(u.body.property.status).toBe('pending');
    expect(u.body.justConnected).toBe(false);

    const c = await http
      .post(`/properties/${propertyId}/check`)
      .set(auth())
      .expect(200);
    expect(c.body.property.status).toBe('connected');
    expect(c.body.justConnected).toBe(true);
    // backfill is fire-and-forget: poll until the run finishes
    for (let i = 0; i < 60; i += 1) {
      const d = await http
        .get(`/properties/${propertyId}`)
        .set(auth())
        .expect(200);
      if (d.body.property.last_run?.status === 'ok') break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const d = await http
      .get(`/properties/${propertyId}?start=2026-09-15&end=2026-10-12`)
      .set(auth())
      .expect(200);
    expect(d.body.property.last_run.status).toBe('ok');
    expect(d.body.property.data_since).toBe('2026-05-16');
    expect(d.body.kpi.current.clicks).toBe(237);
    expect(d.body.kpi.current.impressions).toBe(8741);
    expect(d.body.breakdowns.query.rows.length).toBeGreaterThan(0);
    expect(d.body.breakdowns.query.coverage.clicks).toBeLessThan(1);
    expect(d.body.breakdowns.country.rows[0].key).toBe('esp');
  });

  it('fleet overview reproduces the 2026-10-15 puntomira numbers and a re-sync adds no duplicates', async () => {
    const o = await http
      .get('/overview?start=2026-09-15&end=2026-10-12')
      .set(auth())
      .expect(200);
    const row = o.body.items.find((i: { id: number }) => i.id === propertyId);
    expect(row.current.clicks).toBe(237);
    expect(Math.round(row.current.ctr * 10000) / 100).toBe(2.71);
    const ds = app.get(DataSource);
    const before = await ds.query(
      'SELECT COUNT(*) n FROM daily_metrics WHERE property_id = ?',
      [propertyId],
    );
    await http.post(`/properties/${propertyId}/sync`).set(auth()).expect(202);
    for (let i = 0; i < 60; i += 1) {
      const d = await http.get(`/properties/${propertyId}`).set(auth());
      if (!d.body.property.syncing) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const after = await ds.query(
      'SELECT COUNT(*) n FROM daily_metrics WHERE property_id = ?',
      [propertyId],
    );
    expect(Number(after[0].n)).toBe(Number(before[0].n));
  });

  it('regex filters are validated and applied server-side', async () => {
    await http
      .get(`/properties/${propertyId}?days=28&include_query=(`)
      .set(auth())
      .expect(400);
    const d = await http
      .get(
        `/properties/${propertyId}?days=28&include_query=^hot&exclude_query=player`,
      )
      .set(auth())
      .expect(200);
    for (const r of d.body.breakdowns.query.rows) {
      expect(r.key).toMatch(/^hot/);
      expect(r.key).not.toMatch(/player/);
    }
    expect(d.body.breakdowns.query.filters).toEqual({
      include: '^hot',
      exclude: 'player',
    });
  });

  it('saved views CRUD', async () => {
    const v = await http
      .post('/views')
      .set(auth())
      .send({
        scope: 'property',
        property_id: propertyId,
        name: 'Hot player',
        config: { period: { days: 28 } },
      })
      .expect(201);
    await http
      .patch(`/views/${v.body.id}`)
      .set(auth())
      .send({ name: 'Hot Player renamed' })
      .expect(200);
    const list = await http
      .get(`/views?scope=property&property_id=${propertyId}`)
      .set(auth())
      .expect(200);
    expect(list.body.items.map((x: { name: string }) => x.name)).toEqual([
      'Hot Player renamed',
    ]);
    await http.get('/views/999999').set(auth()).expect(404);
  });

  it('opportunities: scan, dedupe, tracking with audit history', async () => {
    const first = await http
      .post('/opportunities/scan')
      .set(auth())
      .expect(200);
    expect(first.body.created).toBeGreaterThan(0);
    const second = await http
      .post('/opportunities/scan')
      .set(auth())
      .expect(200);
    expect(second.body.created).toBe(0);
    expect(second.body.updated).toBe(first.body.created);
    const list = await http
      .get('/opportunities?status=active')
      .set(auth())
      .expect(200);
    const id = list.body.items[0].id;
    expect(list.body.items[0].title).not.toMatch(/penalt/i);
    // MISS-0197: without page_size the full list; with it one clamped page of 10, 50 or 250
    const all = list.body.items.map((o: { id: number }) => o.id);
    expect(list.body).toMatchObject({
      total: all.length,
      page: 1,
      page_size: null,
    });
    const paged = await http
      .get('/opportunities?status=active&page_size=10')
      .set(auth())
      .expect(200);
    expect(paged.body).toMatchObject({
      total: all.length,
      page: 1,
      page_size: 10,
    });
    expect(paged.body.items.map((o: { id: number }) => o.id)).toEqual(
      all.slice(0, 10),
    );
    const lastPage = Math.max(1, Math.ceil(all.length / 10));
    const beyond = await http
      .get('/opportunities?status=active&page_size=10&page=9999')
      .set(auth())
      .expect(200);
    expect(beyond.body.page).toBe(lastPage);
    expect(beyond.body.items.map((o: { id: number }) => o.id)).toEqual(
      all.slice((lastPage - 1) * 10),
    );
    await http
      .get('/opportunities?status=active&page_size=7')
      .set(auth())
      .expect(400);
    // the scored priority depends on the fixture dates: always ask for a different one
    const priority = list.body.items[0].priority === 'high' ? 'low' : 'high';
    const upd = await http
      .patch(`/opportunities/${id}`)
      .set(auth())
      .send({
        status: 'in_progress',
        priority,
        due_date: '2026-10-22',
        note: 'looking',
      })
      .expect(200);
    expect(upd.body.events.map((e: { type: string }) => e.type)).toEqual([
      'created',
      'evidence_updated',
      'status',
      'priority',
      'due_date',
      'note',
    ]);
    await http
      .patch(`/opportunities/${id}`)
      .set(auth())
      .send({ status: 'bogus' })
      .expect(400);
    // MISS-0190: copying the AI prompt leaves one history line
    await http
      .post(`/opportunities/${id}/prompt-copied`)
      .set(auth())
      .send({ variant: 'ticket', lang: 'fr' })
      .expect(204);
    await http
      .post(`/opportunities/${id}/prompt-copied`)
      .set(auth())
      .send({ variant: 'bogus', lang: 'fr' })
      .expect(400);
    await http
      .post('/opportunities/999999/prompt-copied')
      .set(auth())
      .send({ variant: 'explain', lang: 'en' })
      .expect(404);
    const traced = await http
      .get(`/opportunities/${id}`)
      .set(auth())
      .expect(200);
    expect(traced.body.events.at(-1)).toMatchObject({
      type: 'ai_prompt_copied',
      payload: { variant: 'ticket', lang: 'fr' },
    });
    const done = await http
      .patch(`/opportunities/${id}`)
      .set(auth())
      .send({ status: 'done' })
      .expect(200);
    expect(done.body.completed_at).toBeTruthy();
    expect(done.body.impact.completed_on).toBeTruthy();
    const third = await http
      .post('/opportunities/scan')
      .set(auth())
      .expect(200);
    expect(third.body.skipped).toBeGreaterThanOrEqual(1);
    const still = await http
      .get(`/opportunities/${id}`)
      .set(auth())
      .expect(200);
    expect(still.body.status).toBe('done');
    const rules = await http
      .put('/opportunities/rules')
      .set(auth())
      .send({ window_days: 14, low_ctr: { enabled: false } })
      .expect(200);
    expect(rules.body.window_days).toBe(14);
    expect(rules.body.low_ctr.enabled).toBe(false);
  });

  it('reports: template → data/CSV/PDF reproduce the configuration; schedule dedupes per slot', async () => {
    const created = await http
      .post('/reports')
      .set(auth())
      .send({
        name: 'E2E shark',
        scope: 'property',
        property_id: propertyId,
        config: {
          period: { start: '2026-09-15', end: '2026-10-12' },
          sections: ['overview', 'queries', 'countries'],
          filters: { exclude_query: 'player' },
          limit: 10,
          notes: 'e2e',
        },
      })
      .expect(201);
    const id = created.body.id;
    const data = await http.get(`/reports/${id}/data`).set(auth()).expect(200);
    expect(data.body.period).toEqual({
      start: '2026-09-15',
      end: '2026-10-12',
    });
    // a query filter governs the whole report: KPIs are the matching query rows, not the
    // property total (237), and the countries section says why it cannot be filtered
    const filteredClicks = data.body.overview.current.clicks;
    expect(filteredClicks).toBeLessThan(237);
    expect(filteredClicks).toBeGreaterThan(0);
    expect(data.body.overview.note).toMatch(/matching query rows/);
    expect(data.body.tables.map((t: { section: string }) => t.section)).toEqual(
      ['queries', 'countries'],
    );
    expect(data.body.tables[1].rows).toEqual([]);
    expect(data.body.tables[1].note).toMatch(
      /Not available while a query filter/,
    );
    expect(data.body.tables[0].rows.length).toBeLessThanOrEqual(10);
    for (const r of data.body.tables[0].rows)
      expect(r.key).not.toMatch(/player/);
    expect(data.body.tables[0].note).toMatch(/explain \d+% of clicks/);
    const csv = await http
      .get(`/reports/${id}/export.csv?section=queries`)
      .set(auth())
      .expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.startsWith('\uFEFFquery,clicks')).toBe(true);
    await http
      .get(`/reports/${id}/export.csv?section=pages`)
      .set(auth())
      .expect(400);
    const pdf = await http
      .get(`/reports/${id}/export.pdf`)
      .set(auth())
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    expect((pdf.body as Buffer).length).toBeGreaterThan(5000);

    const sched = await http
      .post(`/reports/${id}/schedules`)
      .set(auth())
      .send({
        frequency: 'weekly',
        day: 1,
        hour: 7,
        recipients: 'a@example.com, bad, a@example.com',
      })
      .expect(201);
    expect(sched.body.recipients).toEqual(['a@example.com']);
    expect(sched.body.next_run_at).toBeTruthy();
    await http
      .post(`/reports/${id}/schedules`)
      .set(auth())
      .send({ frequency: 'weekly', recipients: 'nobody' })
      .expect(400);
    // force two due runs in the same slot: second one must be a duplicate, not a second send
    const ds = app.get(DataSource);
    await ds.query(
      'UPDATE report_schedules SET next_run_at = NOW() - INTERVAL 1 HOUR WHERE id = ?',
      [sched.body.id],
    );
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { ReportsService } = require('../src/reports/reports.service');
    const reports = app.get(ReportsService);
    const first = await reports.runDueSchedules();
    expect(first.due).toBe(1);
    expect(first.skipped + first.sent).toBe(1); // skipped without SMTP, sent with
    await ds.query(
      'UPDATE report_schedules SET next_run_at = NOW() - INTERVAL 1 HOUR WHERE id = ?',
      [sched.body.id],
    );
    const second = await reports.runDueSchedules();
    expect(second.duplicate).toBe(1);
    const deliveries = await http
      .get(`/reports/schedules/${sched.body.id}/deliveries`)
      .set(auth())
      .expect(200);
    expect(deliveries.body.items).toHaveLength(1);
    const paused = await http
      .patch(`/reports/schedules/${sched.body.id}`)
      .set(auth())
      .send({ enabled: false })
      .expect(200);
    expect(paused.body.next_run_at).toBeNull();
    await http
      .delete(`/reports/schedules/${sched.body.id}`)
      .set(auth())
      .expect(204);
  });

  it('property page exports (MISS-0171): CSV and PDF of a table for the period and filters on screen, no saved report', async () => {
    const q = 'start=2026-09-15&end=2026-10-12&exclude_query=player';
    const csv = await http
      .get(`/reports/property/${propertyId}/export.csv?section=queries&${q}`)
      .set(auth())
      .expect(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.headers['content-disposition']).toMatch(
      /attachment; filename=".+\.csv"/,
    );
    expect(csv.text.startsWith('\uFEFFquery,clicks')).toBe(true);
    const lines = csv.text.trim().split('\n').slice(1);
    expect(lines.length).toBeGreaterThan(0);
    // the server-side filter on screen applies: no excluded query in the export
    for (const l of lines) expect(l).not.toMatch(/player/);
    // the same rows the property page shows for that period and filter
    const detail = await http
      .get(`/properties/${propertyId}?${q}`)
      .set(auth())
      .expect(200);
    expect(lines.length).toBe(detail.body.breakdowns.query.rows.length);
    const countries = await http
      .get(
        `/reports/property/${propertyId}/export.csv?section=countries&start=2026-09-15&end=2026-10-12`,
      )
      .set(auth())
      .expect(200);
    expect(countries.text.startsWith('\uFEFFcountry,clicks')).toBe(true);
    const pdf = await http
      .get(`/reports/property/${propertyId}/export.pdf?section=pages&days=28`)
      .set(auth())
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    // unknown section, unknown property, no session
    await http
      .get(`/reports/property/${propertyId}/export.csv?section=users`)
      .set(auth())
      .expect(400);
    await http
      .get(`/reports/property/999999/export.csv?section=queries`)
      .set(auth())
      .expect(404);
    await http
      .get(`/reports/property/${propertyId}/export.csv?section=queries`)
      .expect(401);
  });

  it('page indexing (MITP-0833): import every reason, scopes apart, URL Inspection, opportunities, reports', async () => {
    const SITE = 'https://www.puntomira.com/';
    const overview = (
      chart: string,
      critical: string,
      extra: Record<string, string> = {},
    ) =>
      zip({
        'Chart.csv': `Date,Not indexed,Indexed,Impressions\n${chart}`,
        'Critical issues.csv': `Reason,Source,Validation,Pages\n${critical}`,
        'Non-critical issues.csv':
          'Reason,Source,Validation,Pages\n"Indexed, though blocked by robots.txt",Website,Not Started,2\n',
        'Metadata.csv': `Property,Value\nProperty,${SITE}\nSitemap filter,All known pages\n`,
        ...extra,
      });
    const upload = (buf: Buffer, filename: string) =>
      http
        .post(`/properties/${propertyId}/indexing/imports?filename=${filename}`)
        .set(auth())
        .set('Content-Type', 'application/octet-stream')
        .send(buf);

    // nothing imported yet: explicit empty state, never invented numbers
    const empty = await http
      .get(`/properties/${propertyId}/indexing`)
      .set(auth())
      .expect(200);
    expect(empty.body.report).toBeNull();
    expect(empty.body.totals).toBeNull();
    expect(empty.body.reasons).toEqual([]);

    // parser errors are controlled 400s; an export of another property is refused
    await upload(Buffer.from('not a zip, not a csv'), 'x.zip').expect(400);
    const foreign = await upload(
      zip({
        'Chart.csv': 'Date,Not indexed,Indexed\n2026-11-13,1,2\n',
        'Critical issues.csv':
          'Reason,Source,Validation,Pages\n"Not found (404)",Website,Not Started,1\n',
        'Metadata.csv':
          'Property,Value\nProperty,https://www.example.org/\nSitemap filter,All known pages\n',
      }),
      'other.zip',
    ).expect(400);
    expect(foreign.body.message).toMatch(/example\.org/);
    await http
      .post(`/properties/${propertyId}/indexing/imports`)
      .send(Buffer.from('x'))
      .expect(401);

    // first report: the baseline
    const first = await upload(
      overview(
        '2026-11-05,118,852,4000\n2026-11-06,120,850,4100\n',
        '"Crawled - currently not indexed",Google systems,Not Started,30\nAlternate page with proper canonical tag,Website,N/A,80\n',
      ),
      'baseline.zip',
    ).expect(201);
    expect(first.body.replaced).toBe(false);
    expect(first.body.import.report_date).toBe('2026-11-06');

    // second report: a new 404 reason, a new unknown reason, a new intentional one
    const latestZip = overview(
      '2026-11-12,124,848,3900\n2026-11-13,130,845,4000\n',
      '"Not found (404)",Website,Not Started,10\nAlternate page with proper canonical tag,Website,N/A,85\n"Crawled - currently not indexed",Google systems,Not Started,30\n"Brand new reason Google invented",Google systems,Not Started,5\nExcluded by ‘noindex’ tag,Website,N/A,7\n',
    );
    const second = await upload(latestZip, 'latest.zip').expect(201);
    expect(second.body.import.reason_rows).toBe(6);
    expect(second.body.opportunities.created).toBeGreaterThan(0);

    const page = await http
      .get(`/properties/${propertyId}/indexing`)
      .set(auth())
      .expect(200);
    expect(page.body.scope).toEqual({ scope: 'all_known', scope_detail: null });
    expect(page.body.report).toMatchObject({
      report_date: '2026-11-13',
      source: 'gsc_export',
    });
    // totals reconcile with the file, previous = the report imported before
    expect(page.body.totals).toMatchObject({
      indexed: 845,
      not_indexed: 130,
      previous_indexed: 850,
      previous_not_indexed: 120,
    });
    expect(page.body.trend).toHaveLength(2);
    type ReasonRow = {
      reason: string;
      reason_hash: string;
      pages: number;
      previous_pages: number | null;
      is_new: boolean;
      intent: string;
      source: string;
      group: string;
    };
    const reasons = page.body.reasons as ReasonRow[];
    expect(reasons).toHaveLength(6);
    const nf = reasons.find((r) => r.reason === 'Not found (404)')!;
    expect(nf).toMatchObject({
      pages: 10,
      previous_pages: 0,
      is_new: true,
      intent: 'likely_defect',
      source: 'Website',
      group: 'not_indexed',
    });
    // a reason Spider has never heard of is stored and shown as reported
    expect(
      reasons.find((r) => r.reason === 'Brand new reason Google invented'),
    ).toMatchObject({ pages: 5, intent: 'review' });
    expect(
      reasons.find((r) => r.reason.startsWith('Alternate page')),
    ).toMatchObject({ pages: 85, previous_pages: 80, intent: 'intentional' });

    // re-uploading the same report replaces it: nothing doubles
    const again = await upload(latestZip, 'latest.zip').expect(201);
    expect(again.body.replaced).toBe(true);
    const after = await http
      .get(`/properties/${propertyId}/indexing`)
      .set(auth())
      .expect(200);
    expect(after.body.reasons).toHaveLength(6);
    expect(after.body.totals.indexed).toBe(845);
    expect(
      after.body.imports.filter(
        (i: { report_kind: string }) => i.report_kind === 'overview',
      ),
    ).toHaveLength(2);

    // another view is stored apart and never mixed into All known pages
    await upload(
      zip({
        'Chart.csv': 'Date,Not indexed,Indexed\n2026-11-13,3,40\n',
        'Critical issues.csv':
          'Reason,Source,Validation,Pages\n"Not found (404)",Website,Not Started,3\n',
        'Metadata.csv': `Property,Value\nProperty,${SITE}\nSitemap filter,All submitted pages\n`,
      }),
      'submitted.zip',
    ).expect(201);
    const submitted = await http
      .get(`/properties/${propertyId}/indexing?scope=submitted`)
      .set(auth())
      .expect(200);
    expect(submitted.body.totals).toMatchObject({
      indexed: 40,
      not_indexed: 3,
    });
    expect(submitted.body.reasons).toHaveLength(1);
    const allKnown = await http
      .get(`/properties/${propertyId}/indexing`)
      .set(auth())
      .expect(200);
    expect(allKnown.body.totals.indexed).toBe(845);
    expect(
      allKnown.body.scopes.map((s: { scope: string }) => s.scope).sort(),
    ).toEqual(['all_known', 'submitted']);

    // the reason's own export brings its example URLs
    const examples = Array.from(
      { length: 10 },
      (_, i) => `${SITE}gone-${i}/,2026-11-0${(i % 9) + 1}`,
    ).join('\n');
    const issue = await upload(
      zip({
        'Chart.csv': 'Date,Affected pages\n2026-11-12,9\n2026-11-13,10\n',
        'Table.csv': `URL,Last crawled\n${examples}\n`,
        'Metadata.csv': `Property,Value\nProperty,${SITE}\nIssue,Not found (404)\nLast updated,"Nov 13, 2026"\n`,
      }),
      'not-found.zip',
    ).expect(201);
    expect(issue.body.import).toMatchObject({
      report_kind: 'issue',
      example_rows: 10,
      examples_partial: false,
    });
    const detail = await http
      .get(`/properties/${propertyId}/indexing/reasons/${nf.reason_hash}`)
      .set(auth())
      .expect(200);
    expect(detail.body).toMatchObject({
      reason: 'Not found (404)',
      intent: 'likely_defect',
      first_seen: '2026-11-13',
    });
    expect(detail.body.examples).toHaveLength(10);
    expect(detail.body.examples[0].inspect_link).toMatch(
      /search\.google\.com\/search-console\/inspect/,
    );
    expect(detail.body.history).toEqual([
      { report_date: '2026-11-13', pages: 10, validation: 'Not Started' },
    ]);
    await http
      .get(`/properties/${propertyId}/indexing/reasons/nope`)
      .set(auth())
      .expect(400);
    await http
      .get(`/properties/${propertyId}/indexing/reasons/${'0'.repeat(32)}`)
      .set(auth())
      .expect(404);

    // opportunities: one per defect / unknown reason, none for intentional exclusions, no dupes
    const opps = async () =>
      (
        await http
          .get(`/opportunities?status=active&property_id=${propertyId}`)
          .set(auth())
          .expect(200)
      ).body.items as {
        rule: string;
        key_text: string;
        evidence: Record<string, unknown>;
      }[];
    const newReason = (await opps()).filter(
      (o) => o.rule === 'indexing_new_reason',
    );
    expect(newReason.map((o) => o.key_text).sort()).toEqual([
      'Brand new reason Google invented',
      'Not found (404)',
    ]);
    const nfOpp = newReason.find((o) => o.key_text === 'Not found (404)')!;
    expect(nfOpp.evidence).toMatchObject({
      source: 'gsc_export',
      scope: 'all_known',
      report_date: '2026-11-13',
      previous_report_date: '2026-11-06',
      pages: 10,
      previous_pages: 0,
    });
    expect((nfOpp.evidence.examples as string[]).length).toBe(10);
    const indexingCount = (list: { rule: string }[]) =>
      list.filter((o) => o.rule.startsWith('index')).length;
    const before = indexingCount(await opps());
    await http.post('/opportunities/scan').set(auth()).expect(200);
    expect(indexingCount(await opps())).toBe(before);
    expect(
      (await opps()).some((o) => /Alternate page|noindex/.test(o.key_text)),
    ).toBe(false);

    // URL Inspection: one URL on demand, stored with its raw answer and counted against quota
    const inspected = await http
      .post(`/properties/${propertyId}/indexing/inspect`)
      .set(auth())
      .send({ url: `${SITE}pricing/` })
      .expect(200);
    expect(inspected.body).toMatchObject({
      url: `${SITE}pricing/`,
      source: 'url_inspection_api',
    });
    expect(inspected.body.latest).toMatchObject({
      coverage_state: 'URL is unknown to Google',
      verdict: 'NEUTRAL',
    });
    expect(inspected.body.latest.raw).toBeTruthy();
    expect(inspected.body.latest.inspected_at).toBeTruthy();
    await http
      .post(`/properties/${propertyId}/indexing/inspect`)
      .set(auth())
      .send({ url: 'https://www.example.org/x/' })
      .expect(400);
    await http
      .post(`/properties/${propertyId}/indexing/inspect`)
      .set(auth())
      .send({ url: 'not a url' })
      .expect(400);
    const urlDetail = await http
      .get(`/properties/${propertyId}/indexing/urls/${inspected.body.url_hash}`)
      .set(auth())
      .expect(200);
    expect(urlDetail.body.history).toHaveLength(1);
    expect(urlDetail.body.tracked.user_added).toBe(true);

    // background refresh: inventory + inspections within the daily budget
    await http
      .post(`/properties/${propertyId}/indexing/refresh`)
      .set(auth())
      .expect(202);
    let summary = (
      await http.get(`/properties/${propertyId}/indexing`).set(auth())
    ).body.inspection;
    for (let i = 0; i < 100 && (summary.running || !summary.last_run); i += 1) {
      await new Promise((r) => setTimeout(r, 200));
      summary = (
        await http.get(`/properties/${propertyId}/indexing`).set(auth())
      ).body.inspection;
    }
    expect(summary.running).toBe(false);
    expect(['ok', 'partial']).toContain(summary.last_run.status);
    // fixture: one submitted sitemap with 6 URLs of the property (a foreign URL is ignored)
    expect(summary.last_run.details).toMatchObject({
      sitemaps: 1,
      sitemap_urls: 6,
      stop_reason: null,
    });
    // every page Search Analytics ever reported is tracked, not only the last 28 days
    expect(summary.last_run.details.gsc_pages).toBeGreaterThan(0);
    expect(summary.last_run.details.inspected).toBeGreaterThan(6);
    expect(summary.sitemaps).toHaveLength(1);
    expect(summary.sitemaps[0]).toMatchObject({
      path: `${SITE}sitemap.xml`,
      urls_read: 6,
      urls_truncated: false,
    });
    // 6 sitemap URLs + the on-demand one + the 10 example URLs of the imported 404 export
    expect(summary.tracked_urls).toBeGreaterThanOrEqual(17);
    expect(summary.inspected_urls).toBe(summary.tracked_urls);
    expect(summary.indexed_urls).toBe(4);
    const exampleUrls = await http
      .get(`/properties/${propertyId}/indexing/urls?search=gone-`)
      .set(auth())
      .expect(200);
    expect(exampleUrls.body.total).toBe(10);
    // GSC-style rows per page (MISS-0195): 10 by default, 10 / 50 / 250 only
    expect(exampleUrls.body.page_size).toBe(10);
    expect(exampleUrls.body.items).toHaveLength(10);
    const firstTen = await http
      .get(`/properties/${propertyId}/indexing/urls`)
      .set(auth())
      .expect(200);
    expect(firstTen.body).toMatchObject({ page: 1, page_size: 10 });
    expect(firstTen.body.items).toHaveLength(10);
    const secondTen = await http
      .get(`/properties/${propertyId}/indexing/urls?page=2&page_size=10`)
      .set(auth())
      .expect(200);
    expect(secondTen.body.items.length).toBe(
      Math.min(10, firstTen.body.total - 10),
    );
    expect(
      secondTen.body.items.some((u: { url_hash: string }) =>
        firstTen.body.items.some(
          (f: { url_hash: string }) => f.url_hash === u.url_hash,
        ),
      ),
    ).toBe(false);
    const fifty = await http
      .get(`/properties/${propertyId}/indexing/urls?page_size=50`)
      .set(auth())
      .expect(200);
    expect(fifty.body.page_size).toBe(50);
    expect(fifty.body.items).toHaveLength(Math.min(50, fifty.body.total));
    for (const bad of ['100', '0', 'abc']) {
      await http
        .get(`/properties/${propertyId}/indexing/urls?page_size=${bad}`)
        .set(auth())
        .expect(400);
    }
    expect(
      summary.by_coverage.find(
        (c: { coverage_state: string }) =>
          c.coverage_state === 'Not found (404)',
      ),
    ).toMatchObject({ urls: 1, verdict: 'FAIL' });
    // sitemap URLs Google does not index become ONE finding per coverage state
    await http.post('/opportunities/scan').set(auth()).expect(200);
    const notIndexed = (await opps()).filter(
      (o) => o.rule === 'submitted_not_indexed',
    );
    expect(notIndexed.map((o) => o.key_text).sort()).toEqual([
      'Sitemap URLs · Crawled - currently not indexed',
      'Sitemap URLs · Not found (404)',
    ]);
    expect(notIndexed[0].evidence).toMatchObject({
      source: 'url_inspection_api',
      pages: 1,
      sitemaps: [`${SITE}sitemap.xml`],
    });
    // critical reasons on tracked pages that are in no sitemap: one finding per reason (MISS-0194)
    const otherReasons = (await opps()).filter(
      (o) => o.rule === 'not_indexed_reason',
    );
    const unknownOpp = otherReasons.find(
      (o) => o.key_text === 'URL is unknown to Google',
    )!;
    expect(unknownOpp).toBeDefined();
    expect(unknownOpp.evidence).toMatchObject({
      source: 'url_inspection_api',
      scope: 'not_in_sitemap',
    });
    expect(unknownOpp.evidence.pages).toBeGreaterThanOrEqual(10);
    // a second scan refreshes the same items instead of duplicating them
    await http.post('/opportunities/scan').set(auth()).expect(200);
    expect(
      (await opps()).filter((o) => o.rule === 'not_indexed_reason'),
    ).toHaveLength(otherReasons.length);
    const notFoundUrls = await http
      .get(
        `/properties/${propertyId}/indexing/urls?coverage=${encodeURIComponent('Not found (404)')}&in_sitemap=1`,
      )
      .set(auth())
      .expect(200);
    expect(notFoundUrls.body.total).toBe(1);
    expect(summary.inspected_urls).toBeLessThanOrEqual(summary.tracked_urls);
    expect(summary.used_today).toBeLessThanOrEqual(summary.daily_budget);
    expect(summary.used_today).toBeGreaterThanOrEqual(summary.inspected_urls);
    const urls = await http
      .get(`/properties/${propertyId}/indexing/urls?search=pricing`)
      .set(auth())
      .expect(200);
    expect(urls.body.source).toBe('url_inspection_api');
    expect(
      urls.body.items.some((u: { url: string }) => u.url === `${SITE}pricing/`),
    ).toBe(true);

    // refresh of every connected property: background, one at a time, no double start
    await http.post('/indexing/refresh').expect(401);
    const all = await http.post('/indexing/refresh').set(auth()).expect(202);
    expect(all.body.started).toBe(true);
    expect(all.body.properties).toBeGreaterThan(0);
    let batch: unknown = true;
    for (let i = 0; i < 150 && batch; i += 1) {
      await new Promise((r) => setTimeout(r, 200));
      batch = (await http.get('/indexing/overview').set(auth())).body.batch;
    }
    expect(batch).toBeNull();

    // the report rebuilt from URL Inspection alone (no upload): same shape as Search Console's screen
    const live = (
      await http
        .get(`/properties/${propertyId}/indexing`)
        .set(auth())
        .expect(200)
    ).body.live;
    expect(live.source).toBe('url_inspection_api');
    expect(live.inspected_urls).toBe(live.tracked_urls);
    expect(live.totals).toEqual({
      indexed: 4,
      not_indexed: live.inspected_urls - 4,
    });
    expect(live.trend[live.trend.length - 1]).toMatchObject(live.totals);
    const liveNotFound = live.reasons.find(
      (r: { reason: string }) => r.reason === 'Not found (404)',
    );
    expect(liveNotFound).toMatchObject({
      pages: 1,
      source: 'Website',
      group: 'not_indexed',
      validation: null,
    });
    expect(liveNotFound.trend[liveNotFound.trend.length - 1].pages).toBe(1);
    // each reason of the table links to the opportunities raised from it (MISS-0194)
    expect(liveNotFound.opportunities).toEqual([
      expect.objectContaining({
        rule: 'submitted_not_indexed',
        status: 'open',
      }),
    ]);
    expect(
      live.reasons.find(
        (r: { reason: string }) => r.reason === 'URL is unknown to Google',
      ).opportunities,
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'not_indexed_reason' }),
      ]),
    );
    expect(
      live.reasons.find(
        (r: { reason: string }) =>
          r.reason === 'Crawled - currently not indexed',
      ),
    ).toMatchObject({ pages: 1, source: 'Google systems' });
    // imported reasons carry their own trend across reports
    expect(allKnown.body.reasons[0].trend.length).toBeGreaterThan(0);

    // fleet table
    const fleet = await http.get('/indexing/overview').set(auth()).expect(200);
    const row = fleet.body.items.find(
      (r: { property: { id: number } }) => r.property.id === propertyId,
    );
    expect(row).toMatchObject({
      report_date: '2026-11-13',
      indexed: 845,
      not_indexed: 130,
      previous_indexed: 850,
    });
    expect(row.running).toBe(false);
    // automatic totals of the fleet table; every not-indexed state of the fixtures is critical
    // (404, crawled-not-indexed, unknown to Google)
    expect(row.live.indexed).toBe(4);
    expect(row.live.critical).toBe(row.live.not_indexed);
    expect(row.live.not_indexed).toBe(row.tracked_urls - 4);
    expect(
      fleet.body.reasons.find(
        (r: { reason: string }) => r.reason === 'Not found (404)',
      ),
    ).toMatchObject({ pages: 1, intent: 'likely_defect' });
    expect(row.top_defect.reason).toBe('Crawled - currently not indexed');
    // 30 crawled-not-indexed + 10 not found + 2 indexed though blocked by robots.txt
    expect(row.defect_pages).toBe(42);

    // exports state the view, report date, source and completeness on every row
    const csv = await http
      .get(`/reports/property/${propertyId}/export.csv?section=indexing`)
      .set(auth())
      .expect(200);
    // trim() also drops the BOM; rows end with CRLF
    const lines = csv.text.trim().split(/\r?\n/);
    expect(lines[0]).toBe(
      'site,view,report_date,source,completeness,row_type,group,reason,reason_source,classification,validation,pages,pages_previous_report,first_seen_in_spider',
    );
    // imported report rows, then the automatic (URL Inspection) rows: each row says which
    const imported = lines
      .slice(1)
      .filter((l) => l.includes(',All known pages,'));
    const automatic = lines
      .slice(1)
      .filter((l) => l.includes(',Tracked URLs (automatic),'));
    expect(imported).toHaveLength(2 + 6);
    expect(automatic.length).toBeGreaterThan(2);
    expect(imported.length + automatic.length).toBe(lines.length - 1);
    for (const l of imported) {
      expect(l).toContain(`${SITE},All known pages,2026-11-13,`);
      expect(l).toMatch(/uploaded export/);
      expect(l).toMatch(/capped at 1,000 rows/);
    }
    for (const l of automatic) {
      expect(l).toMatch(/Google URL Inspection API \(automatic\)/);
      expect(l).toMatch(/tracked URLs inspected/);
    }
    expect(automatic.some((l) => /,total,indexed,Indexed,,,,4,,/.test(l))).toBe(
      true,
    );
    expect(
      lines.some((l) => /,total,indexed,Indexed,,,,845,850,/.test(l)),
    ).toBe(true);
    expect(
      lines.some((l) =>
        /,reason,not_indexed,Not found \(404\),Website,likely_defect,Not Started,10,0,2026-11-13/.test(
          l,
        ),
      ),
    ).toBe(true);
    const subCsv = await http
      .get(
        `/reports/property/${propertyId}/export.csv?section=indexing&scope=submitted`,
      )
      .set(auth())
      .expect(200);
    expect(subCsv.text).toContain('All submitted pages');
    expect(subCsv.text).not.toContain('845');
    const trendCsv = await http
      .get(`/reports/property/${propertyId}/export.csv?section=indexing_trend`)
      .set(auth())
      .expect(200);
    expect(trendCsv.text.trim().split(/\r?\n/)).toHaveLength(3);
    expect(trendCsv.text).toContain('2026-11-13,845,130');

    const report = await http
      .post('/reports')
      .set(auth())
      .send({
        name: 'E2E indexing',
        scope: 'property',
        property_id: propertyId,
        config: { period: { days: 28 }, sections: ['indexing'], limit: 50 },
      })
      .expect(201);
    const data = await http
      .get(`/reports/${report.body.id}/data`)
      .set(auth())
      .expect(200);
    expect(data.body.indexing.blocks).toHaveLength(1);
    expect(data.body.indexing.blocks[0]).toMatchObject({
      view: 'All known pages',
      report_date: '2026-11-13',
      totals: { indexed: 845, not_indexed: 130 },
    });
    expect(data.body.indexing.blocks[0].completeness).toMatch(/URL Inspection/);
    expect(
      data.body.indexing.opportunities.some((o: { title: string }) =>
        /Not found \(404\)/.test(o.title),
      ),
    ).toBe(true);
    const pdf = await http
      .get(`/reports/${report.body.id}/export.pdf`)
      .set(auth())
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect((pdf.body as Buffer).subarray(0, 5).toString()).toBe('%PDF-');
    const fleetReport = await http
      .post('/reports')
      .set(auth())
      .send({
        name: 'E2E indexing fleet',
        scope: 'fleet',
        config: { period: { days: 28 }, sections: ['indexing'] },
      })
      .expect(201);
    const fleetCsv = await http
      .get(`/reports/${fleetReport.body.id}/export.csv?section=indexing`)
      .set(auth())
      .expect(200);
    expect(fleetCsv.text).toContain('Not found (404)');
    await http.delete(`/reports/${report.body.id}`).set(auth()).expect(204);
    await http
      .delete(`/reports/${fleetReport.body.id}`)
      .set(auth())
      .expect(204);

    // deleting an import removes its rows; unknown ids are 404
    await http
      .delete(
        `/properties/${propertyId}/indexing/imports/${issue.body.import.id}`,
      )
      .set(auth())
      .expect(204);
    const noExamples = await http
      .get(`/properties/${propertyId}/indexing/reasons/${nf.reason_hash}`)
      .set(auth())
      .expect(200);
    expect(noExamples.body.examples).toEqual([]);
    expect(noExamples.body.issue_export).toBeNull();
    await http
      .delete(`/properties/${propertyId}/indexing/imports/999999`)
      .set(auth())
      .expect(404);
  });

  it('webhooks: signed delivery to a local receiver, dedupe, deliveries log, alerts through webhook', async () => {
    const received: {
      event: string;
      sigOk: boolean;
      body: Record<string, unknown>;
    }[] = [];
    let secret = '';
    const server = nodeHttp.createServer((req, res) => {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        const header = String(req.headers['x-spider-signature'] ?? '');
        const parts = Object.fromEntries(
          header.split(',').map((kv) => kv.split('=')),
        );
        const expected = createHmac('sha256', secret)
          .update(`${parts.t}.${raw}`)
          .digest('hex');
        received.push({
          event: String(req.headers['x-spider-event']),
          sigOk: expected === parts.v1,
          body: JSON.parse(raw),
        });
        res.writeHead(200);
        res.end('ok');
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
    const port = (server.address() as { port: number }).port;
    try {
      const hook = await http
        .post('/webhooks')
        .set(auth())
        .send({
          name: 'e2e',
          url: `http://127.0.0.1:${port}/hook`,
          events: ['test', 'alert.triggered'],
        })
        .expect(201);
      secret = hook.body.secret;
      expect(secret.startsWith('whsec_')).toBe(true);
      const list = await http.get('/webhooks').set(auth()).expect(200);
      expect(list.body.items[0].secret).toBeUndefined();
      const test = await http
        .post(`/webhooks/${hook.body.id}/test`)
        .set(auth())
        .expect(200);
      expect(test.body.status).toBe('ok');
      expect(received).toHaveLength(1);
      expect(received[0].sigOk).toBe(true);
      expect(received[0].body.workspace).toEqual(
        expect.objectContaining({ slug: 'missiria' }),
      );

      // alert rule → webhook; evaluate twice → second run is fully deduped
      await http
        .post('/alerts')
        .set(auth())
        .send({
          name: 'e2e high',
          channel: 'webhook',
          target: hook.body.id,
          config: { opportunity_priorities: ['high', 'medium', 'low'] },
        })
        .expect(201);
      const ev1 = await http.post('/alerts/evaluate').set(auth()).expect(200);
      expect(ev1.body.sent).toBeGreaterThan(0);
      const ev2 = await http.post('/alerts/evaluate').set(auth()).expect(200);
      expect(ev2.body.sent).toBe(0);
      // the in-process 5-minute cron may be draining the same queue: flush until nothing is pending
      for (let i = 0; i < 5; i += 1) {
        await http.post('/webhooks/process').set(auth()).expect(200);
        const pending = (
          await http.get(`/webhooks/${hook.body.id}/deliveries`).set(auth())
        ).body.items.filter((d: { status: string }) => d.status === 'pending');
        if (!pending.length) break;
        await new Promise((r) => setTimeout(r, 300));
      }
      const deliveries = await http
        .get(`/webhooks/${hook.body.id}/deliveries`)
        .set(auth())
        .expect(200);
      const alerts = deliveries.body.items.filter(
        (d: { event: string }) => d.event === 'alert.triggered',
      );
      expect(alerts).toHaveLength(ev1.body.sent);
      expect(
        deliveries.body.items.every(
          (d: { status: string }) => d.status === 'ok',
        ),
      ).toBe(true);
      expect(
        received.filter((r) => r.event === 'alert.triggered' && r.sigOk),
      ).toHaveLength(ev1.body.sent);
      await http
        .post('/webhooks')
        .set(auth())
        .send({ name: 'bad', url: 'ftp://x', events: ['test'] })
        .expect(400);
    } finally {
      await new Promise<void>((r) => server.close(() => r()));
    }
  });

  it('admin invites a member; the member cannot invite; profile updates are own-only', async () => {
    const inv = await http
      .post('/users')
      .set(auth())
      .send({ email: 'member@example.com', name: 'Member' })
      .expect(201);
    expect(inv.body.temporary_password.length).toBeGreaterThan(16);
    const login = await http
      .post('/auth/login')
      .send({
        email: 'member@example.com',
        password: inv.body.temporary_password,
      })
      .expect(200);
    await http
      .post('/users')
      .set({ Authorization: `Bearer ${login.body.token}` })
      .send({ email: 'x@example.com', name: 'X' })
      .expect(403);
    await http
      .patch('/auth/me')
      .set({ Authorization: `Bearer ${login.body.token}` })
      .send({ name: 'Renamed Member' })
      .expect(200);
    await http
      .patch('/auth/me')
      .set({ Authorization: `Bearer ${login.body.token}` })
      .send({ email: 'e2e-admin@example.com' })
      .expect(409);
    await http.delete(`/users/${login.body.user.id}`).set(auth()).expect(204);
    await http
      .post('/auth/login')
      .send({
        email: 'member@example.com',
        password: inv.body.temporary_password,
      })
      .expect(401);
    // re-invite = reactivation with a new password; the old password stays dead
    const again = await http
      .post('/users')
      .set(auth())
      .send({ email: 'member@example.com', name: 'Member' })
      .expect(201);
    expect(again.body.user.id).toBe(login.body.user.id);
    await http
      .post('/auth/login')
      .send({
        email: 'member@example.com',
        password: inv.body.temporary_password,
      })
      .expect(401);
    await http
      .post('/auth/login')
      .send({
        email: 'member@example.com',
        password: again.body.temporary_password,
      })
      .expect(200);
    await http
      .post('/users')
      .set(auth())
      .send({ email: 'member@example.com', name: 'Member' })
      .expect(409);
  });

  // ---- MISS-0110 ---------------------------------------------------------

  it('sessions: deactivation, revocation, deletion and role changes apply to already-issued tokens', async () => {
    const inv = await http
      .post('/users')
      .set(auth())
      .send({ email: 'revoke@example.com', name: 'Revoke', role: 'admin' })
      .expect(201);
    const login = () =>
      http
        .post('/auth/login')
        .send({
          email: 'revoke@example.com',
          password: inv.body.temporary_password,
        })
        .expect(200)
        .then((r) => r.body.token as string);
    const as = (t: string) => ({ Authorization: `Bearer ${t}` });
    const ds = app.get(DataSource);

    // 1. revoke sessions → old token dead for reads, writes and admin routes; new login works
    let t1 = await login();
    await http.get('/properties').set(as(t1)).expect(200);
    await http
      .post(`/users/${inv.body.user.id}/revoke-sessions`)
      .set(auth())
      .expect(204);
    await http.get('/properties').set(as(t1)).expect(401);
    await http.post('/opportunities/scan').set(as(t1)).expect(401);
    await http
      .post('/users')
      .set(as(t1))
      .send({ email: 'z@example.com', name: 'Z' })
      .expect(401);
    t1 = await login();
    await http.get('/properties').set(as(t1)).expect(200);

    // 2. demotion in the database → admin route refused with the old token (role read per request)
    await ds.query(`UPDATE users SET role = 'member' WHERE id = ?`, [
      inv.body.user.id,
    ]);
    await http
      .post('/users')
      .set(as(t1))
      .send({ email: 'z@example.com', name: 'Z' })
      .expect(403);

    // 3. self "sign out everywhere"
    await http.post('/auth/revoke-sessions').set(as(t1)).expect(204);
    await http.get('/auth/me').set(as(t1)).expect(401);

    // 4. deactivation kills a live token, through the cookie as well
    const t2 = await login();
    await http.delete(`/users/${inv.body.user.id}`).set(auth()).expect(204);
    await http.get('/properties').set(as(t2)).expect(401);
    await http
      .get('/auth/me')
      .set('Cookie', `spider_session=${t2}`)
      .expect(401);

    // 5. a deleted user's token is rejected
    await ds.query(`UPDATE users SET is_active = 1 WHERE id = ?`, [
      inv.body.user.id,
    ]);
    const t3 = await login();
    await ds.query(`DELETE FROM users WHERE id = ?`, [inv.body.user.id]);
    await http.get('/properties').set(as(t3)).expect(401);
  });

  it('sign-out ends that token only; the members list shows presence (MISS-0199)', async () => {
    const inv = await http
      .post('/users')
      .set(auth())
      .send({ email: 'presence@example.com', name: 'Presence' })
      .expect(201);
    const memberId = inv.body.user.id as number;
    const login = () =>
      http
        .post('/auth/login')
        .set('User-Agent', 'e2e-browser')
        .send({
          email: 'presence@example.com',
          password: inv.body.temporary_password,
        })
        .expect(200)
        .then((r) => r.body.token as string);
    const as = (t: string) => ({ Authorization: `Bearer ${t}` });
    const presenceOf = async () => {
      const r = await http.get('/users').set(auth()).expect(200);
      expect(r.body.presence_timeout_ms).toBe(5 * 60_000);
      return r.body.items.find((u: { id: number }) => u.id === memberId)
        .presence as {
        online: boolean;
        last_seen_at: string | null;
        sessions: number;
      };
    };

    // never signed in: listed, offline, no last seen
    expect(await presenceOf()).toEqual({
      online: false,
      last_seen_at: null,
      sessions: 0,
    });

    // two devices
    const laptop = await login();
    const phone = await login();
    await http.get('/auth/me').set(as(laptop)).expect(200);
    expect(await presenceOf()).toMatchObject({ online: true, sessions: 2 });
    const ds = app.get(DataSource);
    const [row] = await ds.query(
      `SELECT user_agent FROM user_sessions WHERE user_id = ? LIMIT 1`,
      [memberId],
    );
    expect(row.user_agent).toBe('e2e-browser');

    // signing out the laptop kills that token (bearer and cookie), the phone stays signed in
    await http.post('/auth/logout').set(as(laptop)).expect(204);
    await http.get('/auth/me').set(as(laptop)).expect(401);
    await http
      .get('/auth/me')
      .set('Cookie', `spider_session=${laptop}`)
      .expect(401);
    await http.get('/auth/me').set(as(phone)).expect(200);
    expect(await presenceOf()).toMatchObject({ online: true, sessions: 1 });

    // last device signs out → offline at once, still a member, last seen kept
    await http.post('/auth/logout').set(as(phone)).expect(204);
    const after = await presenceOf();
    expect(after.online).toBe(false);
    expect(after.last_seen_at).not.toBeNull();

    // idle past the timeout → offline without signing out
    const idle = await login();
    expect((await presenceOf()).online).toBe(true);
    await ds.query(
      `UPDATE user_sessions SET last_seen_at = NOW() - INTERVAL 6 MINUTE WHERE user_id = ?`,
      [memberId],
    );
    expect((await presenceOf()).online).toBe(false);
    // …and comes back on the next request (touch rewrites last_seen_at)
    await http.get('/auth/me').set(as(idle)).expect(200);
    expect((await presenceOf()).online).toBe(true);

    // admin "sign out everywhere" → offline on the very next list
    await http
      .post(`/users/${memberId}/revoke-sessions`)
      .set(auth())
      .expect(204);
    expect((await presenceOf()).online).toBe(false);
    await http.get('/auth/me').set(as(idle)).expect(401);
  });

  it('tenancy: a second workspace cannot list, read, mutate, assign, delete or export the first one', async () => {
    const workspaces = app.get(WorkspacesService);
    const users = app.get(UsersService);
    const wsB = await workspaces.create('tenant-b', 'Tenant B');
    await users.create({
      email: 'b-admin@example.com',
      password: 'Tenant-b-pass-123',
      name: 'B admin',
      role: 'admin',
      workspaceId: wsB.id,
    });
    const b = await http
      .post('/auth/login')
      .send({ email: 'b-admin@example.com', password: 'Tenant-b-pass-123' })
      .expect(200);
    const asB = { Authorization: `Bearer ${b.body.token}` };

    // A's objects
    const viewA = await http
      .post('/views')
      .set(auth())
      .send({ scope: 'fleet', name: 'A view', config: { period: { days: 7 } } })
      .expect(201);
    const oppA = (
      await http.get('/opportunities?status=all').set(auth()).expect(200)
    ).body.items[0];
    expect(oppA).toBeTruthy();
    const reportA = await http
      .post('/reports')
      .set(auth())
      .send({
        name: 'A report',
        scope: 'property',
        property_id: propertyId,
        config: { period: { days: 28 }, sections: ['overview'] },
      })
      .expect(201);
    const hookA = await http
      .post('/webhooks')
      .set(auth())
      .send({
        name: 'A hook',
        url: 'http://127.0.0.1:9/x',
        events: ['opportunity.created'],
      })
      .expect(201);

    // list: nothing of A
    expect(
      (await http.get('/properties').set(asB).expect(200)).body.items,
    ).toEqual([]);
    expect(
      (await http.get('/overview').set(asB).expect(200)).body.items,
    ).toEqual([]);
    expect((await http.get('/views').set(asB).expect(200)).body.items).toEqual(
      [],
    );
    expect(
      (await http.get('/opportunities?status=all').set(asB).expect(200)).body
        .items,
    ).toEqual([]);
    expect(
      (await http.get('/reports').set(asB).expect(200)).body.items,
    ).toEqual([]);
    expect(
      (await http.get('/webhooks').set(asB).expect(200)).body.items,
    ).toEqual([]);
    const usersB = (await http.get('/users').set(asB).expect(200)).body.items;
    expect(usersB.map((u: { email: string }) => u.email)).toEqual([
      'b-admin@example.com',
    ]);
    const healthB = (await http.get('/settings/health').set(asB).expect(200))
      .body;
    expect(healthB.properties.total).toBe(0);
    expect(healthB.failed_runs).toEqual([]);
    expect(
      (await http.get('/settings').set(asB).expect(200)).body.workspace.slug,
    ).toBe('tenant-b');

    // read / export
    await http.get(`/properties/${propertyId}`).set(asB).expect(404);
    await http
      .get(`/reports/property/${propertyId}/export.csv?section=queries`)
      .set(asB)
      .expect(404);
    await http
      .get(`/reports/property/${propertyId}/export.pdf?section=queries`)
      .set(asB)
      .expect(404);
    await http.get(`/opportunities/${oppA.id}`).set(asB).expect(404);
    await http.get(`/reports/${reportA.body.id}/data`).set(asB).expect(404);
    await http
      .get(`/reports/${reportA.body.id}/export.csv`)
      .set(asB)
      .expect(404);
    await http
      .get(`/reports/${reportA.body.id}/export.pdf`)
      .set(asB)
      .expect(404);
    await http
      .get(`/webhooks/${hookA.body.id}/deliveries`)
      .set(asB)
      .expect(404);

    // mutate / delete / sync
    await http
      .patch(`/views/${viewA.body.id}`)
      .set(asB)
      .send({ name: 'pwned' })
      .expect(404);
    await http.delete(`/views/${viewA.body.id}`).set(asB).expect(404);
    await http
      .patch(`/opportunities/${oppA.id}`)
      .set(asB)
      .send({ status: 'dismissed' })
      .expect(404);
    await http
      .post(`/opportunities/${oppA.id}/prompt-copied`)
      .set(asB)
      .send({ variant: 'explain', lang: 'en' })
      .expect(404);
    await http.post(`/properties/${propertyId}/sync`).set(asB).expect(404);
    await http.post(`/properties/${propertyId}/check`).set(asB).expect(404);
    await http.delete(`/properties/${propertyId}`).set(asB).expect(404);
    await http.delete(`/reports/${reportA.body.id}`).set(asB).expect(404);
    await http.delete(`/webhooks/${hookA.body.id}`).set(asB).expect(404);
    await http.post(`/webhooks/${hookA.body.id}/test`).set(asB).expect(404);
    // create pointing at A's property
    await http
      .post('/views')
      .set(asB)
      .send({
        scope: 'property',
        property_id: propertyId,
        name: 'x',
        config: {},
      })
      .expect(404);
    await http
      .post('/reports')
      .set(asB)
      .send({
        name: 'x',
        scope: 'property',
        property_id: propertyId,
        config: {},
      })
      .expect(404);
    // users of another workspace
    const bUserId = usersB[0].id;
    await http.delete(`/users/${bUserId}`).set(auth()).expect(404);
    await http
      .post(`/users/${bUserId}/revoke-sessions`)
      .set(auth())
      .expect(404);
    await http
      .patch(`/opportunities/${oppA.id}`)
      .set(auth())
      .send({ assignee_id: bUserId })
      .expect(400);
    // B's scan touches nothing of A
    const scanB = await http.post('/opportunities/scan').set(asB).expect(200);
    expect(scanB.body.properties).toBe(0);

    // A still intact
    await http
      .get(`/views`)
      .set(auth())
      .expect(200)
      .then((r) =>
        expect(r.body.items.map((v: { name: string }) => v.name)).toContain(
          'A view',
        ),
      );
    expect(
      (await http.get(`/opportunities/${oppA.id}`).set(auth()).expect(200)).body
        .status,
    ).toBe(oppA.status);
    await http.delete(`/webhooks/${hookA.body.id}`).set(auth()).expect(204);
    await http.delete(`/reports/${reportA.body.id}`).set(auth()).expect(204);
    await http.delete(`/views/${viewA.body.id}`).set(auth()).expect(204);
  });

  it('report branding (MISS-0135): entity profile + logo, validated, previewed, printed, tenant-isolated', async () => {
    const pdfOf = async (id: number, headers: Record<string, string>) =>
      (
        await http
          .get(`/reports/${id}/export.pdf`)
          .set(headers)
          .buffer(true)
          .parse((res, cb) => {
            const chunks: Buffer[] = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => cb(null, Buffer.concat(chunks)));
          })
          .expect(200)
      ).body as Buffer;

    // nothing configured: clean fallback, explained
    await http.put('/settings/brand').set(auth()).send({}).expect(200);
    await http.delete('/settings/brand/logo').set(auth()).expect(204);
    let settings = (await http.get('/settings').set(auth()).expect(200)).body;
    expect(settings.logo).toBeNull();
    expect(settings.branding_missing.join(' ')).toMatch(/No logo/);
    expect(settings.branding_missing.join(' ')).toMatch(/No legal entity name/);

    // entity profile, the MISSIRIA workspace storing its own legal details
    const saved = await http
      .put('/settings/brand')
      .set(auth())
      .send({
        name: 'MISSIRIA',
        accent_color: '#0f766e',
        legal_name: 'MISSIRIA LTD',
        trading_name: 'MISSIRIA',
        company_number: '17494304',
        registered_address:
          'Unit A, 82 James Carter Road\nMildenhall IP28 7DE\nUnited Kingdom',
        contact_email: 'contact@missiria.dev',
        website: 'www.missiria.dev',
      })
      .expect(200);
    expect(saved.body.website).toBe('https://www.missiria.dev');
    await http
      .put('/settings/brand')
      .set(auth())
      .send({ contact_email: 'nope' })
      .expect(400);
    await http
      .put('/settings/brand')
      .set(auth())
      .send({ legal_name: 'x', unknown_field: 'y' })
      .expect(400);

    // logo: type from the bytes, size and dimension limits, no path in any response
    await http
      .put('/settings/brand/logo')
      .set(auth())
      .set('Content-Type', 'image/svg+xml')
      .send(Buffer.from('<svg/>'))
      .expect(400);
    await http
      .put('/settings/brand/logo')
      .set(auth())
      .set('Content-Type', 'image/png')
      .send(Buffer.from('GIF89a not a png at all'))
      .expect(400);
    await http
      .put('/settings/brand/logo')
      .set(auth())
      .set('Content-Type', 'image/png')
      .send(Buffer.concat([solidPng(20, 20), Buffer.alloc(300 * 1024)]))
      .expect(400);
    await http
      .put('/settings/brand/logo')
      .set(auth())
      .set('Content-Type', 'image/jpeg')
      .send(jpegHeader(9000, 50))
      .expect(400);
    const logo = await http
      .put('/settings/brand/logo')
      .set(auth())
      .set('Content-Type', 'image/png')
      .send(solidPng(240, 60))
      .expect(200);
    expect(logo.body).toEqual({
      mime: 'image/png',
      width: 240,
      height: 60,
      bytes: expect.any(Number),
    });
    // saving the profile again must not touch the stored logo (brand_logo is not selected)
    await http
      .put('/settings/brand')
      .set(auth())
      .send({ ...saved.body, footer: 'Confidential' })
      .expect(200);
    settings = (await http.get('/settings').set(auth()).expect(200)).body;
    expect(settings.logo).toMatchObject({ width: 240, height: 60 });
    expect(settings.brand.footer).toBe('Confidential');
    expect(settings.branding_missing).toEqual([]);
    expect(JSON.stringify(settings)).not.toMatch(/base64|\/tmp|uploads|data:/);
    const img = await http
      .get('/settings/brand/logo')
      .set(auth())
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      })
      .expect(200);
    expect(img.headers['content-type']).toBe('image/png');
    expect((img.body as Buffer).equals(solidPng(240, 60))).toBe(true);

    // A's PDF embeds the logo and names the entity
    const reportA = await http
      .post('/reports')
      .set(auth())
      .send({
        name: 'Branded',
        scope: 'property',
        property_id: propertyId,
        config: { period: { days: 28 }, sections: ['overview', 'pages'] },
      })
      .expect(201);
    const pdfA = await pdfOf(reportA.body.id, auth());
    expect(pdfA.toString('latin1')).toMatch(/\/Subtype \/Image/);
    expect(pdfA.toString('latin1')).toContain('MISSIRIA');

    // another tenant: none of A's profile or logo, text-only fallback in its own PDF
    const workspaces = app.get(WorkspacesService);
    const users = app.get(UsersService);
    const wsC = await workspaces.create('tenant-c', 'Tenant C');
    await users.create({
      email: 'c-admin@example.com',
      password: 'Tenant-c-pass-123',
      name: 'C admin',
      role: 'admin',
      workspaceId: wsC.id,
    });
    const c = await http
      .post('/auth/login')
      .send({ email: 'c-admin@example.com', password: 'Tenant-c-pass-123' })
      .expect(200);
    const asC = { Authorization: `Bearer ${c.body.token}` };
    const settingsC = (await http.get('/settings').set(asC).expect(200)).body;
    expect(settingsC.brand).toEqual({});
    expect(settingsC.logo).toBeNull();
    await http.get('/settings/brand/logo').set(asC).expect(404);
    const reportC = await http
      .post('/reports')
      .set(asC)
      .send({
        name: 'C fleet',
        scope: 'fleet',
        config: { sections: ['overview'] },
      })
      .expect(201);
    const pdfC = await pdfOf(reportC.body.id, asC);
    expect(pdfC.toString('latin1')).not.toMatch(/\/Subtype \/Image/);
    expect(pdfC.toString('latin1')).not.toContain('MISSIRIA');
    // C saving its own profile leaves A untouched
    await http
      .put('/settings/brand')
      .set(asC)
      .send({ name: 'Tenant C brand' })
      .expect(200);
    expect(
      (await http.get('/settings').set(auth()).expect(200)).body.brand
        .legal_name,
    ).toBe('MISSIRIA LTD');

    // removing the logo returns to the text header
    await http.delete('/settings/brand/logo').set(auth()).expect(204);
    await http.get('/settings/brand/logo').set(auth()).expect(404);
    expect(
      (await pdfOf(reportA.body.id, auth())).toString('latin1'),
    ).not.toMatch(/\/Subtype \/Image/);
  });

  it('sync: truncated runs are partial and visible; complete windows reconcile; failed fetches keep data', async () => {
    const ds = app.get(DataSource);
    const gsc = app.get(GscService);
    const sync = app.get(SyncService);
    const loadProperty = () =>
      ds.getRepository('Property').findOneByOrFail({ id: propertyId });
    const count = async (sql: string) =>
      Number((await ds.query(sql, [propertyId]))[0].n);
    const end = (
      await ds.query(
        "SELECT DATE_FORMAT(MAX(date), '%Y-%m-%d') d FROM daily_metrics WHERE property_id = ?",
        [propertyId],
      )
    )[0].d as string;
    // The incremental window ends 3 days before "today": pin today to the fixtures (MISS-0173),
    // faking Date only so HTTP, timers and the database driver keep running for real.
    jest.useFakeTimers({
      now: new Date(`${end}T12:00:00Z`).getTime() + 3 * 86_400_000,
      doNotFake: [
        'hrtime',
        'nextTick',
        'performance',
        'queueMicrotask',
        'requestAnimationFrame',
        'cancelAnimationFrame',
        'requestIdleCallback',
        'cancelIdleCallback',
        'setImmediate',
        'clearImmediate',
        'setInterval',
        'clearInterval',
        'setTimeout',
        'clearTimeout',
      ],
    });

    // 1. page cap hit on queries → partial, surfaced in API + health; query rows of the window kept
    const realQueryAll = gsc.queryAll.bind(gsc);
    const spy = jest
      .spyOn(gsc, 'queryAll')
      .mockImplementation(async (...args: unknown[]) => {
        const res = await realQueryAll(
          ...(args as [string, string, string, string[]]),
        );
        return (args[3] as string[])[1] === 'query'
          ? { ...res, truncated: true }
          : res;
      });
    const partial = await sync.incremental(await loadProperty());
    expect(partial.status).toBe('partial');
    const d = await http
      .get(`/properties/${propertyId}?days=28`)
      .set(auth())
      .expect(200);
    expect(d.body.property.last_sync_status).toBe('partial');
    expect(d.body.property.last_run.status).toBe('partial');
    expect(d.body.coverage.unreliable).toContain('query');
    expect(d.body.coverage.detail.dimensions.query).toMatchObject({
      status: 'truncated',
      reason: 'page_cap',
    });
    const health = (await http.get('/settings/health').set(auth()).expect(200))
      .body;
    expect(health.complete).toBe(false);
    expect(
      health.properties.partial.map((p: { id: number }) => p.id),
    ).toContain(propertyId);
    // opportunities skip unreliable dimensions: no query-subject findings refreshed
    spy.mockRestore();

    // 2. a failing dimension keeps its stored rows (no deletion on partial responses)
    const pagesBefore = await count(
      "SELECT COUNT(*) n FROM dimension_metrics WHERE property_id = ? AND dimension = 'page'",
    );
    expect(pagesBefore).toBeGreaterThan(0);
    const failSpy = jest
      .spyOn(gsc, 'queryAll')
      .mockImplementation(async (...args: unknown[]) => {
        if ((args[3] as string[])[1] === 'page')
          throw new Error('quota exceeded');
        return realQueryAll(...(args as [string, string, string, string[]]));
      });
    const failed = await sync.incremental(await loadProperty());
    expect(failed.status).toBe('partial');
    expect(failed.error).toMatch(/quota exceeded/);
    expect(
      await count(
        "SELECT COUNT(*) n FROM dimension_metrics WHERE property_id = ? AND dimension = 'page'",
      ),
    ).toBe(pagesBefore);
    failSpy.mockRestore();

    // 3. a complete but empty re-fetch removes the obsolete rows of that window only
    const [window] = await ds.query(
      "SELECT DATE_FORMAT(range_start, '%Y-%m-%d') s, DATE_FORMAT(range_end, '%Y-%m-%d') e FROM sync_runs WHERE id = ?",
      [failed.id],
    );
    const inWindow = (t: string, extra = '') =>
      `SELECT COUNT(*) n FROM ${t} WHERE property_id = ? AND date BETWEEN '${window.s}' AND '${window.e}'${extra}`;
    expect(await count(inWindow('daily_metrics'))).toBeGreaterThan(0);
    const outsideBefore = await count(
      `SELECT COUNT(*) n FROM daily_metrics WHERE property_id = ? AND date < '${window.s}'`,
    );
    const emptyQuery = jest.spyOn(gsc, 'query').mockResolvedValue([]);
    const emptyAll = jest
      .spyOn(gsc, 'queryAll')
      .mockResolvedValue({ rows: [], calls: 1, truncated: false });
    const emptyAppearance = jest
      .spyOn(gsc, 'querySearchAppearanceByDay')
      .mockResolvedValue({ rows: [], calls: 1, truncated: false });
    const empty = await sync.incremental(await loadProperty());
    expect(empty.status).toBe('ok');
    expect(await count(inWindow('daily_metrics'))).toBe(0);
    expect(await count(inWindow('dimension_metrics'))).toBe(0);
    expect(
      await count(
        `SELECT COUNT(*) n FROM daily_metrics WHERE property_id = ? AND date < '${window.s}'`,
      ),
    ).toBe(outsideBefore);
    emptyQuery.mockRestore();
    emptyAll.mockRestore();
    emptyAppearance.mockRestore();

    // 4. retry with real data is idempotent: the window is restored, a second run changes nothing
    const restored = await sync.incremental(await loadProperty());
    expect(restored.status).toBe('ok');
    const n1 = await count(inWindow('dimension_metrics'));
    expect(n1).toBeGreaterThan(0);
    await sync.incremental(await loadProperty());
    expect(await count(inWindow('dimension_metrics'))).toBe(n1);
    // a complete incremental does not erase the incomplete marker: only a complete backfill does
    const still = await http
      .get(`/properties/${propertyId}`)
      .set(auth())
      .expect(200);
    expect(still.body.coverage.unreliable).toContain('query');
    const full = await sync.backfill(await loadProperty());
    expect(full.status).toBe('ok');
    const clean = await http
      .get(`/properties/${propertyId}`)
      .set(auth())
      .expect(200);
    expect(clean.body.coverage.unreliable).toEqual([]);
    expect(
      (await http.get('/settings/health').set(auth()).expect(200)).body
        .complete,
    ).toBe(true);
    jest.useRealTimers();
  });

  it('dates, filters and saved views: controlled 400s and lossless round-trips', async () => {
    for (const q of [
      'end=2026-99-99',
      'end=2026-02-30',
      'start=2026-10-10&end=2026-10-01',
      'start=2024-01-01&end=2026-10-01',
      'days=0',
      'days=abc',
    ]) {
      await http.get(`/overview?${q}`).set(auth()).expect(400);
      await http.get(`/properties/${propertyId}?${q}`).set(auth()).expect(400);
    }
    await http
      .get(`/properties/${propertyId}?days=28&include_query=a&include_page=b`)
      .set(auth())
      .expect(400);
    await http
      .get(`/properties/${propertyId}?days=28&country=FR`)
      .set(auth())
      .expect(400);

    // country filter governs KPIs, series and comparison; other breakdowns are marked unavailable
    const all = await http
      .get(`/properties/${propertyId}?start=2026-09-15&end=2026-10-12`)
      .set(auth())
      .expect(200);
    const esp = await http
      .get(
        `/properties/${propertyId}?start=2026-09-15&end=2026-10-12&country=esp`,
      )
      .set(auth())
      .expect(200);
    expect(esp.body.filters).toMatchObject({
      dimension: 'country',
      keys: ['esp'],
    });
    expect(esp.body.kpi.source).toBe('country');
    expect(esp.body.kpi.current.clicks).toBe(
      all.body.breakdowns.country.rows[0].clicks,
    );
    expect(esp.body.kpi.current.clicks).toBeLessThan(
      all.body.kpi.current.clicks,
    );
    const seriesSum = esp.body.series.reduce(
      (n: number, p: { clicks: number }) => n + p.clicks,
      0,
    );
    expect(seriesSum).toBe(esp.body.kpi.current.clicks);
    expect(
      esp.body.breakdowns.country.rows.map((r: { key: string }) => r.key),
    ).toEqual(['esp']);
    expect(esp.body.breakdowns.query.unavailable.reason).toBe(
      'cross_dimension',
    );

    // comparison without stored rows is reported as unavailable, not as a 100 % gain
    const early = await http
      .get(`/properties/${propertyId}?start=2026-05-16&end=2026-05-20`)
      .set(auth())
      .expect(200);
    expect(early.body.kpi.comparison.available).toBe(false);
    expect(early.body.kpi.previous).toBeNull();
    expect(early.body.kpi.delta.clicks).toBeNull();

    // saved views: byte-aware limit, rejected before persistence; valid configs round-trip
    const config = {
      period: { start: '2026-09-15', end: '2026-10-12' },
      filters: { country: 'esp' },
      note: 'é€😀'.repeat(100),
    };
    const v = await http
      .post('/views')
      .set(auth())
      .send({
        scope: 'property',
        property_id: propertyId,
        name: 'Spain',
        config,
      })
      .expect(201);
    expect(v.body.config).toEqual(config);
    const got = await http
      .get(`/views?scope=property&property_id=${propertyId}`)
      .set(auth())
      .expect(200);
    expect(
      got.body.items.find((x: { id: number }) => x.id === v.body.id).config,
    ).toEqual(config);
    const before = (await http.get('/views').set(auth())).body.items.length;
    await http
      .post('/views')
      .set(auth())
      .send({
        scope: 'fleet',
        name: 'big',
        config: { note: '😀'.repeat(4100) },
      })
      .expect(400);
    await http
      .patch(`/views/${v.body.id}`)
      .set(auth())
      .send({ config: { note: 'x'.repeat(16_001) } })
      .expect(400);
    expect((await http.get('/views').set(auth())).body.items.length).toBe(
      before,
    );
    const unchanged = await http
      .get(`/views?scope=property&property_id=${propertyId}`)
      .set(auth());
    expect(
      unchanged.body.items.find((x: { id: number }) => x.id === v.body.id)
        .config,
    ).toEqual(config);
  });

  it('deleting a property removes all derived data', async () => {
    const ds = app.get(DataSource);
    await http.delete(`/properties/${propertyId}`).set(auth()).expect(204);
    for (const t of [
      'daily_metrics',
      'dimension_metrics',
      'sync_runs',
      'opportunities',
      'saved_views',
    ]) {
      const n = await ds.query(
        `SELECT COUNT(*) n FROM \`${t}\` WHERE property_id = ?`,
        [propertyId],
      );
      expect({ table: t, n: Number(n[0].n) }).toEqual({ table: t, n: 0 });
    }
    await http.get(`/properties/${propertyId}`).set(auth()).expect(404);
  });

  // ---- MISS-0116 ---------------------------------------------------------

  it('signup: pending until an operator approves; no email enumeration; own workspace on approval', async () => {
    const waitMail = async (pred: (m: (typeof mails)[number]) => boolean) => {
      for (let i = 0; i < 50; i++) {
        const m = mails.find(pred);
        if (m) return m;
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error('mail not sent');
    };
    await http
      .post('/auth/register')
      .send({ name: 'New', email: 'new@example.com', password: 'short' })
      .expect(400);
    const body = {
      name: 'New Person',
      email: 'New@Example.com',
      password: 'Signup-pass-123',
      company: 'Acme SEO',
    };
    // an attacker pre-claims the address with their own password...
    await http
      .post('/auth/register')
      .send({ ...body, name: 'Attacker', password: 'Attacker-pass-999' })
      .expect(202);
    const attackerMail = await waitMail(
      (m) => m.to.includes('new@example.com') && m.subject.includes('Confirm'),
    );
    const attackerToken = /verify-email\?token=([\w-]+)/.exec(
      attackerMail.text,
    )![1];
    // ...unconfirmed, it is invisible to operators and cannot sign in
    const hidden = await http.get('/signups').set(auth()).expect(200);
    expect(JSON.stringify(hidden.body)).not.toContain('new@example.com');
    const unverified = await http
      .post('/auth/login')
      .send({ email: 'new@example.com', password: 'Attacker-pass-999' })
      .expect(403);
    expect(unverified.body.message).toMatch(/Confirm your email/);
    // the real owner signs up again: replaces the record, the attacker's link dies
    mails.length = 0;
    const fresh = await http.post('/auth/register').send(body).expect(202);
    // an existing (confirmed) address gets the very same answer
    const dup = await http
      .post('/auth/register')
      .send({ ...body, email: 'e2e-admin@example.com' })
      .expect(202);
    expect(dup.body).toEqual(fresh.body);
    await http
      .post('/auth/verify-email')
      .send({ token: attackerToken, password: 'Attacker-pass-999' })
      .expect(400);
    const confirm = await waitMail(
      (m) => m.to.includes('new@example.com') && m.subject.includes('Confirm'),
    );
    const verifyToken = /verify-email\?token=([\w-]+)/.exec(confirm.text)![1];
    // confirming needs the password of THIS request: the attacker's does not work even with
    // the link, and a wrong password leaves the link usable
    await http
      .post('/auth/verify-email')
      .send({ token: verifyToken, password: 'Attacker-pass-999' })
      .expect(400);
    await http
      .post('/auth/verify-email')
      .send({ token: verifyToken, password: body.password })
      .expect(204);
    await http
      .post('/auth/verify-email')
      .send({ token: verifyToken, password: body.password })
      .expect(400);
    const notice = await waitMail((m) => m.subject.includes('New Person'));
    expect(notice.to).toContain('e2e-admin@example.com');
    await http
      .post('/auth/login')
      .send({ email: 'new@example.com', password: 'Attacker-pass-999' })
      .expect(401);

    // pending: right password → 403 with a clear message, wrong password → 401
    await http
      .post('/auth/login')
      .send({ email: 'new@example.com', password: 'wrong' })
      .expect(401);
    const pending = await http
      .post('/auth/login')
      .send({ email: 'new@example.com', password: body.password })
      .expect(403);
    expect(pending.body.message).toMatch(/awaiting approval/);
    // forgot-password does nothing for a pending account
    const before = mails.length;
    await http
      .post('/auth/forgot-password')
      .send({ email: 'new@example.com' })
      .expect(202);
    await new Promise((r) => setTimeout(r, 100));
    expect(mails.length).toBe(before);

    const list = await http.get('/signups').set(auth()).expect(200);
    const signup = list.body.items.find(
      (u: { email: string }) => u.email === 'new@example.com',
    );
    expect(signup).toMatchObject({ name: 'New Person', company: 'Acme SEO' });
    const approved = await http
      .post(`/signups/${signup.id}/approve`)
      .set(auth())
      .expect(201);
    expect(approved.body.workspace.slug).toBe('acme-seo');
    await http.post(`/signups/${signup.id}/approve`).set(auth()).expect(404);

    const login = await http
      .post('/auth/login')
      .send({ email: 'new@example.com', password: body.password })
      .expect(200);
    const newAuth = { Authorization: `Bearer ${login.body.token}` };
    expect(login.body.user.role).toBe('admin');
    // own, empty workspace: nothing from the operator's workspace
    const props = await http.get('/properties').set(newAuth).expect(200);
    expect(JSON.stringify(props.body)).not.toContain('puntomira');
    // a customer admin is not an operator
    await http.get('/signups').set(newAuth).expect(403);

    // reject: a second signup can never sign in
    await http
      .post('/auth/register')
      .send({
        name: 'Nope',
        email: 'nope@example.com',
        password: 'Signup-pass-123',
      })
      .expect(202);
    const nopeMail = await waitMail(
      (m) => m.to.includes('nope@example.com') && m.subject.includes('Confirm'),
    );
    await http
      .post('/auth/verify-email')
      .send({
        token: /verify-email\?token=([\w-]+)/.exec(nopeMail.text)![1],
        password: 'Signup-pass-123',
      })
      .expect(204);
    const again = await http.get('/signups').set(auth()).expect(200);
    const nope = again.body.items.find(
      (u: { email: string }) => u.email === 'nope@example.com',
    );
    await http.post(`/signups/${nope.id}/reject`).set(auth()).expect(204);
    await http
      .post('/auth/login')
      .send({ email: 'nope@example.com', password: 'Signup-pass-123' })
      .expect(401);
  });

  it('password reset: single-use mailed link bound to email + sessions, signs out everywhere', async () => {
    const resetLink = async (): Promise<string> => {
      mails.length = 0;
      await http
        .post('/auth/forgot-password')
        .send({ email: 'new@example.com' })
        .expect(202, { status: 'sent' });
      for (let i = 0; i < 50; i++) {
        const m = mails.find(
          (x) =>
            x.to.includes('new@example.com') && x.subject.includes('Reset'),
        );
        if (m) return /reset-password\?token=([\w-]+)/.exec(m.text)![1];
        await new Promise((r) => setTimeout(r, 20));
      }
      throw new Error('reset mail not sent');
    };
    const signIn = async (password: string, status = 200) =>
      (
        await http
          .post('/auth/login')
          .send({ email: 'new@example.com', password })
          .expect(status)
      ).body as { token: string };
    const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });

    await http
      .post('/auth/forgot-password')
      .send({ email: 'ghost@example.com' })
      .expect(202, { status: 'sent' });

    // bound to the address: an email change in between kills the link
    const session = await signIn('Signup-pass-123');
    const first = await resetLink();
    await http
      .patch('/auth/me')
      .set(bearer(session.token))
      .send({ email: 'renamed@example.com' })
      .expect(200);
    await http
      .post('/auth/reset-password')
      .send({ token: first, password: 'Brand-new-pass-456' })
      .expect(400);
    await http
      .patch('/auth/me')
      .set(bearer(session.token))
      .send({ email: 'new@example.com' })
      .expect(200);

    // bound to the sessions: a revocation in between kills the link
    const second = await resetLink();
    await http
      .post('/auth/revoke-sessions')
      .set(bearer(session.token))
      .expect(204);
    await http
      .post('/auth/reset-password')
      .send({ token: second, password: 'Brand-new-pass-456' })
      .expect(400);

    // the happy path: weak password refused, then single use, signs out everywhere
    const live = await signIn('Signup-pass-123');
    const token = await resetLink();
    await http
      .post('/auth/reset-password')
      .send({ token, password: 'weak' })
      .expect(400);
    await http
      .post('/auth/reset-password')
      .send({ token: 'x'.repeat(43), password: 'Brand-new-pass-456' })
      .expect(400);
    await http
      .post('/auth/reset-password')
      .send({ token, password: 'Brand-new-pass-456' })
      .expect(204);
    await http
      .post('/auth/reset-password')
      .send({ token, password: 'Another-pass-789' })
      .expect(400);
    await http.get('/auth/me').set(bearer(live.token)).expect(401);
    await signIn('Signup-pass-123', 401);
    await signIn('Brand-new-pass-456');
  });

  it('x-dashboard admin API: operator admins only, no secrets, deactivation signs out', async () => {
    const workspaces = app.get(WorkspacesService);
    const users = app.get(UsersService);
    const login = async (email: string, password: string) =>
      (await http.post('/auth/login').send({ email, password }).expect(200))
        .body.token as string;
    const as = (t: string) => ({ Authorization: `Bearer ${t}` });

    // anonymous
    await http.get('/admin/overview').expect(401);

    // admin of another workspace
    const wsX = await workspaces.create('x-tenant', 'X tenant');
    await users.create({
      email: 'x-admin@example.com',
      password: 'X-admin-pass-123',
      name: 'X admin',
      role: 'admin',
      workspaceId: wsX.id,
    });
    const xToken = await login('x-admin@example.com', 'X-admin-pass-123');
    for (const path of [
      '/admin/whoami',
      '/admin/overview',
      '/admin/accounts',
      '/admin/workspaces',
      '/admin/smtp',
    ]) {
      await http.get(path).set(as(xToken)).expect(403);
    }
    await http.post('/admin/smtp/test').set(as(xToken)).expect(403);

    // member (not admin) of the operator workspace
    const op = await workspaces.ensureDefault();
    const member = await users.create({
      email: 'op-member@example.com',
      password: 'Op-member-pass-123',
      name: 'Op member',
      role: 'member',
      workspaceId: op.id,
    });
    const memberToken = await login(
      'op-member@example.com',
      'Op-member-pass-123',
    );
    await http.get('/admin/overview').set(as(memberToken)).expect(403);
    await http
      .post(`/admin/accounts/${member.id}/deactivate`)
      .set(as(memberToken))
      .expect(403);

    // operator admin
    await http.get('/admin/whoami').set(auth()).expect(200);
    const ov = await http.get('/admin/overview').set(auth()).expect(200);
    expect(ov.body.workspaces).toBeGreaterThanOrEqual(2);
    const accounts = await http.get('/admin/accounts').set(auth()).expect(200);
    const emails = accounts.body.items.map((a: { email: string }) => a.email);
    expect(emails).toEqual(
      expect.arrayContaining(['x-admin@example.com', 'op-member@example.com']),
    );
    expect(JSON.stringify(accounts.body)).not.toMatch(/password|token_version/);
    const ws = await http.get('/admin/workspaces').set(auth()).expect(200);
    expect(
      ws.body.items.find((w: { slug: string }) => w.slug === 'x-tenant'),
    ).toMatchObject({ members: 1, properties: 0 });
    const smtp = await http.get('/admin/smtp').set(auth()).expect(200);
    expect(Object.keys(smtp.body).sort()).toEqual(
      [
        'authenticated',
        'configured',
        'from',
        'from_name',
        'host',
        'port',
        'secure',
        'starttls',
      ].sort(),
    );
    const test = await http.post('/admin/smtp/test').set(auth()).expect(201);
    expect(test.body).toMatchObject({ sent: false });

    // cannot lock themselves out
    const me = await http.get('/auth/me').set(auth()).expect(200);
    await http
      .post(`/admin/accounts/${me.body.id}/deactivate`)
      .set(auth())
      .expect(400);

    // deactivation revokes live sessions; reactivation lets them sign in again
    await http
      .post(`/admin/accounts/${member.id}/deactivate`)
      .set(auth())
      .expect(204);
    await http.get('/auth/me').set(as(memberToken)).expect(401);
    await http
      .post('/auth/login')
      .send({ email: 'op-member@example.com', password: 'Op-member-pass-123' })
      .expect(401);
    await http
      .post(`/admin/accounts/${member.id}/reactivate`)
      .set(auth())
      .expect(204);
    await login('op-member@example.com', 'Op-member-pass-123');
    await http
      .post('/admin/accounts/999999/deactivate')
      .set(auth())
      .expect(404);
  });

  it('weekly opportunities email: /auth/me opt-out, tenant-scoped digest, once per week (MISS-0196)', async () => {
    const ds = app.get(DataSource);
    const users = app.get(UsersService);
    const workspaces = app.get(WorkspacesService);
    const digest = app.get(OpportunityDigestService);
    // the cron is registered: Mondays 08:00 Paris whatever the server clock
    const job = app
      .get(SchedulerRegistry)
      .getCronJob('opportunity-weekly-digest');
    const next = job.nextDate().toJSDate();
    expect(
      new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Paris',
        weekday: 'short',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      }).format(next),
    ).toBe('Mon 08:00');
    const admin = (
      await http
        .post('/auth/login')
        .send({
          email: 'e2e-admin@example.com',
          password: 'E2e-admin-pass-123',
        })
        .expect(200)
    ).body.token as string;
    const asAdmin = { Authorization: `Bearer ${admin}` };

    // preference: default on, toggled through PATCH /auth/me, strictly typed
    const me = await http.get('/auth/me').set(asAdmin).expect(200);
    expect(me.body.weekly_opportunities_email).toBe(true);
    const off = await http
      .patch('/auth/me')
      .set(asAdmin)
      .send({ weekly_opportunities_email: false })
      .expect(200);
    expect(off.body.weekly_opportunities_email).toBe(false);
    expect(
      (await http.get('/auth/me').set(asAdmin).expect(200)).body
        .weekly_opportunities_email,
    ).toBe(false);
    await http
      .patch('/auth/me')
      .set(asAdmin)
      .send({ weekly_opportunities_email: 'yes' })
      .expect(400);
    await http
      .patch('/auth/me')
      .set(asAdmin)
      .send({ weekly_digest: true })
      .expect(400);
    // other members never see someone else's preference
    const list = await http.get('/users').set(asAdmin).expect(200);
    expect(JSON.stringify(list.body)).not.toContain(
      'weekly_opportunities_email',
    );

    // a second workspace with its own admin and one new opportunity
    const wsD = await workspaces.create('digest-d', 'Digest D');
    await users.create({
      email: 'd-admin@example.com',
      password: 'Digest-d-pass-123',
      name: 'D admin',
      role: 'admin',
      workspaceId: wsD.id,
    });
    const defaultWs = await workspaces.ensureDefault();
    // earlier tests delete their properties: give the findings a fresh one
    const digestProperty = (
      await http
        .post('/properties')
        .set(asAdmin)
        .send({ siteUrl: 'digest.example.com' })
        .expect(201)
    ).body.property.id as number;
    const now = new Date(Date.now() + 60_000);
    const insertOpp = (wsId: number, title: string, status: string) =>
      ds.query(
        `INSERT INTO opportunities (workspace_id, property_id, rule, subject, key_text, fingerprint, status, priority, score, confidence, title, reason, suggested_action, evidence, first_seen_at, last_seen_at)
         VALUES (?, ?, 'low_ctr', 'query', ?, MD5(?), ?, 'high', 99, 'high', ?, 'Digest e2e reason. More.', 'Act.', '{}', ?, ?)`,
        [
          wsId,
          digestProperty,
          title,
          title,
          status,
          title,
          new Date(now.getTime() - 3_600_000),
          now,
        ],
      );
    await insertOpp(wsD.id, 'D-only digest finding', 'open');
    await insertOpp(defaultWs.id, 'A digest finding', 'open');
    await insertOpp(defaultWs.id, 'A dismissed finding', 'dismissed');

    // opted out: the default admin gets nothing, D's admin gets only D's work
    mails.length = 0;
    const first = await digest.runWeekly(now);
    expect(first.skipped).toBeGreaterThanOrEqual(1);
    expect(
      mails.find((m) => m.to.includes('e2e-admin@example.com')),
    ).toBeUndefined();
    const dMail = mails.find((m) => m.to.includes('d-admin@example.com'))!;
    expect(dMail.subject).toBe('Spider weekly: 1 new opportunity');
    expect(dMail.text).toContain('D-only digest finding');
    expect(dMail.text).not.toContain('A digest finding');
    expect(dMail.text).toContain('Still open in the inbox: 1');
    for (const m of mails) expect(m.to).toHaveLength(1);

    // back on: the default admin's digest lists A's work only, not dismissed, not D
    await http
      .patch('/auth/me')
      .set(asAdmin)
      .send({ weekly_opportunities_email: true })
      .expect(200);
    mails.length = 0;
    await digest.runWeekly(now);
    const aMail = mails.find((m) => m.to.includes('e2e-admin@example.com'))!;
    expect(aMail.subject).toMatch(/^Spider weekly: \d+ new opportunit/);
    expect(aMail.text).toContain('A digest finding');
    expect(aMail.text).not.toContain('A dismissed finding');
    expect(aMail.text).not.toContain('D-only digest finding');
    expect(
      mails.find((m) => m.to.includes('d-admin@example.com')),
    ).toBeUndefined(); // already done this week

    // claimed rows: SMTP not configured → skipped, one per (user, workspace, week)
    const rows = await ds.query(
      `SELECT d.status, d.error, d.week_key, d.opportunity_count, u.email FROM opportunity_digest_deliveries d JOIN users u ON u.id = d.user_id ORDER BY d.id`,
    );
    const mine = rows.filter((r: { email: string }) =>
      ['e2e-admin@example.com', 'd-admin@example.com'].includes(r.email),
    );
    expect(mine).toHaveLength(2);
    for (const r of mine)
      expect(r).toMatchObject({
        status: 'skipped',
        error: 'SMTP not configured',
      });
    expect(mine[0].week_key).toMatch(/^\d{4}-W\d{2}$/);

    // rerun / restart the same week: nothing is sent again
    mails.length = 0;
    const again = await digest.runWeekly(now);
    expect(mails).toHaveLength(0);
    expect(again.duplicate).toBeGreaterThanOrEqual(2);
    // the database key itself refuses a second claim
    const [row] = await ds.query(
      `SELECT user_id, workspace_id, week_key FROM opportunity_digest_deliveries LIMIT 1`,
    );
    await expect(
      ds.query(
        `INSERT INTO opportunity_digest_deliveries (user_id, workspace_id, week_key, status) VALUES (?, ?, ?, 'sent')`,
        [row.user_id, row.workspace_id, row.week_key],
      ),
    ).rejects.toMatchObject({ code: 'ER_DUP_ENTRY' });

    // admin-only preview of the caller's workspace, never sent
    const preview = await http
      .post('/opportunities/digest/preview')
      .set(asAdmin)
      .expect(200);
    expect(preview.body.text).toContain('A digest finding');
    expect(preview.body.text).not.toContain('D-only digest finding');
    expect(mails).toHaveLength(0);
    const inv = await http
      .post('/users')
      .set(asAdmin)
      .send({ email: 'digest-member@example.com', name: 'Digest member' })
      .expect(201);
    const member = (
      await http
        .post('/auth/login')
        .send({
          email: 'digest-member@example.com',
          password: inv.body.temporary_password,
        })
        .expect(200)
    ).body.token as string;
    await http
      .post('/opportunities/digest/preview')
      .set({ Authorization: `Bearer ${member}` })
      .expect(403);
  });
});
