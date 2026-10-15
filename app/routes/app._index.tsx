import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { context } from "../services/context.server";
import { ensureStore } from "../services/catalog.server";
import { catalogOverview } from "../services/geo.server";
import { seedDemo } from "../services/demo.server";
import { GROUPS } from "../core/geo";
import {
  AppLink,
  Dial,
  ExternalLink,
  formatDate,
  Icon,
  Mark,
  Notice,
  PRIORITY_LABEL,
} from "../ui/common";
import { JobPanels, LiveButton, ScanButton, useLiveChecks, useScan } from "../ui/jobs";

export async function loader({ request }: LoaderFunctionArgs) {
  const ctx = await context(request);
  if (ctx.demo) await seedDemo();
  else await ensureStore(ctx.shop);
  return { ...(await catalogOverview(ctx.shop)), demo: ctx.demo };
}

export default function Overview() {
  const data = useLoaderData<typeof loader>();
  const { summary, store } = data;
  const scan = useScan(store);
  const live = useLiveChecks();
  const hasProducts = summary.total > 0;
  const notChecked = Math.max(0, summary.active - summary.ready - summary.needsWork);
  const share = (n: number) => `${summary.active ? (n / summary.active) * 100 : 0}%`;
  const syncedAt = formatDate(store.syncedAt);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Overview</h1>
          <p>
            {data.demo ? "Trail Supply" : (store.name ?? "Your store")}
            {syncedAt ? ` · Last scan ${syncedAt}` : " · Not scanned yet"}
          </p>
        </div>
        <div className="page-actions">
          {hasProducts && (
            <LiveButton live={live} disabled={scan.running || !summary.liveCheckable} />
          )}
          <ScanButton scan={scan} primary={!hasProducts} />
        </div>
      </div>
      <JobPanels scan={scan} live={live} />
      {!scan.running && store.syncStarted && (
        <Notice tone="info">
          The last scan stopped part way. Results cover imported products only. Select
          Continue scan to import the rest.
        </Notice>
      )}
      {!scan.running && !store.syncStarted && hasProducts && !store.syncedAt && (
        <Notice tone="info">
          Products changed in Shopify since the last scan. Scan again to refresh these
          results.
        </Notice>
      )}
      {!scan.running && summary.needsRescan > 0 && (
        <Notice tone="info">
          {summary.needsRescan} product{summary.needsRescan === 1 ? " was" : "s were"} imported
          before category, barcode and price checks were available. Scan to complete them.
        </Notice>
      )}

      {!hasProducts ? (
        <section className="card" aria-label="Getting started">
          <div className="card-heading">
            <div>
              <h2>Make your products easy to find and recommend</h2>
              <p>
                Soodo checks what search engines and AI shopping assistants can read about
                each product, then helps you fix the gaps.
              </p>
            </div>
          </div>
          <ol className="steps">
            <li>
              <h3>Scan your catalog</h3>
              <p>Read-only. Imports products, variants, categories and store policies.</p>
            </li>
            <li>
              <h3>Check live pages</h3>
              <p>Confirms crawlers can reach each page and its product data matches Shopify.</p>
            </li>
            <li>
              <h3>Work through the fix plan</h3>
              <p>Highest-impact fixes first. Description changes are published only after you approve them.</p>
            </li>
          </ol>
        </section>
      ) : (
        <>
          <section className="hero" aria-label="Catalog summary">
            <div className="hero-score">
              <Dial value={summary.readiness} label="Catalog readiness" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <span className="stat-label">Catalog readiness</span>
                <p>Average across {summary.active} active product{summary.active === 1 ? "" : "s"}</p>
                <div className="distribution" aria-hidden="true">
                  <span style={{ width: share(summary.ready), background: "var(--pass)" }} />
                  <span style={{ width: share(summary.needsWork), background: "var(--medium)" }} />
                  <span style={{ width: share(notChecked), background: "var(--line-strong)" }} />
                </div>
              </div>
            </div>
            <div>
              <span className="stat-label">Ready</span>
              <strong className="stat-value">
                {summary.ready}
                <small> / {summary.active}</small>
              </strong>
              <span className="stat-note">Every check passed</span>
            </div>
            <div>
              <span className="stat-label">Need fixes</span>
              <strong className="stat-value">{summary.needsWork}</strong>
              <span className="stat-note">
                <AppLink to="/app/fixes" className="text-link">
                  Open fix plan
                </AppLink>
              </span>
            </div>
            <div>
              <span className="stat-label">Live pages checked</span>
              <strong className="stat-value">
                {summary.liveChecked}
                <small> / {summary.liveCheckable}</small>
              </strong>
              <span className="stat-note">
                {summary.drafts
                  ? `${summary.drafts} draft${summary.drafts === 1 ? "" : "s"} to review`
                  : "Published pages only"}
              </span>
            </div>
          </section>

          <div className="grid-2">
            <section className="card" aria-labelledby="top-fixes">
              <div className="card-heading">
                <div>
                  <h2 id="top-fixes">Top fixes</h2>
                  <p>Ranked by priority and number of active products affected.</p>
                </div>
                {data.fixPlan.length > 0 && (
                  <AppLink to="/app/fixes" className="text-link">
                    Full plan <Icon name="arrow" size={14} />
                  </AppLink>
                )}
              </div>
              {data.fixPlan.length ? (
                <ul className="rows stagger">
                  {data.fixPlan.slice(0, 6).map((fix) => (
                    <li key={fix.id}>
                      <Mark kind={fix.priority} label={`${PRIORITY_LABEL[fix.priority]} priority`} />
                      <div className="row-main">
                        <strong>{fix.label}</strong>
                        <small>{GROUPS[fix.group].label}</small>
                      </div>
                      <span className="row-meta">
                        {fix.products.length} product{fix.products.length === 1 ? "" : "s"}
                      </span>
                      <AppLink
                        to={
                          fix.products.length === 1
                            ? `/app/products/${fix.products[0].recordId}`
                            : `/app/fixes#${fix.id}`
                        }
                        className="button compact"
                        label={`Fix ${fix.label}`}
                      >
                        Fix
                      </AppLink>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="empty">
                  <Icon name="check" size={26} />
                  <h3>Nothing to fix right now</h3>
                  <p>Every active product passes the checks that could be run.</p>
                </div>
              )}
            </section>

            <section className="card" aria-labelledby="store-signals">
              <div className="card-heading">
                <div>
                  <h2 id="store-signals">Store-wide signals</h2>
                  <p>Trust and access signals shared by every product.</p>
                </div>
              </div>
              <ul>
                {data.signals.map((signal) => (
                  <li className="signal" key={signal.id}>
                    <Mark
                      kind={signal.status === "pass" ? "pass" : signal.status === "unknown" ? "unknown" : "medium"}
                      label={signal.status === "pass" ? "Passed" : signal.status === "unknown" ? "Not checked" : "Needs attention"}
                    />
                    <div>
                      <strong>{signal.label}</strong>
                      <p>{signal.evidence}</p>
                      {signal.status === "action" && <p>{signal.action}</p>}
                      {signal.url && !data.demo && (
                        <ExternalLink href={signal.url}>View</ExternalLink>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        </>
      )}
      <p className="footer-note">
        Readiness measures checks Soodo can verify. It is not a search or AI ranking.
      </p>
    </>
  );
}
