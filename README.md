# Soodo GEO

A Shopify embedded app that checks what search engines and AI shopping assistants can read about each product — live page access, structured data, category, identifiers, offer data and buyer facts — and turns the gaps into a prioritized fix plan. Missing specifications are added through source-based description drafts that are published only after merchant approval, with saved snapshots.

## Run the interactive demo

Requires Node 22.12+ and npm. No Shopify or AI credentials are needed for the demo.

```powershell
npm ci
npm run setup
npm run dev:local
```

Open http://127.0.0.1:3000. The demo has four sample outdoor products, simulated live pages and store policies and uses a persistent local SQLite database. Publishing and restoring work against the local catalog; they never call Shopify. Demo access is restricted to loopback hosts and disabled in production. Demo POST requests require a matching Origin header.

On Windows, stop the dev server before rerunning `npm run setup`: a running Prisma client locks its engine DLL.

## What works

- **Simple Overview (default):** readiness, sales from AI assistants, and "Your next steps" in plain language. A Simple/Detailed switch (saved per store) shows the full dashboard: area tiles, readiness trend and distribution, top fixes, store-wide signals and recent changes. New stores get a one-click **Get started** that imports products, then checks live pages.
- **AI visibility:** writes 12 buyer questions from the catalog (never naming the store), asks Gemini each one with Google Search, and shows a 0–100 score (questions where the store or a product was named, or its site cited), every question with the full answer, the brands recommended instead and the websites Gemini relied on. Runs in resumable batches of three questions. Needs `GEMINI_API_KEY`; the demo and tests use a scripted assistant.
- **Sales from AI assistants:** orders whose first or last visit came from ChatGPT, Perplexity, Gemini, Copilot, Claude, Meta AI, Grok or DeepSeek (referrer or UTM source), with revenue, share of sales, revenue by assistant and recent orders. Only order number, amount, assistant and landing page are stored; customer redaction requests delete them; rows older than 90 days are removed.
- **Search listing:** a suggested SEO title and meta description built from the product's title, brand, category, description and verified facts, editable with a Google-style preview, then draft → approve → publish → verify → restore like descriptions.
- **Buyer Q&A:** optionally added to description drafts, answering each buyer question only with a verified fact.
- **In-app help:** a Help panel per screen and a Help page, with annotated screenshots (see Guide below).
- **One-click scan:** imports products in small batches with progress and pause; collects category, category attributes, variants (barcodes, SKUs, prices, availability), media, SEO fields and store policies.
- **Live page checks:** loads the public product page and robots.txt over HTTPS (public addresses only, bounded time and size), then reports HTTP status, password protection, noindex, canonical, Product JSON-LD (duplicates, invalid blocks, price/stock mismatches with Shopify), whether published specs are visible, and access for search, assistant and training crawlers.
- **19 product checks** in four groups (visibility, identity, content, offer & trust), each with evidence, priority and a concrete next step. Readiness weights checks by priority and ignores checks that could not run.
- **Fix plan:** every issue grouped by type across active products, so similar fixes can be done in one pass.
- **Specification checklists by category:** outdoor, apparel, beauty, electronics, home, food and general. Automatic per product from the Shopify category, or fixed in Settings. Facts come from explicit description labels, recognized metafields and Shopify category attributes, with conflict detection.
- Draft creation from existing facts and merchant-confirmed missing values, with per-value sources; approval, rejection, publishing, remote verification, snapshots and restore.
- Stale-source checks before publishing, per-product operation locks and durable publishing journals. Uncertain writes block further changes.
- Official Shopify authentication and session storage; all queries are scoped to the authenticated shop.

Draft generation uses deterministic templates. No external language model is connected, and the app does not claim to measure or guarantee AI rankings. Publishing appends a visible specifications section to the existing product description, rather than writing new metafields or changing theme code.

## Guide

The in-app help and `docs/guide` (HTML and PDF) come from `app/core/guide.ts` and the screenshots in `public/guide`. After changing screens, run the demo, then:

```powershell
$env:GUIDE_URL="http://127.0.0.1:3000"; $env:GUIDE_DB="prisma/dev.sqlite"; npm run guide:capture
npm run guide:build
```

`guide:capture` resets the demo store and walks through every screen, drawing numbered callouts. `guide:build` writes `docs/guide/index.html`, the PDF, and the PDF served by the app.

## Connect Shopify

The app uses Shopify's official React Router starter and GraphQL Admin API `2026-10`. The local config has been linked to a Shopify app; use your own app's client ID when deploying a separate installation.

1. Create or select an app and a development store in the Shopify Dev Dashboard.
2. Run `npm run config:link` and complete Shopify's interactive authentication to link the app.
3. Keep the `read_products,write_products,read_metaobjects,read_legal_policies,read_orders` scopes and webhook subscriptions in `shopify.app.toml`. Existing installations are asked to approve the two new read scopes; until then, policies show as "not checked".
4. Run `npm run dev` and install the app on the development store.
5. Run scans until complete, create a draft, publish, inspect the actual storefront, and restore it.

The Shopify CLI supplies development credentials and tunnel URLs. For hosted environments, supply the variables in `.env.example` and update app/redirect URLs. Do not use placeholder URLs for deployment. Never enable demo mode on a host.

## Render staging deployment

Set `GEMINI_API_KEY` (a Google AI Studio key) in the Render dashboard to turn on AI visibility tests; `GEMINI_MODEL` defaults to `gemini-flash-latest`. Locally, put the key in `.env`, which git ignores. Never commit the key.

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
