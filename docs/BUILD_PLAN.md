# Build and release checklist

## Completed development slice

- [x] Official Shopify React Router authentication scaffold.
- [x] Persistent catalog, drafts, write journal, and history.
- [x] Outdoor checklist with explicit sources and conflict detection.
- [x] Merchant-confirmed draft generation and manual publishing approval.
- [x] Safe preview as text; escaped appended HTML.
- [x] Fresh-source fingerprint checks, operation locks, result verification, restore safeguards.
- [x] Resumable scan and full metafield pagination.
- [x] Authenticated product, uninstall, and compliance webhook handlers.
- [x] Responsive demo, integration tests, browser workflow tests, typecheck, lint, build.
- [x] Second QA pass: regression fixes, isolated test databases, and compiled-server smoke checks. See [QA report](QA_REPORT.md).
- [x] GraphQL schema validation against API 2026-10.

## Development-store validation — requires Shopify account/app/store

- [ ] Link the client ID and complete Shopify CLI config validation.
- [ ] Install/uninstall/reinstall on two stores; verify complete data isolation.
- [ ] Verify embedded navigation, form submissions, session expiry, and offline token refresh.
- [ ] Run empty, one-page, multi-page, deleted-product, and failed/resumed scans.
- [ ] Validate product webhook HMAC failures, duplicate delivery, late delivery, and own publishing events.
- [ ] Publish representative HTML, verify Shopify normalization, inspect storefront, and restore.
- [ ] Exercise token loss, API throttling, explicit write rejection, and ambiguous network failures.
- [ ] Verify read/write scope revocation and deletion/privacy behavior.

## Merchant pilot

- [ ] Five outdoor stores; review the category checklist for their product subtypes.
- [ ] Measure time to first useful draft and merchant acceptance/rejection reasons.
- [ ] Normalize recognized JSON/list/unit metafields without losing variant-specific context.
- [ ] Validate scan and UI performance up to 500 products.
- [ ] Resolve the read/write concurrency window and define a tested support recovery process.
- [ ] Add notifications and actionable monitoring for failed/uncertain operations.

## Public release

- [ ] Managed PostgreSQL and durable queue worker for scheduled scans.
- [ ] Encrypted token storage, backups, retention policy, restore drill, and production monitoring.
- [ ] Shopify managed pricing and tested plan activation/cancellation/limit handling.
- [ ] Server-side catalog/history pagination, usage limits, and rate-limit-aware jobs.
- [ ] Resolve remaining development dependency advisories.
- [ ] Privacy policy, support contact, accurate listing, and App Store requirements review.
- [ ] Complete required Shopify review before publishing the listing.

Expand categories and introduce source-constrained language-model rewriting only after the core merchant workflow is proven. Keep AI mention tracking a separate later milestone with honest sampling limitations.
