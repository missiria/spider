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

describe('Spider API (e2e)', () => {
  let app: INestApplication;
  let http: ReturnType<typeof request>;
  let token = '';
  const auth = () => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
    const ds = app.get(DataSource);
    // clean slate every run, keep the schema
    await ds.query('SET FOREIGN_KEY_CHECKS = 0');
    for (const t of ['opportunity_events', 'opportunities', 'opportunity_rules', 'saved_views', 'sync_runs', 'dimension_metrics', 'daily_metrics', 'properties', 'users']) {
      await ds.query(`DELETE FROM \`${t}\``);
    }
    await ds.query('SET FOREIGN_KEY_CHECKS = 1');
    // seeder ran on init before cleanup → recreate the admin
    const seeder = app.get(DefaultAdminSeeder);
    await seeder.onApplicationBootstrap();
    http = request(app.getHttpServer());
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
    await http.post('/auth/login').send({ email: 'e2e-admin@example.com', password: 'wrong' }).expect(401);
    await http.post('/auth/login').send({ email: 'not-an-email', password: 'x' }).expect(400);
    const res = await http.post('/auth/login').send({ email: 'e2e-admin@example.com', password: 'E2e-admin-pass-123' }).expect(200);
    token = res.body.token;
    expect(res.body.user.role).toBe('admin');
    expect(res.body.user).not.toHaveProperty('password_hash');
  });

  it('accepts the session cookie as well as the bearer header', async () => {
    await http.get('/auth/me').set('Cookie', `spider_session=${token}`).expect(200);
    await http.get('/auth/me').set('Cookie', 'spider_session=garbage').expect(401);
  });

  let propertyId = 0;
  it('normalizes, dedupes and lists properties', async () => {
    const created = await http.post('/properties').set(auth()).send({ siteUrl: 'www.puntomira.com' }).expect(201);
    propertyId = created.body.property.id;
    expect(created.body.property.site_url).toBe('https://www.puntomira.com/');
    expect(created.body.property.status).toBe('pending');
    await http.post('/properties').set(auth()).send({ siteUrl: 'https://www.puntomira.com/' }).expect(409);
    await http.post('/properties').set(auth()).send({ siteUrl: 'not a url' }).expect(400);
    await http.post('/properties').set(auth()).send({ siteUrl: 'www.x.com', extra: 1 }).expect(400);
    const list = await http.get('/properties').set(auth()).expect(200);
    expect(list.body.items).toHaveLength(1);
    expect(list.body.serviceAccountEmail).toContain('@');
  });

  it('checker: shared property connects and backfills; unshared stays pending', async () => {
    const unshared = await http.post('/properties').set(auth()).send({ siteUrl: 'https://www.not-shared.example/' }).expect(201);
    const u = await http.post(`/properties/${unshared.body.property.id}/check`).set(auth()).expect(200);
    expect(u.body.property.status).toBe('pending');
    expect(u.body.justConnected).toBe(false);

    const c = await http.post(`/properties/${propertyId}/check`).set(auth()).expect(200);
    expect(c.body.property.status).toBe('connected');
    expect(c.body.justConnected).toBe(true);
    // backfill is fire-and-forget: poll until the run finishes
    for (let i = 0; i < 60; i += 1) {
      const d = await http.get(`/properties/${propertyId}`).set(auth()).expect(200);
      if (d.body.property.last_run?.status === 'ok') break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const d = await http.get(`/properties/${propertyId}?start=2026-09-15&end=2026-10-12`).set(auth()).expect(200);
    expect(d.body.property.last_run.status).toBe('ok');
    expect(d.body.property.data_since).toBe('2026-05-16');
    expect(d.body.kpi.current.clicks).toBe(237);
    expect(d.body.kpi.current.impressions).toBe(8741);
    expect(d.body.breakdowns.query.rows.length).toBeGreaterThan(0);
    expect(d.body.breakdowns.query.coverage.clicks).toBeLessThan(1);
    expect(d.body.breakdowns.country.rows[0].key).toBe('esp');
  });

  it('fleet overview reproduces the 2026-10-15 puntomira numbers and a re-sync adds no duplicates', async () => {
    const o = await http.get('/overview?start=2026-09-15&end=2026-10-12').set(auth()).expect(200);
    const row = o.body.items.find((i: { id: number }) => i.id === propertyId);
    expect(row.current.clicks).toBe(237);
    expect(Math.round(row.current.ctr * 10000) / 100).toBe(2.71);
    const ds = app.get(DataSource);
    const before = await ds.query('SELECT COUNT(*) n FROM daily_metrics WHERE property_id = ?', [propertyId]);
    await http.post(`/properties/${propertyId}/sync`).set(auth()).expect(202);
    for (let i = 0; i < 60; i += 1) {
      const d = await http.get(`/properties/${propertyId}`).set(auth());
      if (!d.body.property.syncing) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const after = await ds.query('SELECT COUNT(*) n FROM daily_metrics WHERE property_id = ?', [propertyId]);
    expect(Number(after[0].n)).toBe(Number(before[0].n));
  });

  it('regex filters are validated and applied server-side', async () => {
    await http.get(`/properties/${propertyId}?days=28&include_query=(`).set(auth()).expect(400);
    const d = await http.get(`/properties/${propertyId}?days=28&include_query=^hot&exclude_query=player`).set(auth()).expect(200);
    for (const r of d.body.breakdowns.query.rows) {
      expect(r.key).toMatch(/^hot/);
      expect(r.key).not.toMatch(/player/);
    }
    expect(d.body.breakdowns.query.filters).toEqual({ include: '^hot', exclude: 'player' });
  });

  it('saved views CRUD', async () => {
    const v = await http.post('/views').set(auth()).send({ scope: 'property', property_id: propertyId, name: 'Hot player', config: { period: { days: 28 } } }).expect(201);
    await http.patch(`/views/${v.body.id}`).set(auth()).send({ name: 'Hot Player renamed' }).expect(200);
    const list = await http.get(`/views?scope=property&property_id=${propertyId}`).set(auth()).expect(200);
    expect(list.body.items.map((x: { name: string }) => x.name)).toEqual(['Hot Player renamed']);
    await http.get('/views/999999').set(auth()).expect(404);
  });

  it('opportunities: scan, dedupe, tracking with audit history', async () => {
    const first = await http.post('/opportunities/scan').set(auth()).expect(200);
    expect(first.body.created).toBeGreaterThan(0);
    const second = await http.post('/opportunities/scan').set(auth()).expect(200);
    expect(second.body.created).toBe(0);
    expect(second.body.updated).toBe(first.body.created);
    const list = await http.get('/opportunities?status=active').set(auth()).expect(200);
    const id = list.body.items[0].id;
    expect(list.body.items[0].title).not.toMatch(/penalt/i);
    const upd = await http.patch(`/opportunities/${id}`).set(auth()).send({ status: 'in_progress', priority: 'high', due_date: '2026-10-22', note: 'looking' }).expect(200);
    expect(upd.body.events.map((e: { type: string }) => e.type)).toEqual(['created', 'evidence_updated', 'status', 'priority', 'due_date', 'note']);
    await http.patch(`/opportunities/${id}`).set(auth()).send({ status: 'bogus' }).expect(400);
    const done = await http.patch(`/opportunities/${id}`).set(auth()).send({ status: 'done' }).expect(200);
    expect(done.body.completed_at).toBeTruthy();
    expect(done.body.impact.completed_on).toBeTruthy();
    const third = await http.post('/opportunities/scan').set(auth()).expect(200);
    expect(third.body.skipped).toBeGreaterThanOrEqual(1);
    const still = await http.get(`/opportunities/${id}`).set(auth()).expect(200);
    expect(still.body.status).toBe('done');
    const rules = await http.put('/opportunities/rules').set(auth()).send({ window_days: 14, low_ctr: { enabled: false } }).expect(200);
    expect(rules.body.window_days).toBe(14);
    expect(rules.body.low_ctr.enabled).toBe(false);
  });

  it('admin invites a member; the member cannot invite; profile updates are own-only', async () => {
    const inv = await http.post('/users').set(auth()).send({ email: 'member@example.com', name: 'Member' }).expect(201);
    expect(inv.body.temporary_password.length).toBeGreaterThan(16);
    const login = await http.post('/auth/login').send({ email: 'member@example.com', password: inv.body.temporary_password }).expect(200);
    await http.post('/users').set({ Authorization: `Bearer ${login.body.token}` }).send({ email: 'x@example.com', name: 'X' }).expect(403);
    await http.patch('/auth/me').set({ Authorization: `Bearer ${login.body.token}` }).send({ name: 'Renamed Member' }).expect(200);
    await http.patch('/auth/me').set({ Authorization: `Bearer ${login.body.token}` }).send({ email: 'e2e-admin@example.com' }).expect(409);
    await http.delete(`/users/${login.body.user.id}`).set(auth()).expect(204);
    await http.post('/auth/login').send({ email: 'member@example.com', password: inv.body.temporary_password }).expect(401);
  });

  it('deleting a property removes all derived data', async () => {
    const ds = app.get(DataSource);
    await http.delete(`/properties/${propertyId}`).set(auth()).expect(204);
    for (const t of ['daily_metrics', 'dimension_metrics', 'sync_runs', 'opportunities', 'saved_views']) {
      const n = await ds.query(`SELECT COUNT(*) n FROM \`${t}\` WHERE property_id = ?`, [propertyId]);
      expect({ table: t, n: Number(n[0].n) }).toEqual({ table: t, n: 0 });
    }
    await http.get(`/properties/${propertyId}`).set(auth()).expect(404);
  });
});
