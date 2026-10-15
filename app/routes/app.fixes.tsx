import { useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useLocation } from "react-router";
import { context } from "../services/context.server";
import { ensureStore } from "../services/catalog.server";
import { catalogOverview, type FixGroup } from "../services/geo.server";
import { seedDemo } from "../services/demo.server";
import { GROUPS, type CheckGroup } from "../core/geo";
import { AppLink, Icon, Mark, Notice, PRIORITY_LABEL } from "../ui/common";
import { JobPanels, LiveButton, ScanButton, useLiveChecks, useScan } from "../ui/jobs";

export async function loader({ request }: LoaderFunctionArgs) {
  const ctx = await context(request);
  if (ctx.demo) await seedDemo();
  else await ensureStore(ctx.shop);
  const overview = await catalogOverview(ctx.shop);
  return {
    store: overview.store,
    fixPlan: overview.fixPlan,
    signals: overview.signals,
    summary: overview.summary,
    demo: ctx.demo,
  };
}

const WHERE: Record<FixGroup["destination"], string> = {
  facts: "Fixed inside Soodo: add verified specifications and approve the description draft.",
  shopify: "Fixed in the Shopify product editor.",
  theme: "Fixed in Online Store > Themes, or in the app that adds the markup.",
  live: "Run a live page check to evaluate this.",
  scan: "Scan the catalog to collect the missing data.",
};

function Fix({ fix, open }: { fix: FixGroup; open: boolean }) {
  const [all, setAll] = useState(false);
  const shown = all ? fix.products : fix.products.slice(0, 8);
  return (
    <details className="fix disclosure" id={fix.id} open={open || undefined}>
      <summary>
        <Mark kind={fix.priority} label={`${PRIORITY_LABEL[fix.priority]} priority`} />
        <span className="row-main">
          <strong>{fix.label}</strong>
          <small>
            {PRIORITY_LABEL[fix.priority]} priority · {fix.products.length} product
            {fix.products.length === 1 ? "" : "s"}
          </small>
        </span>
        <Icon name="chevron" size={16} />
      </summary>
      <div className="fix-body disclosure-body">
        <p>{fix.action}</p>
        <small>{WHERE[fix.destination]}</small>
        <ul className="affected">
          {shown.map((product) => (
            <li key={product.recordId}>
              <span style={{ minWidth: 0 }}>
                {product.title}
                <small>{product.evidence}</small>
              </span>
              <AppLink
                to={`/app/products/${product.recordId}${fix.destination === "facts" ? "#specs" : ""}`}
                className="button compact"
                label={`Open ${product.title}`}
              >
                Open
              </AppLink>
            </li>
          ))}
        </ul>
        {fix.products.length > 8 && (
          <button type="button" className="text-link" style={{ marginTop: 10 }} onClick={() => setAll(!all)}>
            {all ? "Show fewer" : `Show all ${fix.products.length}`}
          </button>
        )}
      </div>
    </details>
  );
}

export default function FixPlan() {
  const data = useLoaderData<typeof loader>();
  const { hash } = useLocation();
  const scan = useScan(data.store);
  const live = useLiveChecks();
  const storeIssues = data.signals.filter((s) => s.status === "action");
  const byGroup = (Object.keys(GROUPS) as CheckGroup[])
    .map((group) => ({ group, fixes: data.fixPlan.filter((f) => f.group === group) }))
    .filter((g) => g.fixes.length);
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Fix plan</h1>
          <p>
            {data.fixPlan.length
              ? `${data.fixPlan.length} fixes across ${data.summary.needsWork} active products, highest impact first.`
              : "Issues across your active products, grouped so you can fix them in one pass."}
          </p>
        </div>
        <div className="page-actions">
          {data.summary.total > 0 && (
            <LiveButton live={live} disabled={scan.running || !data.summary.liveCheckable} />
          )}
          <ScanButton scan={scan} primary={!data.summary.total} />
        </div>
      </div>
      <JobPanels scan={scan} live={live} />
      {data.summary.liveCheckable > data.summary.liveChecked && !live.running && (
        <Notice tone="info">
          {data.summary.liveCheckable - data.summary.liveChecked} published product page
          {data.summary.liveCheckable - data.summary.liveChecked === 1 ? " has" : "s have"} not been
          checked live. Visibility and structured data fixes appear after a live check.
        </Notice>
      )}

      {storeIssues.length > 0 && (
        <>
          <div className="section-label">
            <h2>Store-wide</h2>
            <p>One fix helps every product.</p>
          </div>
          <section className="card">
            <ul>
              {storeIssues.map((signal) => (
                <li className="signal" key={signal.id}>
                  <Mark kind="medium" label="Needs attention" />
                  <div>
                    <strong>{signal.label}</strong>
                    <p>{signal.evidence}</p>
                    <p>{signal.action}</p>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {byGroup.map(({ group, fixes }) => (
        <div key={group}>
          <div className="section-label">
            <h2>{GROUPS[group].label}</h2>
            <p>{GROUPS[group].summary}</p>
          </div>
          <section className="card stagger">
            {fixes.map((fix) => (
              <Fix key={fix.id} fix={fix} open={hash === `#${fix.id}`} />
            ))}
          </section>
        </div>
      ))}

      {!data.fixPlan.length && !storeIssues.length && (
        <section className="card empty">
          <Icon name={data.summary.total ? "check" : "list"} size={26} />
          <h2>{data.summary.total ? "No fixes needed" : "Scan your catalog to start"}</h2>
          <p>
            {data.summary.total
              ? "Every active product passes the checks that could be run. Run live checks to confirm what crawlers see."
              : "The plan groups every issue by type so similar fixes can be done together."}
          </p>
        </section>
      )}
      <p className="footer-note">
        Inactive products are left out. Priorities order the work; they are not measured
        ranking factors.
      </p>
    </>
  );
}
