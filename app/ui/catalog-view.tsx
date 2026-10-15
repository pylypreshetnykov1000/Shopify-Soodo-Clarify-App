import { useMemo, useState } from "react";
import { useFetcher } from "react-router";
import type { loader, action } from "../routes/app._index";
import { AppLink, Badge, Icon, Notice } from "./common";

const PAGE_SIZE = 50;
export function CatalogView({
  data,
  overview = false,
}: {
  data: Awaited<ReturnType<typeof loader>>;
  overview?: boolean;
}) {
  const fetcher = useFetcher<typeof action>();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("attention");
  const [requestedPage, setPage] = useState(0);
  const products = data.products;
  const summary = useMemo(() => {
    const drafts = products.filter((p) => p.draft).length;
    const gaps = products.filter((p) => p.audit.missing.length > 0).length;
    const complete = products.filter((p) => p.audit.score === 100).length;
    const average = products.length
      ? Math.round(
          products.reduce((sum, p) => sum + p.audit.score, 0) / products.length,
        )
      : 0;
    const next =
      products.find((p) => p.draft) ??
      products.reduce<(typeof products)[number] | undefined>(
        (lowest, p) =>
          p.audit.score < 100 && (!lowest || p.audit.score < lowest.audit.score)
            ? p
            : lowest,
        undefined,
      );
    return { drafts, gaps, complete, average, next };
  }, [products]);
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return products
      .filter(
        (p) =>
          `${p.title} ${p.productType}`.toLowerCase().includes(query) &&
          (filter === "all" ||
            (filter === "gaps" && p.audit.missing.length > 0) ||
            (filter === "ready" && p.draft) ||
            (filter === "complete" && p.audit.score === 100)),
      )
      .sort((a, b) =>
        sort === "title"
          ? a.title.localeCompare(b.title)
          : Number(!!b.draft) - Number(!!a.draft) ||
            a.audit.score - b.audit.score ||
            a.title.localeCompare(b.title),
      );
  }, [products, search, filter, sort]);
  const page = Math.min(
    requestedPage,
    Math.max(0, Math.ceil(visible.length / PAGE_SIZE) - 1),
  );
  const shown = visible.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const scanning = fetcher.state !== "idle";
  const syncedAt = data.store.syncedAt
    ? new Date(data.store.syncedAt).toISOString()
    : null;

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>{overview ? "Overview" : "Products"}</h1>
          <p>
            {overview
              ? "Review product information before publishing changes."
              : "Product details and description drafts."}
          </p>
        </div>
        <div className="page-actions">
          {overview && summary.next && (
            <AppLink
              to={`/app/products/${summary.next.recordId}${summary.next.draft ? "#draft" : ""}`}
              className="button primary"
            >
              {summary.drafts ? "Review next draft" : "Review next product"}
            </AppLink>
          )}
          <fetcher.Form method="post">
            <input type="hidden" name="intent" value="sync" />
            <input
              type="hidden"
              name="restart"
              value={data.store.syncStarted ? "false" : "true"}
            />
            <button
              className={`button scan-button ${products.length ? "secondary" : "primary"}`}
              disabled={scanning}
              aria-busy={scanning}
            >
              <Icon name="search" size={16} />
              {scanning
                ? "Scanning..."
                : data.store.syncStarted
                  ? "Continue scan"
                  : "Scan catalog"}
            </button>
          </fetcher.Form>
        </div>
      </div>
      <Notice result={fetcher.data} />
      {data.store.syncStarted ? (
        <div className="notice" role="status">
          Scan paused after {products.length} imported products. Select Continue
          scan to import the next batch. The figures below cover imported
          products only.
        </div>
      ) : !syncedAt && products.length > 0 ? (
        <div className="notice">
          Your Shopify catalog may have changed. Scan again to refresh these
          results.
        </div>
      ) : null}
      {overview && (
        <>
          <div className="metrics" aria-label="Catalog summary">
            <div className="metric">
              <span className="metric-label">Products imported</span>
              <strong className="metric-value">{products.length}</strong>
            </div>
            <button
              className="metric metric-button"
              onClick={() => {
                setFilter("gaps");
                setPage(0);
                document.getElementById("catalog")?.scrollIntoView();
              }}
            >
              <span className="metric-label">Need information</span>
              <strong className="metric-value">{summary.gaps}</strong>
              <span className="metric-hint">View products</span>
            </button>
            <button
              className="metric metric-button"
              onClick={() => {
                setFilter("ready");
                setPage(0);
                document.getElementById("catalog")?.scrollIntoView();
              }}
            >
              <span className="metric-label">Drafts to review</span>
              <strong className="metric-value">{summary.drafts}</strong>
              <span className="metric-hint">View drafts</span>
            </button>
            <div className="metric">
              <span className="metric-label">Checklist completeness</span>
              <strong className="metric-value">
                {products.length ? `${summary.average}%` : "—"}
              </strong>
            </div>
          </div>
        </>
      )}
      <section
        className="card product-card"
        id="catalog"
        aria-label="Product catalog"
      >
        <div className="card-heading">
          <div>
            <h2>{overview ? "Products" : "Catalog"}</h2>
            <p>
              {products.length} imported · Outdoor gear checklist
              {syncedAt && (
                <>
                  {" "}
                  · Last scan{" "}
                  <time dateTime={syncedAt}>
                    {syncedAt.slice(0, 16).replace("T", " ")} UTC
                  </time>
                </>
              )}
            </p>
          </div>
          {overview && products.length > 0 && (
            <AppLink to="/app/products" className="text-link">
              View all products <Icon name="arrow" size={14} />
            </AppLink>
          )}
        </div>
        {products.length > 0 && (
          <>
            <div className="table-toolbar">
              <div
                className="filters"
                role="group"
                aria-label="Filter products"
              >
                {[
                  ["all", "All products", products.length],
                  ["gaps", "Needs information", summary.gaps],
                  ["ready", "Draft ready", summary.drafts],
                  ["complete", "Complete", summary.complete],
                ].map(([value, label, count]) => (
                  <button
                    key={value}
                    className={`filter${filter === value ? " active" : ""}`}
                    onClick={() => {
                      setFilter(String(value));
                      setPage(0);
                    }}
                    aria-pressed={filter === value}
                    aria-label={String(label)}
                  >
                    {label}
                    <span className="filter-count" aria-hidden="true">
                      {count}
                    </span>
                  </button>
                ))}
              </div>
              <div className="table-controls">
                <label className="search-box">
                  <Icon name="search" size={16} />
                  <input
                    aria-label="Search products"
                    placeholder="Search by name or type"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setPage(0);
                    }}
                  />
                </label>
                <label className="sort-control">
                  <span className="sr-only">Sort products</span>
                  <select
                    value={sort}
                    onChange={(e) => {
                      setSort(e.target.value);
                      setPage(0);
                    }}
                  >
                    <option value="attention">Needs attention first</option>
                    <option value="title">Product name A–Z</option>
                  </select>
                </label>
              </div>
            </div>
            {shown.length > 0 && (
              <div className="table-scroll">
                <table>
                  <caption className="sr-only">
                    Products and their information completeness
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Product</th>
                      <th scope="col">Details found</th>
                      <th scope="col">Review status</th>
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
                            to={`/app/products/${product.recordId}`}
                            className="product-name"
                          >
                            <span className="product-thumb">
                              {product.image ? (
                                <img
                                  src={product.image.url}
                                  alt=""
                                  loading="lazy"
                                  width="40"
                                  height="40"
                                />
                              ) : (
                                <Icon name="box" size={20} />
                              )}
                            </span>
                            <span>
                              <strong>{product.title}</strong>
                              <small>
                                {product.productType || "Uncategorized"} ·{" "}
                                {product.status.toLowerCase()}
                              </small>
                            </span>
                          </AppLink>
                        </td>
                        <td>
                          <div className="score">
                            <span>
                              {Math.round(product.audit.score / 20)} / 5
                            </span>
                            <div className="meter">
                              <span
                                style={{ width: `${product.audit.score}%` }}
                              />
                            </div>
                          </div>
                        </td>
                        <td>
                          {product.audit.conflicts.length ? (
                            <Badge tone="warning">Conflicting facts</Badge>
                          ) : product.draft ? (
                            <Badge tone="info">Draft ready</Badge>
                          ) : product.audit.missing.length ? (
                            <>
                              <Badge tone="warning">
                                {product.audit.missing.length} missing fields
                              </Badge>
                              <small className="gap-label">
                                {product.audit.missing
                                  .slice(0, 2)
                                  .map((r) => r.label)
                                  .join(", ")}
                                {product.audit.missing.length > 2
                                  ? " + more"
                                  : ""}
                              </small>
                            </>
                          ) : (
                            <Badge tone="success">Checklist complete</Badge>
                          )}
                        </td>
                        <td>
                          <AppLink
                            to={`/app/products/${product.recordId}${product.draft ? "#draft" : ""}`}
                            className="button compact"
                          >
                            {product.draft ? "Review draft" : "Review"}
                            <Icon name="arrow" size={14} />
                          </AppLink>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
        {!shown.length && (
          <div className="empty">
            <Icon name={products.length ? "search" : "box"} size={28} />
            <h3>
              {products.length
                ? "No matching products"
                : "No products imported"}
            </h3>
            <p>
              {products.length
                ? "Try another search or clear your filters."
                : "Select Scan catalog to import your Shopify products. Scanning does not change descriptions."}
            </p>
            {products.length > 0 && (
              <button
                className="button secondary"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                  setPage(0);
                }}
              >
                Clear search and filters
              </button>
            )}
          </div>
        )}
        <div className="table-footer">
          <span role="status">
            {visible.length
              ? `${page * PAGE_SIZE + 1}–${page * PAGE_SIZE + shown.length} of ${visible.length} products`
              : "0 products"}
            {visible.length !== products.length
              ? ` (${products.length} imported)`
              : ""}
          </span>
          {visible.length > PAGE_SIZE && (
            <nav className="pagination" aria-label="Catalog pages">
              <button
                className="button compact"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </button>
              <span>
                Page {page + 1} of {Math.ceil(visible.length / PAGE_SIZE)}
              </span>
              <button
                className="button compact"
                disabled={(page + 1) * PAGE_SIZE >= visible.length}
                onClick={() => setPage(page + 1)}
              >
                Next
              </button>
            </nav>
          )}
        </div>
      </section>
      <p className="footer-note">
        Only approved changes are published. Completeness measures the
        checklist, not AI search rankings.
      </p>
    </>
  );
}
