#!/usr/bin/env bash
# Run on the VPS from a reviewed checkout: bash deploy/x-dashboard.sh
# Deploys the whole Spider application, which owns /x-dashboard.
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

for command in node npm pm2 curl; do
  command -v "$command" >/dev/null || { echo "Missing command: $command" >&2; exit 1; }
done

for file in deploy/env/api.env deploy/env/web.env; do
  [[ -s "$file" ]] || { echo "Configure $file using its .example file first." >&2; exit 1; }
done

# A deployment configuration cannot create the admin area or its authorization.
# Require an actual App Router page before touching the running application.
if ! find web/src/app -type f \( -path '*/x-dashboard/page.tsx' -o -path '*/x-dashboard/page.ts' -o -path '*/x-dashboard/page.jsx' -o -path '*/x-dashboard/page.js' \) -print -quit | grep -q .; then
  echo 'Deployment blocked: implement the /x-dashboard page and server-side super-admin authorization first.' >&2
  exit 1
fi

npm ci
npm run check
npm run build
npm run db:migrate
pm2 startOrReload ecosystem.config.cjs --update-env

BASE_URL="${SPIDER_PUBLIC_URL:-https://spider.missiria.dev}"
BASE_URL="${BASE_URL%/}"
curl --fail --silent --show-error --retry 10 --retry-delay 3 --retry-connrefused \
  --connect-timeout 5 --max-time 15 "$BASE_URL/api/health" >/dev/null

# Do not follow redirects: an anonymous admin request must require login.
STATUS="$(curl --silent --show-error --connect-timeout 5 --max-time 15 \
  --output /dev/null --write-out '%{http_code}' "$BASE_URL/x-dashboard")"
case "$STATUS" in
  302|303|307|308|401|403) ;;
  *) echo "Admin access check failed: expected login redirect or access denial, received HTTP $STATUS." >&2; exit 1 ;;
esac

pm2 save
printf 'Deployed. Verify super-admin login and account isolation at %s/x-dashboard\n' "$BASE_URL"
