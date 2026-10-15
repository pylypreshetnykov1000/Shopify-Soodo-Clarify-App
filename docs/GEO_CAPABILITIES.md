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

## Deployment

Run the PostgreSQL migration `20261016120000_geo_signals` (applied automatically by `npm run docker-start`), deploy the app configuration so merchants are asked for the new read scopes, then rescan stores to collect category, variant and policy data. Live Shopify installation, real storefront responses and throttling under load still need testing on a development store.
