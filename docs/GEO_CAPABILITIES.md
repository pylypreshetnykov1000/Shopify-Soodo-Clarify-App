# Soodo GEO: product readiness release

Implemented October 16, 2026. This release adds product readiness checks and prioritized fixes to the existing merchant-approved description workflow.

## Available now

- **GEO checks** navigation: search imported products, include active/all products, review prioritized findings, and paginate large lists.
- Ten checks: product status, reported Online Store URL, description text, specification conflicts, specifications explicitly present in the description, vendor, product type, featured image, image alternative text, and search-preview content.
- Per-product evidence, priority, and a concrete next action. Description specifications link to the existing facts/draft workflow; Shopify fields link to the product admin when an authenticated numeric product ID is available.
- Five outdoor buyer questions use only recognized, consistent facts. Answers are distinguished as present in the description, stored only in metafields, conflicting, or missing. No answer is invented for missing/conflicting facts.
- Older payloads without discovery metadata show **Not checked** and require a rescan. Blank custom SEO fields are not automatically treated as a failure when product title/description content is available as a fallback.
- Passed checks are collapsed so the report opens with work that needs attention.

The existing product queries now collect vendor, Online Store URL, and SEO title/description. Data is stored in the existing product payload; no database schema migration or extra access scope was added. No external AI API, theme editing, automatic metadata write, or storefront fetch was introduced. Scanning reads data; publishing still requires explicit merchant approval.

## What the numbers mean

The report displays **data checks passed**, not a GEO ranking score. Priorities are application rules for sorting work, not experimentally established ranking factors. A complete checklist does not prove that a product is indexed or recommended.

A matching specification in the imported description is stronger evidence than an Admin metafield alone, but the actual theme can still hide or change content. A reported Online Store URL is not a successful HTTP, robots, indexing, or crawlability test. Product type is not Shopify's standard product category; vendor is not automatically a manufacturer or brand. Search-preview checks inspect available text, not the theme's actual meta tags or a search engine's chosen snippet.

The five specification fields remain the app's **outdoor gear checklist**. Generic metadata checks can be useful across catalogs, but category-specific checklists must be designed and tested before claiming equivalent coverage for other categories.

## Validation

- Expanded GraphQL queries validated with the Shopify AI Toolkit against Admin API 2026-10.
- Unit/service coverage includes legacy data, private versus description facts, conflicts, publication, images, safe links, SEO fallback, and cross-store isolation.
- Browser coverage includes active/all filters, search, evidence review, links to the facts workflow, metadata backfill after scanning, and responsive layouts.
- Existing publishing/restoring, concurrency, authentication, demo isolation, and database-health checks remain in place.
- The standalone Shopify UI validator has unresolved React/runtime module dependencies. Project type checking, lint, build, and browser tests provide UI validation; a successful standalone validator run is not claimed.

## Next releases, in order

1. **Technical storefront review:** verify the actual product HTML, canonical URL, noindex directives, robots rules, and rendered Product/Offer structured data. Bound network requests by authenticated store ownership, validate destinations and redirects, block private network addresses, apply time/size limits, and preserve existing theme schema. Avoid adding duplicate JSON-LD automatically.
2. **Commerce consistency:** compare visible prices/availability, variant identifiers, and shipping/return information with authoritative store data. Support market, currency, and variant differences explicitly.
3. **Category profiles:** replace the single outdoor checklist with merchant-visible profiles grounded in the product's actual category. Keep unknown values empty and record sources.
4. **Measured outcomes:** connect authorized search/analytics sources and label sampled AI-mention observations by query, provider, date, and market. Separate observed traffic/conversions from inferred impact; do not claim universal AI rankings or guaranteed recommendations.

## Primary guidance

- [Google: AI features and your website](https://developers.google.com/search/docs/appearance/ai-features): foundational SEO, accessible textual content, and structured data that matches visible content remain relevant; there is no special markup requirement for AI features.
- [Google: product structured data](https://developers.google.com/search/docs/appearance/structured-data/product): product information can support shopping/search features, with specific requirements and limitations.
- [Shopify: Product API reference](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/Product) and [SEO fields](https://shopify.dev/docs/api/admin-graphql/2026-10/objects/SEO).

## Deployment

Changes need a normal app rebuild/deploy. Rescan existing stores afterwards to populate discovery metadata. Live Shopify installation, actual granted permissions, and storefront rendering still need testing with a development store. The earlier findings in `SECURITY_REVIEW.md` remain separate release-hardening work; this feature does not silently change permissions or GitHub automation.
