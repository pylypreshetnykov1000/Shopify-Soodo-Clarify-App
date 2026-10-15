import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { context } from "../services/context.server";
import { getGeoProduct } from "../services/geo.server";
import { AppLink, Badge } from "../ui/common";

export async function loader({ request, params }: LoaderFunctionArgs) {
  const ctx = await context(request);
  return { ...(await getGeoProduct(ctx.shop, params.id!)), demo: ctx.demo };
}
export default function ProductGeoChecks() {
  const data = useLoaderData<typeof loader>();
  const { report } = data;
  const renderCheck = (check: (typeof report.checks)[number]) => (
    <div className="geo-check" key={check.id}>
      <div className="geo-check-heading">
        <h3>{check.label}</h3>
        <Badge
          tone={
            check.status === "pass"
              ? "success"
              : check.status === "unknown"
                ? "neutral"
                : "warning"
          }
        >
          {check.status === "pass"
            ? "Data found"
            : check.status === "unknown"
              ? "Not checked"
              : `${check.priority} priority`}
        </Badge>
      </div>
      <p>{check.evidence}</p>
      {check.status !== "pass" && (
        <>
          <p className="geo-action-copy">{check.action}</p>
          {check.destination === "facts" ? (
            <AppLink
              to={`/app/products/${data.recordId}`}
              className="text-link"
            >
              Review product facts →
            </AppLink>
          ) : check.destination === "scan" ? (
            <AppLink to="/app/geo" className="text-link">
              Go to catalog scan →
            </AppLink>
          ) : data.adminUrl ? (
            <a
              className="text-link"
              href={data.adminUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Edit in Shopify ↗
            </a>
          ) : (
            <small>
              {data.demo
                ? "Shopify-only field. This is a local demo product."
                : "Open the product in Shopify to edit this field."}
            </small>
          )}
        </>
      )}
    </div>
  );
  return (
    <>
      <AppLink to="/app/geo" className="back-link">
        ← Back to GEO checks
      </AppLink>
      <div className="page-heading">
        <div>
          <h1>{data.title}</h1>
          <p>
            {report.passed} of {report.checks.length} data checks passed ·{" "}
            {report.actions} to review
            {report.unknown > 0 ? ` · ${report.unknown} not checked` : ""}
          </p>
        </div>
        <div className="page-actions">
          <AppLink
            to={`/app/products/${data.recordId}`}
            className="button primary"
          >
            Review product facts
          </AppLink>
          {data.adminUrl && (
            <a
              href={data.adminUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="button secondary"
            >
              Edit in Shopify ↗
            </a>
          )}
        </div>
      </div>
      <p className="geo-scope-note">
        Evidence comes from the last imported product data. Metafields can
        contain facts that your storefront does not display. These checks do not
        measure AI recommendations.
      </p>
      {report.needsRescan && (
        <div className="notice">
          This product was imported before discovery fields were added.{" "}
          <AppLink to="/app/geo" className="text-link">
            Scan your catalog
          </AppLink>{" "}
          to check its vendor, URL, and search-preview data.
        </div>
      )}
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>Checks and next steps</h2>
            <p>
              Review the highest-priority issues first. Shopify-only fields are
              edited in your product admin.
            </p>
          </div>
        </div>
        <div className="geo-check-list">{report.issues.map(renderCheck)}</div>
        {report.passed > 0 && (
          <details className="geo-passed">
            <summary>Passed data checks ({report.passed})</summary>
            <div className="geo-check-list">
              {report.checks
                .filter((c) => c.status === "pass")
                .map(renderCheck)}
            </div>
          </details>
        )}
      </section>
      <section className="card geo-answers">
        <div className="card-heading">
          <div>
            <h2>Buyer questions supported by your facts</h2>
            <p>
              Only recognized, consistent source values are shown. This is an
              evidence review, not a prediction of an AI answer.
            </p>
          </div>
        </div>
        <div className="geo-check-list">
          {report.answers.map((answer) => (
            <div className="geo-check" key={answer.key}>
              <div className="geo-check-heading">
                <h3>{answer.question}</h3>
                <Badge
                  tone={
                    answer.status === "description"
                      ? "success"
                      : answer.status === "stored"
                        ? "info"
                        : "warning"
                  }
                >
                  {answer.status === "description"
                    ? "In description"
                    : answer.status === "stored"
                      ? "Stored fact only"
                      : answer.status === "conflict"
                        ? "Conflicting values"
                        : "Needs a verified fact"}
                </Badge>
              </div>
              {answer.value && (
                <p className="geo-answer-value">{answer.value}</p>
              )}
              <small>
                {answer.status === "description"
                  ? "A matching explicit value appears in the product description. Check the rendered storefront after publishing."
                  : answer.status === "stored"
                    ? `${answer.source}. Public storefront visibility has not been confirmed; include verified facts in an approved description draft.`
                    : answer.status === "conflict"
                      ? "Correct the source conflict before using this answer."
                      : "No answer is generated when a verified value is missing."}
              </small>
            </div>
          ))}
        </div>
      </section>
      <details className="help-details geo-help">
        <summary>What this review does not check</summary>
        <p>
          Robots rules, noindex tags, canonical URLs, rendered JSON-LD, offer
          prices/availability, indexing, and AI search mentions require separate
          storefront and platform checks. A full data checklist does not
          guarantee crawling, indexing, or a recommendation.
        </p>
        <p>
          See{" "}
          <a
            href="https://developers.google.com/search/docs/appearance/ai-features"
            target="_blank"
            rel="noopener noreferrer"
            className="text-link"
          >
            Google guidance for AI search features ↗
          </a>
          . Existing SEO fundamentals and content visible to shoppers remain
          relevant.
        </p>
      </details>
    </>
  );
}
