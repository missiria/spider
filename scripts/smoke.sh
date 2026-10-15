#!/usr/bin/env bash
# Post-deploy smoke test. Usage: scripts/smoke.sh https://spider.missiria.dev admin@missiria.dev 'password'
# Exit code 0 = healthy. Prints one line per check.
set -euo pipefail
BASE="${1:?base url}"; EMAIL="${2:?email}"; PASS="${3:?password}"
JAR="$(mktemp)"; trap 'rm -f "$JAR"' EXIT
ok() { printf '  ok   %s\n' "$1"; }
fail() { printf '  FAIL %s\n' "$1"; exit 1; }

echo "Spider smoke → $BASE"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/health"); [ "$code" = 200 ] && ok "api health 200" || fail "api health $code"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/login"); [ "$code" = 200 ] && ok "web login page 200" || fail "web login $code"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/"); [ "$code" = 307 ] && ok "anonymous / redirects" || fail "anonymous / returned $code"
code=$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/overview"); [ "$code" = 401 ] && ok "api rejects anonymous" || fail "api anonymous $code"
code=$(curl -s -c "$JAR" -o /dev/null -w '%{http_code}' -X POST "$BASE/auth/session" -H 'content-type: application/json' -H "Origin: $BASE" -d "{\"email\":\"$EMAIL\",\"password\":\"$PASS\"}"); [ "$code" = 200 ] && ok "login via session route" || fail "login $code"
code=$(curl -s -o /dev/null -w '%{http_code}' -X POST "$BASE/auth/session" -H 'content-type: application/json' -H "Origin: https://evil.example" -d '{"email":"a@b.c","password":"x"}'); [ "$code" = 403 ] && ok "cross-site login rejected" || fail "cross-site login returned $code"
code=$(curl -s -b "$JAR" -o /dev/null -w '%{http_code}' "$BASE/api/overview?days=7"); [ "$code" = 200 ] && ok "overview with session cookie" || fail "overview $code"
health=$(curl -s -b "$JAR" "$BASE/api/settings/health")
echo "$health" | grep -q '"mock":false' && ok "live GSC mode" || echo "  WARN GSC_MOCK=1 (fixtures)"
echo "$health" | grep -q '"ok":true' && ok "sync health ok" || echo "  WARN sync health needs attention: $(echo "$health" | cut -c1-200)"
hdr=$(curl -s -I "$BASE/login"); echo "$hdr" | grep -qi 'x-frame-options: DENY' && ok "security headers" || fail "security headers missing"
echo "done"
