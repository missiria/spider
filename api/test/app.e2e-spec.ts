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

describe('Spider API (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let token = '';
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
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
      'webhook_deliveries',
      'webhooks',
      'alert_events',
      'alert_rules',
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
    const upd = await http
      .patch(`/opportunities/${id}`)
      .set(auth())
      .send({
        status: 'in_progress',
        priority: 'high',
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
    void end;

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
});
