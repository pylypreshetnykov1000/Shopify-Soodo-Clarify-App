# QA review — October 13, 2026

## Result

The current local build passes 35 unit/integration tests, five Chromium browser tests, three compiled-server smoke checks, TypeScript checks, ESLint, and production compilation. The review found bugs beyond the original test coverage, reproduced seven of them with failing regression tests, and fixed them. No known failure remains in the scenarios exercised below. This does not establish that the app has no possible bugs or that live Shopify integration has passed.

## Fixes made

- Empty specification labels no longer consume the following line's value.
- HTML entity decoding now supports named and numeric entities and performs one decoding pass, preserving literal encoded text.
- Draft generation preserves original whitespace and uses an HTML parser to replace app-owned blocks even when attributes are reordered or quoted differently, or when blocks contain nested elements. An incomplete wrapper fails safely.
- Unknown network write outcomes remain unresolved even when remote content is a third value, preserving the block on further writes. The same safeguard applies to restoring.
- Product operations recheck and renew ownership after reads and before writes; an expired lease cannot start a new remote write or update the cache from that read.
- Scans cannot overwrite a cache refreshed after the batch fetch began or while a product operation owns the lock.
- Completed-scan deletion membership uses a scan identifier rather than timestamps modified by unrelated product reads.
- Entered draft facts survive reload, can be revised, and reset after rejection. Rejecting a draft leaves product content untouched.
- Repeated product/metafield pagination cursors fail explicitly rather than looping.
- Tests use isolated temporary databases and a separate browser server, preserving the working demo.
- Docker build configuration explicitly includes build dependencies and generates Prisma before compiling. A Linux container was not executed because Docker is unavailable here.

## Automated evidence

| Check | Outcome |
| --- | --- |
| `npm test` | 35 tests passed |
| `npm run test:e2e` | Five browser tests passed |
| `npm run test:production` | Three smoke checks passed |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed |
| `npm run build` | Client and server compiled successfully |
| `npm audit --omit=dev` | Zero reported runtime vulnerabilities |

Unit/integration scenarios include explicit-source audits, conflicting values, empty and oversized inputs, HTML escaping/entities, block replacement, no-op drafts, unchanged source facts, cross-store rejection, stale drafts, duplicate/concurrent approval, verified publishing/restoring, preservation of newer edits, acknowledged rejection, ambiguous timeouts, recovery, expired locks, complete/resumed/failed scans, deletion membership, stale scan data, and metafield pagination.

Browser scenarios include search, source review, missing-field entry, approval, publish, restore, mobile layout/navigation, rejecting cross-origin mutations, preserving/editing/rejecting drafts, enforcing server-side approval, scan completion, and catalog filters. Browser page errors are treated as failures. Tests run against the demo adapter, not a live Shopify store.

Compiled-server checks include production startup, loading built stylesheets, disabling demo mode even when the environment requests it, and returning no catalog data to unauthenticated requests. Shopify can return its App Bridge authentication bootstrap with HTTP 200; this is checked for absence of the app workspace and catalog content rather than incorrectly treating every HTML 200 as authenticated access.

## Still requires a connected development store

- Actual installation/reinstallation, embedded App Bridge navigation and form submission.
- Token expiry/refresh, scope revocation, and real GraphQL writes.
- Shopify's HTML normalization, storefront rendering, and restore against real content.
- Real webhook delivery, HMAC rejection, duplicate/late events, privacy events, and uninstall lifecycle.
- API throttling and large-catalog performance under realistic conditions.
- Shopify configuration validation after linking a client ID.

## Remaining release boundaries

There remains a non-atomic interval between reading a Shopify description and updating it. This implementation detects prior changes and preserves snapshots, but does not guarantee protection against a merchant edit arriving within that interval. Live pilot validation and a stronger publication design are required before claiming that simultaneous external edits cannot be overwritten.

Unacknowledged writes intentionally remain blocked until a saved result can be verified or investigated. There is no blind automatic retry. Exact HTML normalization, conservative webhook invalidation, large-catalog UI scaling, managed production storage, backups, billing, and App Store review remain in the release checklist.

The installed development toolchain still has reported advisories. Runtime-only audit passed; neither result proves the absence of vulnerabilities. Docker build changes have been reviewed but not executed in a Linux container.
