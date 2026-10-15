# Spider — production run-book

1. `cp deploy/env/api.env.example deploy/env/api.env` and `cp deploy/env/web.env.example deploy/env/web.env`, fill secrets (both gitignored).
2. MySQL 8 on the VPS: create database `pro_spider_app_db` and user `missiria`.
3. `npm install && npm run build && npm run db:migrate`
4. `pm2 start ecosystem.config.cjs && pm2 save` → processes `spider-api` (:8090) and `spider-web` (:8091).
5. nginx: symlink `deploy/nginx/spider.conf` into `/etc/nginx/sites-enabled/`, `nginx -t`, reload; certbot for `spider.missiria.dev`.
6. GitHub secrets for `.github/workflows/deploy.yml`: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_PORT`; the VPS `deploy spider` command does git pull + build + migrate + `pm2 reload`.

## Domain

`spider.missiria.dev` → A 81.17.98.31, Cloudflare **proxied** (set 2026-10-15). Cloudflare terminates TLS; nginx serves plain HTTP on :80 with `server_name spider.missiria.dev` (Cloudflare SSL mode "Flexible" works as is; for "Full (strict)" add a certbot cert on the VPS). The VPS must know the app: register `spider` in the global `deploy <app>` batch (clone path, `npm ci && npm run build && npm run db:migrate && pm2 reload ecosystem.config.cjs`).
