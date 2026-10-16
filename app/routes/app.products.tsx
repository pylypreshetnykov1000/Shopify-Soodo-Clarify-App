import { useMemo, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { context } from "../services/context.server";
import { ensureStore } from "../services/catalog.server";
import { catalogOverview, type LiveStatus } from "../services/geo.server";
import { seedDemo } from "../services/demo.server";
import { AppLink, Badge, Icon, Mark, Meter, Notice, Priority, Thumb } from "../ui/common";
import { JobPanels, ScanButton, useScan } from "../ui/jobs";
import { HelpButton } from "../ui/help";

export async function loader({ request }: LoaderFunctionArgs) {
  const ctx = await context(request);
  if (ctx.demo) await seedDemo();
  else await ensureStore(ctx.shop);
  const { products, store, summary } = await catalogOverview(ctx.shop);
  return { products, store, summary, demo: ctx.demo };
}

const PAGE_SIZES = [10, 25, 50, 100];
type Row = Awaited<ReturnType<typeof loader>>["products"][number];
type Sort = "attention" | "readiness" | "readiness-desc" | "title" | "title-desc";
const FILTERS: [string, string, (p: Row) => boolean][] = [
  ["all", "All products", () => true],
  ["fixes", "Needs fixes", (p) => p.actions > 0],
  ["drafts", "Draft ready", (p) => !!p.draft],
  ["ready", "Ready", (p) => !p.actions && !p.unknown],
];
const LIVE: Record<LiveStatus, { label: string; mark: "pass" | "high" | "unknown" | null }> = {
  ok: { label: "Passing", mark: "pass" },
  issues: { label: "Issues", mark: "high" },
  unchecked: { label: "Not checked", mark: "unknown" },
  none: { label: "No page", mark: null },
};
const COMPARE: Record<Sort, (a: Row, b: Row) => number> = {
  attention: (a, b) =>
    Number(!!b.draft) - Number(!!a.draft) ||
    Number(b.status === "ACTIVE") - Number(a.status === "ACTIVE") ||
    a.readiness - b.readiness ||
    a.title.localeCompare(b.title),
  readiness: (a, b) => a.readiness - b.readiness || a.title.localeCompare(b.title),
  "readiness-desc": (a, b) => b.readiness - a.readiness || a.title.localeCompare(b.title),
  title: (a, b) => a.title.localeCompare(b.title),
  "title-desc": (a, b) => b.title.localeCompare(a.title),
};

function SortHeader({
  label,
  field,
  sort,
  onSort,
}: {
  label: string;
  field: "title" | "readiness";
  sort: Sort;
  onSort: (sort: Sort) => void;
}) {
  const active = sort === field || sort === `${field}-desc`;
  const descending = sort === `${field}-desc`;
  return (
    <th scope="col" aria-sort={active ? (descending ? "descending" : "ascending") : "none"}>
      <button
        type="button"
        className={`sort-button${active ? " active" : ""}`}
        onClick={() => onSort(active && !descending ? (`${field}-desc` as Sort) : field)}
      >
        {label}
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" className={descending ? "desc" : ""}>
          <path d="M5 2 8 6H2z" fill="currentColor" />
        </svg>
      </button>
    </th>
  );
}

export default function Products() {
  const { products, store, summary } = useLoaderData<typeof loader>();
  const scan = useScan(store);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState<Sort>("attention");
  const [pageSize, setPageSize] = useState(50);
  const [requestedPage, setPage] = useState(0);
  const counts = useMemo(
    () => Object.fromEntries(FILTERS.map(([key, , test]) => [key, products.filter(test).length])),
    [products],
  );
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const test = FILTERS.find(([key]) => key === filter)![2];
    return products
      .filter((p) => `${p.title} ${p.productType} ${p.category ?? ""}`.toLowerCase().includes(query) && test(p))
      .sort(COMPARE[sort]);
  }, [products, search, filter, sort]);
  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const page = Math.min(requestedPage, pageCount - 1);
  const shown = visible.slice(page * pageSize, (page + 1) * pageSize);
  const reset = () => setPage(0);
  const onSort = (next: Sort) => {
    setSort(next);
    reset();
  };

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Products</h1>
          <p>
            {products.length
              ? `${summary.total} products · average readiness ${summary.readiness} · ${summary.needsWork} active need fixes`
              : "Readiness, next fix and specification coverage for every product."}
          </p>
        </div>
        <div className="page-actions">
          <HelpButton topic="products" />
          <ScanButton scan={scan} primary={!products.length} />
        </div>
      </div>
      <JobPanels scan={scan} />
      {!scan.running && store.syncStarted && (
        <Notice tone="info">
          Scan paused after {products.length} imported products. Select Continue scan to import the rest.
        </Notice>
      )}
      <section className="card" id="catalog" aria-label="Product catalog">
        {products.length > 0 && (
          <div className="toolbar">
            <div className="segmented" role="group" aria-label="Filter products">
              {FILTERS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  aria-label={label}
                  onClick={() => {
                    setFilter(key);
                    reset();
                  }}
                >
                  {label}
                  <span className="count" aria-hidden="true">
                    {counts[key]}
                  </span>
                </button>
              ))}
            </div>
            <div className="controls">
              <label className="search-box">
                <Icon name="search" size={15} />
                <input
                  aria-label="Search products"
                  placeholder="Search name, type or category"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    reset();
                  }}
                />
              </label>
              {search && (
                <button type="button" className="button quiet compact" onClick={() => setSearch("")}>
                  Clear
                </button>
              )}
              <select aria-label="Sort products" value={sort} onChange={(e) => onSort(e.target.value as Sort)}>
                <option value="attention">Needs attention first</option>
                <option value="readiness">Lowest readiness</option>
                <option value="readiness-desc">Highest readiness</option>
                <option value="title">Product name A–Z</option>
                <option value="title-desc">Product name Z–A</option>
              </select>
            </div>
          </div>
        )}
        {shown.length > 0 && (
          <div className="table-scroll">
            <table className="product-table">
              <caption className="sr-only">Products and their GEO readiness</caption>
              <thead>
                <tr>
                  <SortHeader label="Product" field="title" sort={sort} onSort={onSort} />
                  <SortHeader label="Readiness" field="readiness" sort={sort} onSort={onSort} />
                  <th scope="col">Next fix</th>
                  <th scope="col" className="live-col">
                    Live page
                  </th>
                  <th scope="col" className="specs-col">
                    Specs
                  </th>
                  <th scope="col" className="chevron-col">
                    <span className="sr-only">Open</span>
                  </th>
                </tr>
              </thead>
              <tbody className="stagger">
                {shown.map((product) => (
                  <tr key={product.recordId} className={product.status === "ACTIVE" ? undefined : "inactive"}>
                    <td>
                      {/* Stretched link: the whole row opens the product. */}
                      <AppLink
                        to={`/app/products/${product.recordId}${product.draft ? "#draft" : ""}`}
                        className="product-name"
                      >
                        <Thumb image={product.image} />
                        <span>
                          <strong>{product.title}</strong>
                          <small>
                            {product.category || product.productType || "Uncategorized"}
                            {product.status !== "ACTIVE" && ` · ${product.status.toLowerCase()}`}
                          </small>
                        </span>
                      </AppLink>
                    </td>
                    <td className="score-col">
                      <div className="score">
                        <strong>{product.readiness}</strong>
                        <Meter value={product.readiness} label={`${product.title} readiness`} />
                      </div>
                    </td>
                    <td className="issue-col">
                      {product.draft ? (
                        <Badge tone="info">Draft ready to review</Badge>
                      ) : product.specs.conflicts ? (
                        <Badge tone="critical">Conflicting specifications</Badge>
                      ) : product.top ? (
                        <span className="issue-cell">
                          {product.top.status === "unknown" ? (
                            <span className="priority">Not checked yet</span>
                          ) : (
                            <Priority level={product.top.priority} />
                          )}
                          <span>
                            {product.top.label}
                            {product.actions > 1 ? ` · +${product.actions - 1} more` : ""}
                          </span>
                        </span>
                      ) : (
                        <Badge tone="success">Ready</Badge>
                      )}
                    </td>
                    <td className="live-col">
                      <span className="live-status">
                        {LIVE[product.live].mark ? (
                          <Mark kind={LIVE[product.live].mark!} />
                        ) : (
                          <span className="dash" aria-hidden="true">
                            —
                          </span>
                        )}
                        {LIVE[product.live].label}
                      </span>
                    </td>
                    <td className="specs-col num">
                      {product.specs.found}/{product.specs.total}
                    </td>
                    <td className="chevron-col" aria-hidden="true">
                      <Icon name="arrow" size={15} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!shown.length && (
          <div className="empty">
            <Icon name={products.length ? "search" : "box"} size={26} />
            <h3>{products.length ? "No matching products" : "No products imported"}</h3>
            <p>
              {products.length
                ? "Try another search or clear the filters."
                : "Select Scan catalog to import your products. Scanning never changes your store."}
            </p>
            {products.length > 0 && (
              <button
                type="button"
                className="button"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                  reset();
                }}
              >
                Clear search and filters
              </button>
            )}
          </div>
        )}
        <div className="card-foot">
          <span role="status">
            {visible.length
              ? `${page * pageSize + 1}–${page * pageSize + shown.length} of ${visible.length} products`
              : "0 products"}
            {visible.length !== products.length ? ` (${products.length} imported)` : ""}
          </span>
          {products.length > 0 && (
            <div className="pagination">
              <label className="page-size">
                <span>Per page</span>
                <select
                  aria-label="Products per page"
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value));
                    reset();
                  }}
                >
                  {PAGE_SIZES.map((size) => (
                    <option key={size} value={size}>
                      {size}
                    </option>
                  ))}
                </select>
              </label>
              {pageCount > 1 && (
                <nav className="pagination" aria-label="Catalog pages">
                  <button type="button" className="button compact" disabled={page === 0} onClick={() => setPage(page - 1)}>
                    Previous
                  </button>
                  <span className="num">
                    {page + 1} / {pageCount}
                  </span>
                  <button
                    type="button"
                    className="button compact"
                    disabled={page === pageCount - 1}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </button>
                </nav>
              )}
            </div>
          )}
        </div>
      </section>
    </>
  );
}
