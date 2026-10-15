# Spider — production run-book

1. `cp deploy/env/api.env.example deploy/env/api.env` and `cp deploy/env/web.env.example deploy/env/web.env`, fill secrets (both gitignored).
2. MySQL 8 on the VPS: create database `pro_spider_app_db` and user `missiria`.
3. `npm install && npm run build && npm run db:migrate`
4. `pm2 start ecosystem.config.cjs && pm2 save` → processes `spider-api` (:8090) and `spider-web` (:8091).
5. nginx: symlink `deploy/nginx/spider.conf` into `/etc/nginx/sites-enabled/`, `nginx -t`, reload; certbot for `spider.missiria.dev`.
6. GitHub secrets for `.github/workflows/deploy.yml`: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `VPS_PORT`; the VPS `deploy spider` command does git pull + build + migrate + `pm2 reload`.
