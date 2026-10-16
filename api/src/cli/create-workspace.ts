/**
 * Operator CLI (ADR-0007): create a customer workspace and its first admin.
 *
 *   node --env-file=../deploy/env/api.env dist/cli/create-workspace.js \
 *     --slug acme --name "ACME SEO" --admin-email seo@acme.com --admin-name "Jane Doe"
 *
 * Prints a one-time password for the admin (hand it over out of band). Refuses an existing
 * slug or email. Cron jobs are not started: the app context is created without listening.
 */
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  const v = i === -1 ? undefined : process.argv[i + 1];
  if (!v || v.startsWith('--')) {
    console.error(`missing --${name}`);
    process.exit(2);
  }
  return v.trim();
}

async function main(): Promise<void> {
  const slug = arg('slug').toLowerCase();
  const name = arg('name');
  const email = arg('admin-email').toLowerCase();
  const adminName = arg('admin-name');
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(slug)) {
    console.error('slug: 2-63 chars, a-z 0-9 and dashes');
    process.exit(2);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    console.error('admin-email: not an email address');
    process.exit(2);
  }
  // AppModule leaves ScheduleModule out when this is set: no cron runs inside the CLI
  process.env.SPIDER_CLI = '1';
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { AppModule } = require('../app.module');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const ds = app.get(DataSource);
    const taken = await ds.query(
      'SELECT (SELECT COUNT(*) FROM workspaces WHERE slug = ?) w, (SELECT COUNT(*) FROM users WHERE email = ?) u',
      [slug, email],
    );
    if (Number(taken[0].w) || Number(taken[0].u)) {
      console.error('slug or email already exists');
      process.exitCode = 1;
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { WorkspacesService } = require('../workspaces/workspaces.service');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { UsersService } = require('../users/users.service');
    const ws = await app.get(WorkspacesService).create(slug, name);
    const password = randomBytes(18).toString('base64url');
    await app.get(UsersService).create({
      email,
      password,
      name: adminName,
      role: 'admin',
      workspaceId: ws.id,
    });
    console.log(
      JSON.stringify({
        workspace: { id: ws.id, slug },
        admin: email,
        temporary_password: password,
      }),
    );
  } finally {
    await app.close();
  }
}

main().catch((err: Error) => {
  new Logger('create-workspace').error(err.message);
  process.exit(1);
});
