# Spider webhooks and API export

For automation tools (n8n, Make, Zapier, Notion via a middleware, Leader, custom scripts).
Everything below is tenant-scoped: a webhook belongs to one workspace and only receives that
workspace's events.

## Events

| Event | When | `data` |
|---|---|---|
| `opportunity.created` | an alert rule matched a new opportunity (see Alerts) — delivered as `alert.triggered` | — |
| `alert.triggered` | an alert rule fired (opportunity, sync failure, revoked access) | `rule`, `kind`, `title`, plus the subject fields (`opportunity_id`, `priority`, `score`, `property`, `url`, … or `sync_run_id`, `error`, … or `property_id`, `site_url`) |
| `sync.failed` | reserved; today sync failures reach you through `alert.triggered` with `kind: "sync_failed"` | — |
| `property.revoked` | reserved; today through `alert.triggered` with `kind: "property_revoked"` | — |
| `report.generated` | a scheduled report ran (sent, skipped or failed) | `report_id`, `title`, `period`, `data_through`, `recipients`, `delivery`, `url` |
| `test` | "Send test" button / `POST /webhooks/:id/test` | `message`, `sent_at` |

Subscribe to `alert.triggered` for opportunities, sync failures and revocations; configure
what fires in Settings → Alerts (priorities, rules, properties).

## Payload

```json
{
  "id": "alert.triggered:alert:3:opportunity:42",
  "event": "alert.triggered",
  "created_at": "2026-10-15T16:02:11.000Z",
  "workspace": { "id": 1, "slug": "missiria" },
  "app_url": "https://spider.missiria.dev",
  "data": { "rule": "High opps to n8n", "kind": "opportunity", "title": "[high] Possible clicks drop …", "opportunity_id": 42, "priority": "high", "score": 100, "property": "iptv-premium-europe.com", "url": "https://spider.missiria.dev/opportunities/42" }
}
```

Headers: `Content-Type: application/json`, `User-Agent: Spider-Webhooks/1.0`,
`X-Spider-Event`, `X-Spider-Delivery` (numeric id), `X-Spider-Signature`.

## Signature (verify it)

`X-Spider-Signature: t=<unix seconds>,v1=<hex>` with
`v1 = HMAC-SHA256(secret, "<t>.<raw body>")`. The secret is shown once when the webhook is
created. Reject if `|now − t| > 300 s` or the HMAC differs (constant-time compare).

Node:
```js
const crypto = require("crypto");
function verify(secret, rawBody, header) {
  const p = Object.fromEntries(header.split(",").map((kv) => kv.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(p.t)) > 300) return false;
  const v1 = crypto.createHmac("sha256", secret).update(`${p.t}.${rawBody}`).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(v1, "hex"), Buffer.from(p.v1, "hex"));
}
```

Python:
```python
import hmac, hashlib, time
def verify(secret, raw_body: bytes, header: str) -> bool:
    p = dict(kv.split("=") for kv in header.split(","))
    if abs(time.time() - int(p["t"])) > 300: return False
    v1 = hmac.new(secret.encode(), f'{p["t"]}.'.encode() + raw_body, hashlib.sha256).hexdigest()
    return hmac.compare_digest(v1, p["v1"])
```

n8n: Webhook node (POST, "Raw body" on) → Crypto node (HMAC SHA256 over `{{$json.headers['x-spider-signature'].split(',')[0].slice(2)}}.{{$json.body}}`) → IF equal → continue.

## Delivery and retries

- Respond `2xx` within 10 s. Anything else (or a timeout) is retried after 5 min, 30 min and
  2 h (4 attempts total), then marked failed. Redirects are not followed.
- One event is delivered at most once per endpoint (`(webhook, dedupe key)` is unique); a
  manual re-run never duplicates.
- Settings → Webhooks shows the last 25 deliveries per endpoint with status, HTTP code and
  error; `GET /webhooks/:id/deliveries` returns the same.
- URLs must be `https://` on a public host in production (no loopback / private ranges).

## JSON / CSV / PDF export over the API

Authenticate with a session cookie or `Authorization: Bearer <jwt>` (`POST /auth/login`).

| Endpoint | Returns |
|---|---|
| `GET /api/reports` | report templates with their schedules |
| `GET /api/reports/:id/data` | the report as JSON (overview, tables with coverage notes, opportunities, definitions context) |
| `GET /api/reports/:id/export.csv?section=overview|pages|queries|countries|devices|search_appearance|opportunities` | CSV (UTF-8 BOM) |
| `GET /api/reports/:id/export.pdf` | branded PDF |
| `GET /api/overview?days=28` / `GET /api/properties/:id?days=28` | raw analytics (same as the UI) |
| `GET /api/opportunities?status=active` | opportunity inbox |

## Connectors status (honest)

- **Generic webhook + JSON export: implemented and tested** (signature verified end to end in the
  integration suite).
- **n8n**: works through the generic webhook / HTTP Request nodes as described above; no
  packaged n8n node exists.
- **Notion, Leader**: not implemented as connectors. Use a middleware (n8n / script) that
  receives the webhook and calls their APIs.
