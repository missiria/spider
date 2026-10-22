# Deploy the Spider super-admin dashboard

Target: `https://spider.missiria.dev/x-dashboard`.

The dashboard is part of the existing Next.js application. The existing nginx
`location /` forwards this path to Spider web; no additional public service or
Next.js base path is needed.

## What ships (MISS-0124)

- `/x-dashboard` (web `src/app/x-dashboard/`): server-side layout asks the API
  `GET /admin/whoami`; no session → login, not a super admin → 404.
- API `/admin/*` (`api/src/admin/`), every route behind `SuperAdminGuard`:
  super admin = role `admin` in the operator workspace (slug `missiria`), the same
  rule as signup review. Overview counts, all accounts (deactivate / reactivate,
  deactivation revokes sessions, never yourself), workspaces, SMTP status without
  credentials, SMTP test mail to the signed-in super admin only.
- Signup review on the page reuses `/signups`.
- Not in this release: brand assets (logos / banners / images) and plan management.

## Prerequisites

- Provision super admins as admins of the `missiria` workspace (System → Beta
  access, role admin). Never place credentials in this deployment file or grant
  access by URL alone.
- Configure `deploy/env/api.env` and `deploy/env/web.env` as described in
  [PRODUCTION.md](PRODUCTION.md), including the database and matching proxy secrets.
- Run the existing integration checks in CI for the reviewed commit and take a
  database backup before applying migrations.

## Run on the VPS

Use the existing checkout at `/var/www/MISSIRIA/apps/spider-app`. Check out the
reviewed commit, then run:

```bash
bash deploy/x-dashboard.sh
```

Do not run this concurrently with the existing GitHub Actions deployment or
`deploy spider`. This script deploys the whole application from the current
checkout; it does not pull code, configure nginx, or create secrets. It checks
the route and env files, installs dependencies, runs project checks, builds,
applies migrations, reloads PM2, and checks public health and anonymous admin access.
It stops before installation if the dashboard page is missing.

## Verify after deployment

1. Anonymous visitors must be sent to login or denied access.
2. Regular accounts must be denied the page and every admin API endpoint.
3. A super admin must be able to review account requests and manage branding,
   SMTP settings, and plans once those features are implemented.
4. Confirm changes persist and appear in the audit history; test SMTP delivery
   without exposing credentials in API responses or logs.

A successful anonymous redirect check alone does not prove authorization.
Use the rollback procedure in [PRODUCTION.md](PRODUCTION.md) if validation fails;
the script does not automatically reverse database migrations.
