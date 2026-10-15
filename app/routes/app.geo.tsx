import { useMemo, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { context } from "../services/context.server";
import { ensureStore } from "../services/catalog.server";
import { listGeoProducts } from "../services/geo.server";
import { seedDemo } from "../services/demo.server";
import { AppLink, Badge, Icon, Notice } from "../ui/common";
import type { action } from "./app._index";
export { action } from "./app._index";

export async function loader({ request }: LoaderFunctionArgs) {
  const ctx = await context(request);
  if (ctx.demo) await seedDemo();
  const [products, store] = await Promise.all([
    listGeoProducts(ctx.shop),
    ensureStore(ctx.shop),
  ]);
  return {
    products,
    partial: !!store.syncStarted,
    synced: !!store.syncedAt,
    demo: ctx.demo,
  };
}
export default function GeoChecks() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState("active");
  const [requestedPage, setPage] = useState(0);
  const products = useMemo(
    () => data.products.filter((p) => scope === "all" || p.status === "ACTIVE"),
    [data.products, scope],
  );
  const visible = useMemo(
    () =>
      products
        .filter((p) =>
          p.title.toLowerCase().includes(query.trim().toLowerCase()),
        )
        .sort((a, b) => {
          const priority = (p: typeof a) =>
            p.topIssue?.status === "action"
              ? { high: 0, medium: 1, low: 2 }[p.topIssue.priority]
              : p.unknown
                ? 3
                : 4;
          return (
            priority(a) - priority(b) ||
            b.actions - a.actions ||
            b.unknown - a.unknown ||
            a.title.localeCompare(b.title)
          );
        }),
    [products, query],
  );
  const page = Math.min(
    requestedPage,
    Math.max(0, Math.ceil(visible.length / 50) - 1),
  );
  const shown = visible.slice(page * 50, (page + 1) * 50);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>GEO checks</h1>
          <p>
            Find product information gaps that can make discovery and comparison
            harder.
          </p>
        </div>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="sync" />
          <input
            type="hidden"
            name="restart"
            value={data.partial ? "false" : "true"}
          />
          <button
            className="button secondary"
            disabled={fetcher.state !== "idle"}
          >
            {fetcher.state !== "idle"
              ? "Scanning..."
              : data.partial
                ? "Continue scan"
                : "Scan catalog"}
          </button>
        </fetcher.Form>
      </div>
      <Notice result={fetcher.data} />
      <p className="geo-scope-note">
        Checks use imported Shopify data. They do not test live crawlability,
        structured data, indexing, or AI rankings.
      </p>
      {data.partial && (
        <div className="notice" role="status">
          The catalog scan is incomplete. Results cover imported products only.
          Continue the scan to include the next batch.
        </div>
      )}
      {!data.synced && !data.partial && data.products.length > 0 && (
        <div className="notice">
          Shopify data may have changed. Scan again before relying on these
          results.
        </div>
      )}
      <div className="metrics" aria-label="GEO check summary">
        <div className="metric">
          <span className="metric-label">
            {scope === "active"
              ? "Active imported products"
              : "Imported products"}
          </span>
          <strong className="metric-value">{products.length}</strong>
        </div>
        <div className="metric">
          <span className="metric-label">Need review</span>
          <strong className="metric-value">
            {products.filter((p) => p.actions > 0).length}
          </strong>
        </div>
        <div className="metric">
          <span className="metric-label">Need discovery rescan</span>
          <strong className="metric-value">
            {products.filter((p) => p.needsRescan).length}
          </strong>
        </div>
        <div className="metric">
          <span className="metric-label">All data checks passed</span>
          <strong className="metric-value">
            {products.filter((p) => !p.actions && !p.unknown).length}
          </strong>
        </div>
      </div>
      <section className="card">
        <div className="card-heading">
          <div>
            <h2>Prioritized fixes</h2>
            <p>
              High priority first. A passed data check is not proof of
              visibility in search.
            </p>
          </div>
        </div>
        <div className="table-toolbar">
          <div className="table-controls">
            <label className="search-box">
              <Icon name="search" size={16} />
              <input
                aria-label="Search GEO products"
                placeholder="Search products"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
            </label>
            <label className="sort-control">
              <span className="sr-only">Products included in GEO checks</span>
              <select
                value={scope}
                onChange={(e) => {
                  setScope(e.target.value);
                  setPage(0);
                }}
              >
                <option value="active">Active products</option>
                <option value="all">All imported products</option>
              </select>
            </label>
          </div>
        </div>
        {shown.length > 0 ? (
          <div className="table-scroll">
            <table className="geo-table">
              <caption className="sr-only">
                Prioritized product readiness fixes
              </caption>
              <thead>
                <tr>
                  <th scope="col">Product</th>
                  <th scope="col">First item to review</th>
                  <th scope="col">Checks</th>
                  <th scope="col">
                    <span className="sr-only">Action</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {shown.map((product) => (
                  <tr key={product.recordId}>
                    <td>
                      <AppLink
                        to={`/app/geo/${product.recordId}`}
                        className="text-link"
                      >
                        {product.title}
                      </AppLink>
                      <small className="gap-label">
                        {product.status.toLowerCase()}
                      </small>
                    </td>
                    <td>
                      {product.topIssue ? (
                        <>
                          <Badge
                            tone={
                              product.topIssue.status === "unknown"
                                ? "neutral"
                                : "warning"
                            }
                          >
                            {product.topIssue.status === "unknown"
                              ? "Not checked"
                              : `${product.topIssue.priority} priority`}
                          </Badge>
                          <small className="gap-label">
                            {product.topIssue.label}
                          </small>
                        </>
                      ) : (
                        <Badge tone="success">Data checks passed</Badge>
                      )}
                    </td>
                    <td>
                      <span>
                        {product.passed} / {product.total} passed
                      </span>
                      {product.unknown > 0 && (
                        <small className="gap-label">
                          {product.unknown} not checked
                        </small>
                      )}
                    </td>
                    <td>
                      <AppLink
                        to={`/app/geo/${product.recordId}`}
                        className="button compact"
                      >
                        Review checks
                      </AppLink>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty">
            <h3>
              {data.products.length
                ? "No matching products"
                : "Scan your catalog to start"}
            </h3>
            <p>
              {data.products.length
                ? "Try another search or include all imported products."
                : "The checks will show product-level evidence and specific next steps."}
            </p>
          </div>
        )}
        <div className="table-footer">
          <span role="status">
            {visible.length
              ? `${page * 50 + 1}–${page * 50 + shown.length} of ${visible.length} products`
              : "0 products"}
          </span>
          {visible.length > 50 && (
            <nav className="pagination" aria-label="GEO pages">
              <button
                className="button compact"
                disabled={!page}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>Page {page + 1}</span>
              <button
                className="button compact"
                disabled={(page + 1) * 50 >= visible.length}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </nav>
          )}
        </div>
      </section>
    </>
  );
}
