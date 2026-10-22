# Shared email branding

The global editor is at `/x-dashboard/email`, linked from **System** for operator
admins. Tenant admins cannot view or edit it. Access is checked by the Next.js
server and on every API endpoint using the verified user and operator workspace.

## Release

1. Back up the database and deploy the reviewed release through the existing
   workflow in [PRODUCTION.md](PRODUCTION.md).
2. Run `npm run db:migrate` before reloading processes. The additive
   `EmailBrandRevisions1792800000000` migration creates the global revision table.
3. Confirm both API and web processes are healthy and `/api/health` returns 200.
4. As an operator admin, open System → Manage shared email branding. Confirm
   a regular member and a customer workspace admin are denied both page and API.
5. Set a public HTTPS logo URL, brand name, accent color, support address,
   company information, website, and footer. Save draft, preview the email types,
   and send a test to yourself. Publish only after checking the result.
6. Exercise confirmation, approval/rejection, reset, alert, and report emails.
   Check that report attachments remain present. Verify Gmail, Apple Mail, and
   Outlook rendering, including a narrow mobile viewport.

Every `MailerService.send` call now renders its plain-text source through the
same HTML shell and appends the same branding to the text alternative. The
layout footer (HTML and text) also prints the MISSIRIA social profiles from
`api/src/integrations/mail/social-links.ts` (MISS-0126); MailerService no longer
appends a separate social footer, so the links appear once. Draft
previews/tests use the same renderer; ordinary delivery only reads published
branding. Save/publish operations append revisions with actor and timestamp.
A previous brand can be restored by saving its values as a new draft and publishing.

The first release uses English copy. Template previews include a sample account
creation message; the editor does not add a new account provisioning workflow.
Report/alert paragraphs with multiple `Label: value` lines render as fact tables.
Standalone HTTPS action links render as buttons with visible URL fallbacks.
Message content is escaped and branding URL/color fields are validated.
The shell uses table markup and a shared CSS block; cross-client rendering must
be checked manually, especially clients that strip head styles.

## Delivery configuration

SMTP remains configured via `deploy/env/api.env`; this change does not expose
credentials or edit SMTP settings from the branding CMS. `MAIL_FROM` and
`MAIL_FROM_NAME` determine the actual envelope/display sender. They should match
an authenticated sending domain. Branding support details are separate.
`APP_PUBLIC_URL` determines default website/logo URLs and existing account links.
The default logo path is `/brand/spider-logo.png`; publish a reachable HTTPS image
URL if the deployment does not serve that asset.

Test delivery is rate-limited to five requests per minute and goes only to the
signed-in operator's verified account address. When SMTP is unavailable, the UI
reports that nothing was sent. Preview sample links point at example.com and
carry no real account tokens.

## Offline previews

```bash
npm run mail:preview -w api
```

Writes HTML and text files for eight sample emails under `api/tmp/mail-preview/`
(gitignored), without database or SMTP access. Default offline previews omit the
logo because they are not associated with a running deployment.
