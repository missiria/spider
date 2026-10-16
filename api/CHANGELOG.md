# Changelog

## [0.1.0](https://github.com/missiria/spider/compare/api-v0.0.1...api-v0.1.0) (2026-10-16)


### Features

* **api:** auth, workspaces, properties with GSC access checker, sync and overview modules ([f123a22](https://github.com/missiria/spider/commit/f123a22b5a9ddfd576c25a14f3bd4ec30d500ca6))
* **api:** dimensional dataset — daily rows per query, page, country, device and search appearance (MISS-0091) ([6d9aa3c](https://github.com/missiria/spider/commit/6d9aa3c6e74e029e8e090ad81a32c286090399c2))
* custom date range, server-side regex filters and saved views (MISS-0092) ([2a535a1](https://github.com/missiria/spider/commit/2a535a11cefa601e70ae01234f8cf1f74dbf4f1c))
* general settings (profile, theme), sortable top tables, collapsible sidebar ([e71e785](https://github.com/missiria/spider/commit/e71e78549a90655b255e1713ae85171223395332))
* Opportunity Inbox — rules, scan, tracking, audit history, before/after (MISS-0093) ([3fe0403](https://github.com/missiria/spider/commit/3fe04034633af610a54412912ea83323997afc48))
* reports, schedules, alerts and signed webhooks (MISS-0094) ([7d027fb](https://github.com/missiria/spider/commit/7d027fb160c26c473f45b7cf5c99f8300835c564))
* security hardening, integration + E2E tests, CI, ops run-book (MISS-0095) ([43bf78f](https://github.com/missiria/spider/commit/43bf78f95e699b3b0a8bb4cf6664242b90b34635))


### Bug Fixes

* **api:** read DATE columns as strings, never crash on a failed sync, public health endpoint ([f419002](https://github.com/missiria/spider/commit/f4190029c6def6c1443b4ed0b7f61dd9aac54f53))
* MISS-0110 session revocation, tenant isolation, sync correctness, consistent filters ([42ea51b](https://github.com/missiria/spider/commit/42ea51bfd40f2298b947a528f3c995bbb8fbb85c))
* **security:** SSRF guard with DNS pinning, SMTP TLS verification on, trusted client IP + per-account login lock ([b1f9d21](https://github.com/missiria/spider/commit/b1f9d21b9957afcc070756a61219bde9e280cf81))
* **security:** trust only nginx-set X-Real-IP, byte-level IPv6 SSRF classifier, lockout per account+IP ([4b3180c](https://github.com/missiria/spider/commit/4b3180c4232c6bd8b1203bd2672303f5abd2b695))
