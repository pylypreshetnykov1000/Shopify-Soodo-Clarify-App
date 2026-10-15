# Soodo Product Clarity

A Shopify embedded app that audits outdoor product specifications, creates source-based description drafts, and publishes merchant-approved changes with saved snapshots.

## Run the interactive demo

Requires Node 22.12+ and npm. No Shopify or AI credentials are needed for the demo.

```powershell
npm ci
npm run setup
npm run dev:local
```

Open http://127.0.0.1:3000. The demo has four sample outdoor products and uses a persistent local SQLite database. Publishing and restoring work against the local catalog; they never call Shopify. Demo access is restricted to loopback hosts and disabled in production. Demo POST requests require a matching Origin header.

On Windows, stop the dev server before rerunning `npm run setup`: a running Prisma client locks its engine DLL.

## What works

- Searchable product catalog with gap, draft, and completeness filters.
- Five explicit checks: material, weight, dimensions/fit, intended use, and care.
- Reading existing description labels and recognized product metafields, with conflict detection.
- Draft creation from existing facts and merchant-confirmed missing values, with per-value sources.
- Merchant approval, draft rejection, Shopify description publishing, remote verification, and snapshots.
- Stale-source checks before publishing and current-description checks before restore.
- Per-product operation locks and durable publishing journals. Uncertain writes block further changes.
- Resumable catalog scans, complete metafield pagination, product invalidation webhooks, authenticated uninstall and privacy handlers.
- Official Shopify authentication and session storage; all product/history queries are scoped to the authenticated shop.

Draft generation uses deterministic templates. No external language model is connected, and the app does not claim to measure or guarantee AI rankings. Publishing appends a visible specifications section to the existing product description, rather than writing new metafields or changing theme code.

## Connect Shopify

The app uses Shopify's official React Router starter and GraphQL Admin API `2026-10`. The local config has been linked to a Shopify app; use your own app's client ID when deploying a separate installation.

1. Create or select an app and a development store in the Shopify Dev Dashboard.
2. Run `npm run config:link` and complete Shopify's interactive authentication to link the app.
3. Keep the `read_products,write_products` scopes and webhook subscriptions in `shopify.app.toml`.
4. Run `npm run dev` and install the app on the development store.
5. Run scans until complete, create a draft, publish, inspect the actual storefront, and restore it.

The Shopify CLI supplies development credentials and tunnel URLs. For hosted environments, supply the variables in `.env.example` and update app/redirect URLs. Do not use placeholder URLs for deployment. Never enable demo mode on a host.

## Render staging deployment

The repository includes a [Render Blueprint](render.yaml), a separate PostgreSQL schema and migration history, and a database health endpoint. Follow [the deployment guide](docs/RENDER_DEPLOYMENT.md). The Blueprint proposes paid web/database services; review Render's costs before creating them. Local demo/tests continue to use SQLite. Real PostgreSQL connectivity and the Linux container build still need validation on the hosting environment.

References: [official starter](https://github.com/Shopify/shopify-app-template-react-router), [authentication](https://shopify.dev/docs/apps/build/authentication-authorization), [productUpdate](https://shopify.dev/docs/api/admin-graphql/2026-10/mutations/productUpdate), [App Store requirements](https://shopify.dev/docs/apps/launch/shopify-app-store/app-store-requirements).

## Checks

```powershell
npm run typecheck
npm test
npx playwright install chromium
npm run test:e2e
npm run build
npm run test:production
npm run lint
```

All test commands create a separate temporary SQLite database from the actual migrations, then remove it. Browser tests start their own server on port 3101 and never reuse or reset your demo on port 3000. The production smoke test runs the compiled server on port 3103 with placeholder credentials; it checks startup, assets, disabled demo access, and the unauthenticated response without contacting a real Shopify store. Build before running that check.

See [the latest QA report](docs/QA_REPORT.md) for tested scenarios, fixes, and remaining validation boundaries.

## Pilot boundaries and release gates

This is a working development/pilot build, not an App Store release. Live installation, authenticated embedded navigation, token refresh, real webhook delivery, and storefront HTML normalization need validation on a connected development store. The owner reported successful Shopify CLI configuration validation after linking the app. GraphQL operations passed Shopify Toolkit schema validation. The Toolkit's full-file UI checker could not resolve its own React/module environment; project TypeScript checks and browser tests passed instead.

- SQLite is for local demo/tests. Render deployment uses the separate PostgreSQL schema/migrations. Before a public launch, validate that deployment, token protection, and backups/restores.
- Catalog scans are manually resumed in batches of ten. Scheduled jobs, large-catalog server pagination, and billing are future work. Validate pilot performance with up to 500 products before expanding.
- Product webhooks conservatively invalidate drafts and mark the scan out of date. The UI cache is refreshed by the next scan; publishing always reads Shopify again.
- The audit recognizes labelled facts, not arbitrary prose, and does not independently verify manufacturer claims. Some structured metafield formats require further normalization before launch.
- Shopify description updates do not expose an atomic compare-and-swap in this implementation. A merchant edit between the final read and the mutation is a remaining race; snapshots and verification cannot eliminate it. Address this explicitly during live pilot testing.
- Exact HTML verification can report a conflict if Shopify normalizes markup. Test representative descriptions on the live store before general release; never claim success for an unverified result.
- An unacknowledged request with unchanged remote content remains uncertain, because a delayed write cannot be ruled out. The product stays blocked pending verification/operator investigation; there is no automatic blind retry.
- Paid plans, AI rank monitoring, bulk publishing, LLM rewriting, and storefront blocks are not included.
- Remaining development-tool advisories need resolution before release. `npm audit --omit=dev` reported zero runtime vulnerabilities at verification time.

Uninstall deletes the app's stored catalog, sessions, drafts, and snapshots. It leaves published product descriptions in Shopify. Restore desired descriptions before uninstalling.

See [the build checklist](docs/BUILD_PLAN.md) for the next release steps.
