# UX and performance review — October 15, 2026

## Findings and changes

- Replaced the layered stylesheet with one responsive design. Removed the green promotional panels, decorative sparkle icons, repeated slogans, fake account avatar, and redundant setup strip. The overview now shows catalog totals and a direct product review action.
- Removed the pulsing loading bar. A quiet, delayed loading message reserves its space in the header; fast requests do not flash an indicator. Back/forward navigations use the current navigation instance, so an old loading state cannot reappear.
- Submission labels now describe only the operation in progress. Rejecting a draft does not make the publish and draft buttons claim that they are working. Mutations remain disabled while a request is pending.
- Collapsed old published/rejected drafts, distinguished stale drafts, kept source review and approval, and simplified the login and settings screens. Embedded Shopify screens use Shopify's native navigation rather than showing a second sidebar.
- Removed the external font stylesheet and the separate Polaris runtime from the standalone login screen. The existing App Bridge authentication integration is unchanged.
- Catalog queries select draft identity and fingerprint rather than full snapshots. List responses omit descriptions and source values. Product/history previews are converted to safe text on the server, so the browser no longer needs the HTML entity decoder.
- Catalog rendering is capped at 50 rows per page. Search and filters reset pagination. Filtering, sorting, and summary calculations are memoized.
- Existing stores avoid an unnecessary upsert on catalog reads. Demo initialization is atomic and skips repeated writes. Independent catalog/store reads run together.

## Evidence

| Build artifact                  |   Before |    After |
| ------------------------------- | -------: | -------: |
| App CSS, minified               | 19.56 kB | 14.56 kB |
| Shared catalog module, minified | 24.78 kB |  0.81 kB |
| Shared catalog module, gzip     | 16.22 kB |  0.41 kB |

These are Vite output sizes, not guarantees about page loading speed. A regression test verifies that a product with over 20 kB of description text produces a catalog list response smaller than 1 kB while preserving draft freshness checks.

Verification completed:

- 38 unit/service tests, including publish/restore safety and the slim catalog response.
- 11 browser tests: scan, search, sort, filter reset, draft revision/rejection, approval, publish, restore, slow submissions, delayed navigation, and pagination with 124 products.
- All four workspace routes checked for viewport overflow at 320, 390, 768, 1024, and 1440 pixels. No running CSS animations or external font downloads.
- Four production smoke checks: startup, built assets, authentication boundaries, and database health.
- Type checking, lint, and production build.
- Desktop overview and mobile product review screenshots inspected.
- Public Render homepage and database health endpoint returned HTTP 200.

The Shopify AI Toolkit UI validator was attempted, but its isolated environment could not resolve the React JSX runtime/project imports. This is not a successful toolkit validation; the project checks and browser verification above are the evidence for this change.

## Limits and deployment

Changes are local until committed, pushed, and redeployed. Live authenticated Shopify installation, webhooks, and publishing have not been retested in this review.

Render Free spins idle web services down after 15 minutes and documents a wake-up delay of about a minute: https://render.com/docs/free#spinning-down-on-idle. Removing that delay requires changing the web service compute plan; no paid plan was selected by the agent.

Pagination bounds browser rendering. Catalog records are still read and audited on the server for totals; very large stores will need server-side pagination/aggregated audits as a separate scaling step. No cross-store data cache or authentication bypass was introduced.
