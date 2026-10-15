import { useState } from "react";
import { useFetcher } from "react-router";
import type { loader, action } from "../routes/app._index";
import { AppLink, Badge, Icon, Notice } from "./common";
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
  const products = data.products;
  const average = products.length
    ? Math.round(
        products.reduce((sum, p) => sum + p.audit.score, 0) / products.length,
      )
    : 0;
  const missing = products.reduce((sum, p) => sum + p.audit.missing.length, 0);
  const drafts = products.filter((p) => p.draft).length;
  const needsInfo = products.filter((p) => p.audit.missing.length > 0).length;
  const nextProduct =
    products.find((p) => p.draft) ??
    [...products]
      .sort((a, b) => a.audit.score - b.audit.score)
      .find((p) => p.audit.score < 100);
  const visible = products
    .filter(
      (p) =>
        `${p.title} ${p.productType}`
          .toLowerCase()
          .includes(search.trim().toLowerCase()) &&
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
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">PRODUCT CLARITY</div>
          <h1>
            {overview ? "Your next step to clearer products" : "Your products"}
          </h1>
          <p>
            {overview
              ? "Find missing details. Review a draft. Publish when you are ready."
              : "Find information gaps and turn verified facts into useful product descriptions."}
          </p>
        </div>
        <fetcher.Form method="post">
          <input type="hidden" name="intent" value="sync" />
          <input
            type="hidden"
            name="restart"
            value={data.store.syncStarted ? "false" : "true"}
          />
          <button
            className={
              nextProduct && !data.store.syncStarted
                ? "button secondary"
                : "button primary"
            }
            disabled={fetcher.state !== "idle"}
          >
            <Icon name="spark" />
            {fetcher.state !== "idle"
              ? "Scanning…"
              : data.store.syncStarted
                ? "Continue scan"
                : "Scan catalog"}
          </button>
        </fetcher.Form>
      </div>
      <Notice result={fetcher.data} />
      {!data.store.syncedAt &&
        products.length > 0 &&
        !data.store.syncStarted && (
          <div className="notice">
            Your catalog may have changed in Shopify. Scan again to refresh
            these results.
          </div>
        )}
      {data.store.syncStarted && (
        <div className="notice" role="status">
          Your scan is in progress. Continue scanning to finish importing every
          product. Metrics currently cover {products.length} imported products.
        </div>
      )}
      {overview && (
        <>
          <ol className="workflow-steps" aria-label="How it works">
            <li>
              <span>1</span>Scan your catalog
            </li>
            <li>
              <span>2</span>Review product facts
            </li>
            <li>
              <span>3</span>Approve and publish
            </li>
          </ol>
          <div className="guide-card next-step">
            <div className="guide-icon">
              <Icon name={drafts ? "check" : "spark"} size={27} />
            </div>
            <div>
              <div className="eyebrow">RECOMMENDED NEXT STEP</div>
              <h2>
                {drafts
                  ? "You have drafts ready for review"
                  : nextProduct
                    ? "Give your products the missing details"
                    : products.length
                      ? "Your checklist is complete"
                      : "Start with a catalog scan"}
              </h2>
              <p>
                {drafts
                  ? "Compare the current and proposed description before approving."
                  : nextProduct
                    ? "Start with one product. Add verified facts and create a draft."
                    : products.length
                      ? "All imported products have the five details we check."
                      : "Scan your catalog above to import products and find missing details."}
              </p>
            </div>
            {nextProduct && (
              <AppLink
                to={`/app/products/${nextProduct.recordId}${nextProduct.draft ? "#draft" : ""}`}
                className="button primary"
              >
                {drafts ? "Review next draft" : "Improve a product"}
                <Icon name="arrow" />
              </AppLink>
            )}
          </div>
          <div className="metrics">
            <div className="metric">
              <div className="metric-label">
                Information completeness <Icon name="leaf" />
              </div>
              <div className="metric-value">
                {average}
                <span>%</span>
              </div>
              <div className="meter">
                <span style={{ width: `${average}%` }} />
              </div>
              <p>Across the five checklist fields</p>
            </div>
            <div className="metric">
              <div className="metric-label">
                Products scanned <Icon name="box" />
              </div>
              <div className="metric-value">{products.length}</div>
              <p>
                {data.store.syncedAt
                  ? "Catalog connected and ready to review"
                  : "Imported products available to review"}
              </p>
            </div>
            <div className="metric">
              <div className="metric-label">
                Information gaps <Icon name="search" />
              </div>
              <div className="metric-value">{missing}</div>
              <p>Specifications that need your input</p>
            </div>
            <div className="metric">
              <div className="metric-label">
                Drafts to review <Icon name="check" />
              </div>
              <div className="metric-value">{drafts}</div>
              <p>Ready for your approval</p>
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
            <h2>{overview ? "Catalog overview" : "Product information"}</h2>
            <p>{products.length} products · Outdoor gear checklist</p>
          </div>
          {overview && (
            <AppLink to="/app/products" className="text-link">
              View all products <Icon name="arrow" size={16} />
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
                  ["all", "All products"],
                  ["gaps", "Needs information"],
                  ["ready", "Draft ready"],
                  ["complete", "Complete"],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    className={filter === value ? "filter active" : "filter"}
                    onClick={() => setFilter(value)}
                    aria-pressed={filter === value}
                  >
                    {label}
                    <span className="filter-count" aria-hidden="true">
                      {value === "all"
                        ? products.length
                        : value === "gaps"
                          ? needsInfo
                          : value === "ready"
                            ? drafts
                            : products.filter((p) => p.audit.score === 100)
                                .length}
                    </span>
                  </button>
                ))}
              </div>
              <div className="table-controls">
                <label className="search-box">
                  <Icon name="search" size={17} />
                  <input
                    aria-label="Search products"
                    placeholder="Search products…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </label>
                <label className="sort-control">
                  <span className="sr-only">Sort products</span>
                  <select
                    value={sort}
                    onChange={(e) => setSort(e.target.value)}
                  >
                    <option value="attention">Needs attention first</option>
                    <option value="title">Product name A-Z</option>
                  </select>
                </label>
              </div>
            </div>
            <div className="table-scroll">
              <table>
                <caption className="sr-only">
                  Products and their information completeness
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Product</th>
                    <th scope="col">Completeness</th>
                    <th scope="col">What needs attention</th>
                    <th scope="col">
                      <span className="sr-only">Action</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((product) => (
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
                              />
                            ) : (
                              <Icon name="box" size={23} />
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
                          <span>{product.audit.score}%</span>
                          <div className="meter">
                            <span
                              style={{ width: `${product.audit.score}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td>
                        {product.draft ? (
                          <Badge tone="success">Draft ready for review</Badge>
                        ) : product.audit.conflicts.length ? (
                          <Badge tone="warning">Conflicting facts</Badge>
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
                          <Badge tone="success">
                            All checklist fields found
                          </Badge>
                        )}
                      </td>
                      <td>
                        <AppLink
                          to={`/app/products/${product.recordId}${product.draft ? "#draft" : ""}`}
                          className="button compact"
                        >
                          {product.draft ? "Review draft" : "Review"}
                          <Icon name="arrow" size={15} />
                        </AppLink>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        {!visible.length && (
          <div className="empty">
            <Icon name="box" size={32} />
            <h3>
              {products.length
                ? "No matching products"
                : "Start with a catalog scan"}
            </h3>
            <p>
              {products.length
                ? "Try another search or filter."
                : "Scan your catalog to find product information gaps."}
            </p>
            {products.length > 0 && (
              <button
                className="button secondary"
                onClick={() => {
                  setSearch("");
                  setFilter("all");
                }}
              >
                Clear search and filters
              </button>
            )}
          </div>
        )}
        <div className="table-footer" role="status">
          Showing {visible.length} of {products.length} imported products
          <span>Only approved changes are published</span>
        </div>
      </section>
      <div className="footer-note">
        <Icon name="check" size={16} />
        Changes are only published after you approve them. Completeness measures
        this checklist, not AI search rankings.
      </div>
    </>
  );
}
