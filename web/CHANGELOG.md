# Changelog

## [0.2.0](https://github.com/missiria/spider/compare/web-v0.1.0...web-v0.2.0) (2026-10-23)


### Features

* **admin:** MISS-0124 super-admin dashboard at /x-dashboard ([1412376](https://github.com/missiria/spider/commit/1412376486d869363f2e45a911ff191ad1ec8347))
* **api:** dimensional dataset — daily rows per query, page, country, device and search appearance (MISS-0091) ([6d9aa3c](https://github.com/missiria/spider/commit/6d9aa3c6e74e029e8e090ad81a32c286090399c2))
* **auth:** MISS-0116 sign-up with approval, password reset, redesigned auth pages ([130f3a8](https://github.com/missiria/spider/commit/130f3a897f6004fb1bc60e2c43c624a67e9c7c7c))
* **branding:** MISS-0126 link MISSIRIA social profiles from auth pages and every email ([#1](https://github.com/missiria/spider/issues/1)) ([53deeec](https://github.com/missiria/spider/commit/53deeecd530a4a91a33342f0a4c3eff4a3291635))
* custom date range, server-side regex filters and saved views (MISS-0092) ([2a535a1](https://github.com/missiria/spider/commit/2a535a11cefa601e70ae01234f8cf1f74dbf4f1c))
* **email:** MISS-0121 branded email layout and super-admin email CMS ([ea79630](https://github.com/missiria/spider/commit/ea796307513893e311534f169d4232413bd6339f))
* general settings (profile, theme), sortable top tables, collapsible sidebar ([e71e785](https://github.com/missiria/spider/commit/e71e78549a90655b255e1713ae85171223395332))
* Opportunity Inbox — rules, scan, tracking, audit history, before/after (MISS-0093) ([3fe0403](https://github.com/missiria/spider/commit/3fe04034633af610a54412912ea83323997afc48))
* reports, schedules, alerts and signed webhooks (MISS-0094) ([7d027fb](https://github.com/missiria/spider/commit/7d027fb160c26c473f45b7cf5c99f8300835c564))
* **reports:** MISS-0135 export menu, copy, and entity-branded PDF ([e5b5730](https://github.com/missiria/spider/commit/e5b573044502e9787b0e26afe7c573a681d8fa81))
* security hardening, integration + E2E tests, CI, ops run-book (MISS-0095) ([43bf78f](https://github.com/missiria/spider/commit/43bf78f95e699b3b0a8bb4cf6664242b90b34635))
* **web:** fleet overview, properties onboarding and detail, settings, login ([eb1fa3f](https://github.com/missiria/spider/commit/eb1fa3ffad480646f35a768940a852e607c1d51f))
* **web:** fluid full-width top tables with View page and View in Google links ([68cd7e3](https://github.com/missiria/spider/commit/68cd7e369ed8019ef60f3676a2d8efa2a7e70c9d))
* **web:** left sidebar navigation (Overview, Properties, Settings) replaces the top bar ([18cd36f](https://github.com/missiria/spider/commit/18cd36f339d72740386f6aad5b7cf9acdacafac5))
* **web:** put the auth form on the left, web hero on the right ([beac34f](https://github.com/missiria/spider/commit/beac34f867aca2bcf3debaebb2e23fefd7185176))
* **web:** sortable fleet table with site search, status filter and hide-empty toggle ([17dfd43](https://github.com/missiria/spider/commit/17dfd43bcabd554bf8f5ad9c9d489d34cc65da56))
* **web:** write the SEO signals Spider reads across the auth web hero ([e2eaf21](https://github.com/missiria/spider/commit/e2eaf21abb3bac5bb81e2161faadf50374ec7ef4))


### Bug Fixes

* **auth:** MISS-0116 confirm signup email, bind account links, close ?next bypass ([6aeabda](https://github.com/missiria/spider/commit/6aeabda2451c3d4e4fc3d275ee4a9e2206b4027e))
* **auth:** MISS-0116 confirm signup with its password, cap before overwrite, stricter ?next ([e628aee](https://github.com/missiria/spider/commit/e628aeeea2a3e63603ba31b97a57303985e95ac6))
* MISS-0110 session revocation, tenant isolation, sync correctness, consistent filters ([42ea51b](https://github.com/missiria/spider/commit/42ea51bfd40f2298b947a528f3c995bbb8fbb85c))
* **security:** SSRF guard with DNS pinning, SMTP TLS verification on, trusted client IP + per-account login lock ([b1f9d21](https://github.com/missiria/spider/commit/b1f9d21b9957afcc070756a61219bde9e280cf81))
* **security:** trust only nginx-set X-Real-IP, byte-level IPv6 SSRF classifier, lockout per account+IP ([4b3180c](https://github.com/missiria/spider/commit/4b3180c4232c6bd8b1203bd2672303f5abd2b695))
* **web:** natural table layout for the country, device and appearance breakdowns ([1fef5e7](https://github.com/missiria/spider/commit/1fef5e726bd0d7bf9bf873647f6f2089ad0b6df8))
* **web:** server-side login route, cross-site rejection (login CSRF), stable e2e ([1abd3e8](https://github.com/missiria/spider/commit/1abd3e8f8f198d249c088a8f36dfae91782b1846))
