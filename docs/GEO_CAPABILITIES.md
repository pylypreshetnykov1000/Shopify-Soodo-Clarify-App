# Soodo GEO: capabilities

Updated October 16, 2026. This release adds live page checks, commerce and identity data, category-based checklists, a catalog-wide fix plan, store-wide signals and a redesigned interface. The merchant-approved description workflow is unchanged.

## Data collected

| Source | Data | Scope |
| --- | --- | --- |
| Product query (5 per request) | Status, description, product type, vendor, Online Store URL, SEO title/description, standard category, featured image and alt text, media count, first 10 variants (SKU, first barcode, price, compare-at price, availability), variant count, metafields | `read_products` |
| Category metafields (`shopify` namespace) | Display names of referenced metaobjects / taxonomy values, e.g. color, fabric | `read_metaobjects` |
| Shop query | Name, contact email, primary domain | none beyond the app session |
| Policies query | Refund, shipping, privacy and contact policies, and whether each has content | `read_legal_policies` |
| Public storefront | Product page HTML (≤ 3 MB) and `/robots.txt` (≤ 500 KB) | none; public HTTPS only |

`barcode` is deprecated in Admin API 2026-10; `barcodes(first: 1)` is used. Throttled GraphQL responses are retried up to three times using the reported cost and restore rate. If the policy scope is not granted yet, the scan continues and policy checks show **Not checked**.

## Checks

Nineteen product checks in four groups. Priorities order the work (high 3, medium 2, low 1); readiness is earned weight ÷ possible weight over checks that could run.

- **Visibility:** product status, Online Store page, live page indexable (HTTP 200, not password protected, no `noindex` in meta or `X-Robots-Tag`, canonical matches), search and AI crawler access, Product structured data (exactly one Product/ProductGroup block, valid JSON, price and availability match Shopify).
- **Product identity:** Shopify standard category, brand/vendor, barcodes (GTIN/UPC/EAN), SKUs.
- **Content:** description length, consistent specifications, specifications written in the description, category attributes, images, image alt text, search listing (fallbacks allowed; titles over 70 characters flagged).
- **Offer & trust:** prices, availability (active products only), ratings in Shopify's standard `reviews.rating` metafield.

Store-wide signals: storefront open, crawler policy, refund, shipping, contact and privacy policies.

Crawlers evaluated against robots.txt (RFC 9309: most specific group, longest rule, allow on ties): Googlebot, Bingbot, OAI-SearchBot, PerplexityBot, Claude-SearchBot, Applebot, ChatGPT-User. Training crawlers (GPTBot, Google-Extended, ClaudeBot, CCBot) are reported separately and never count as a visibility failure; blocking them is the merchant's choice.

## Checklists

Profiles: outdoor (material, weight, dimensions/fit, intended use, care), apparel (material, fit, color, care), beauty (ingredients, how to use, size/volume, intended use), electronics (dimensions, weight, compatibility, power, warranty), home (material, dimensions, color, care), food (ingredients, allergens, weight, storage), general (material, dimensions, weight, intended use). **Automatic** (default for new stores) maps the Shopify category path to a profile and falls back to general. Existing stores keep the outdoor checklist until changed in Settings.

## Live page safety

Only `https:` URLs on port 443 with a domain name are fetched. DNS is resolved once; every resolved address must be public (private, loopback, link-local, CGNAT, multicast, documentation and IPv4-mapped ranges are blocked), and the connection uses the validated address, preventing DNS rebinding. Up to five redirects, each revalidated. 8-second timeout, size limits, no credentials or cookies. Batches of four pages run in parallel; robots.txt is fetched once per origin per batch; pages checked in the last 10 minutes are skipped. Nothing in the store is changed.

## What the numbers do not mean

Readiness is not a ranking and a full score does not guarantee indexing, recommendations or AI mentions. Priorities follow public guidance (crawlable pages, accurate structured data matching visible content, complete product attributes, clear facts); they are not experimentally measured ranking factors. A reported crawler permission is what robots.txt says, not proof of crawling. The demo simulates storefront pages locally.

## Not yet built

1. **Write-back for Shopify fields** (SEO title/description, image alt text, category attributes) through the same draft → approve → verify → restore flow.
2. **Commerce consistency across markets:** presentment currencies, market-specific prices and shipping/return details per market.
3. **Measured outcomes:** Search Console and referral traffic from AI assistants, labeled by source and date. No universal AI ranking claims.
4. **Scheduled scans and live checks** on a durable job queue, with change notifications.

## Primary guidance

- [Google: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features)
- [Google: product structured data](https://developers.google.com/search/docs/appearance/structured-data/product)
- [RFC 9309: Robots Exclusion Protocol](https://www.rfc-editor.org/rfc/rfc9309)
- [Shopify Admin API 2026-10: Product](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/Product), [ProductVariant](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/ProductVariant), [TaxonomyCategory](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/TaxonomyCategory), [ShopPolicy](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/ShopPolicy)

## Simple view, AI sales and search listings

- **Dashboard**: readiness, AI visibility, three plain-language next steps built from the action plan (`app/core/actions.ts`), who AI recommends and AI sales figures. Charts live on **Performance**; drafts and published changes on **Content**. `Store.detailed` is no longer used.
- **AI-referred orders** (`app/core/attribution.ts`, `app/services/orders.server.ts`): orders from the last 30 days are read in batches of 100 (8 pages per request, resumable, with a lease). An order counts when its last, otherwise first, visit has an AI assistant referrer (chatgpt.com, perplexity.ai, gemini.google.com, copilot.microsoft.com, claude.ai, meta.ai, grok.com, chat.deepseek.com) or UTM source (for example `utm_source=chatgpt.com`). Test and cancelled orders are skipped. Figures are a floor: in-app browsers may send no referrer. Requires `read_orders` and Shopify's protected customer data access at Level 1 (no names, emails, addresses or phones are read). Only the last 60 days are available without `read_all_orders`; the app reads 30.
- **Search listing** (`app/core/listing.ts`): suggestion from product data only; title ≤ 70 characters, description ≤ 320 (about 160 shown). Published through `productUpdate(seo)` using the same draft, lock, journal, verification and restore pipeline as descriptions (`kind = "seo"`).
- **Buyer Q&A**: optional section in description drafts; each question answered only with a verified fact.

## AI visibility test

- `app/core/visibility.ts` builds a catalog brief (active product types, counts, price ranges, example titles), parses answers and detects the store. `app/services/gemini.server.ts` holds the Gemini engine and the scripted demo engine; `app/services/visibility.server.ts` runs tests.
- Gemini writes `QUESTIONS_PER_TEST` (12) shopper questions from the brief, falling back to built-in templates. Each question is asked with the `google_search` tool and a system instruction to answer as a shopping assistant and end with a `BRANDS:` line.
- **Recommended:** the answer names the store, a product title of two or more words, or the store's domain. **Cited:** only the store's site appears among the sources (search grounding titles and links in the answer). The score is (recommended + cited) / answered.
- Three questions per request, in parallel, under a 150-second lease. A batch in which every question fails (bad key, usage limit) stops the test and shows the reason; a single failure is recorded and skipped.
- Sent to Google: product types, example product titles and price ranges. No customer or order data. Answers are stored per test for the merchant to read.
- Answers vary between runs; the page says to compare weekly tests rather than single answers. Other assistants (ChatGPT, Claude, Perplexity) can be added as further engines.

## Readiness history

One reading per store per UTC day (readiness, fully ready products, active products, open fixes) is saved after a completed scan, a completed live-check batch, and each published or restored description. Later readings on the same day replace earlier ones. The Performance trend shows the last 90 days and ends at the current figure; nothing is backfilled for days before the first reading. History is deleted with the store on uninstall or shop redaction. The demo seeds a few weeks of sample readings.

## Deployment

Run the PostgreSQL migrations `20261016120000_geo_signals`, `20261017090000_readiness_snapshots`, `20261019090000_ai_orders_and_kinds` and `20261020090000_visibility_tests` (applied automatically by `npm run docker-start`), deploy the app configuration so merchants are asked for the new read scopes, then rescan stores to collect category, variant and policy data. Live Shopify installation, real storefront responses and throttling under load still need testing on a development store.
