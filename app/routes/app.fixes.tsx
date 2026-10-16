import { useEffect, useMemo, useState } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData, useLocation, useSearchParams } from "react-router";
import { context } from "../services/context.server";
import { ensureStore } from "../services/catalog.server";
import { catalogOverview, type FixGroup } from "../services/geo.server";
import { seedDemo } from "../services/demo.server";
import { GROUPS, type CheckGroup, type Priority } from "../core/geo";
import { AppLink, Icon, Mark, Notice, PRIORITY_LABEL } from "../ui/common";
import { Collapsible } from "../ui/motion";
import { JobPanels, LiveButton, ScanButton, useLiveChecks, useScan } from "../ui/jobs";
import { HelpButton } from "../ui/help";

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

const WHERE: Record<FixGroup["destination"], { label: string; detail: string }> = {
  facts: { label: "In Soodo", detail: "Add verified specifications, then approve the description draft." },
  shopify: { label: "Shopify product editor", detail: "Open each product in Shopify and update the field." },
  theme: { label: "Online Store › Themes", detail: "Change the theme, or the app that adds the markup." },
  live: { label: "Live page check", detail: "Run a live page check to evaluate this." },
  scan: { label: "Catalog scan", detail: "Scan the catalog to collect the missing data." },
};
const AREAS = Object.keys(GROUPS) as CheckGroup[];
const PRIORITIES: Priority[] = ["high", "medium", "low"];

function Fix({
  fix,
  active,
  open,
  onToggle,
}: {
  fix: FixGroup;
  active: number;
  open: boolean;
  onToggle: () => void;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? fix.products : fix.products.slice(0, 6);
  const share = fix.products.length / Math.max(1, active);
  const target = (recordId: string) =>
    `/app/products/${recordId}${fix.destination === "facts" ? "#specs" : fix.destination === "live" || fix.destination === "theme" ? "#live" : ""}`;
  return (
    <div className="fix" id={fix.id}>
      <button type="button" className="fix-trigger" aria-expanded={open} aria-controls={`fix-${fix.id}`} onClick={onToggle}>
        <Mark kind={fix.priority} label={`${PRIORITY_LABEL[fix.priority]} priority`} />
        <span className="row-main">
          <strong>{fix.label}</strong>
          <small>{fix.why}</small>
        </span>
        <span className="fix-area">{GROUPS[fix.group].label}</span>
        <span className="impact" title={`${fix.products.length} of ${active} active products`}>
          <span className="impact-bar">
            <span style={{ width: `${share * 100}%` }} />
          </span>
          <span className="num">
            {fix.products.length} of {active}
          </span>
        </span>
        <Icon name="chevron" size={16} />
      </button>
      <Collapsible open={open} id={`fix-${fix.id}`}>
        <div className="fix-body">
          <div className="fix-how">
            <div>
              <span className="eyebrow">How to fix</span>
              <p>{fix.action}</p>
            </div>
            <div>
              <span className="eyebrow">Where</span>
              <p>
                <strong>{WHERE[fix.destination].label}.</strong> {WHERE[fix.destination].detail}
              </p>
            </div>
          </div>
          <span className="eyebrow" style={{ marginTop: 14 }}>
            Affected products ({fix.products.length})
          </span>
          <ul className="affected">
            {shown.map((product) => (
              <li key={product.recordId}>
                <span style={{ minWidth: 0 }}>
                  {product.title}
                  <small>{product.evidence}</small>
                </span>
                <AppLink to={target(product.recordId)} className="button compact" label={`Open ${product.title}`}>
                  Open
                </AppLink>
              </li>
            ))}
          </ul>
          {fix.products.length > 6 && (
            <button type="button" className="text-link" style={{ marginTop: 10 }} onClick={() => setAll(!all)}>
              {all ? "Show fewer" : `Show all ${fix.products.length}`}
            </button>
          )}
        </div>
      </Collapsible>
    </div>
  );
}

export default function FixPlan() {
  const data = useLoaderData<typeof loader>();
  const { hash } = useLocation();
  const [params] = useSearchParams();
  const scan = useScan(data.store);
  const live = useLiveChecks();
  const initialArea = params.get("area");
  const [area, setArea] = useState<CheckGroup | "all">(
    AREAS.includes(initialArea as CheckGroup) ? (initialArea as CheckGroup) : "all",
  );
  const [priority, setPriority] = useState<Priority | "all">("all");
  const [openId, setOpenId] = useState<string | null>(null);
  // Links such as /app/fixes#gtin open that fix after the page renders.
  useEffect(() => {
    if (!hash) return;
    const frame = requestAnimationFrame(() => setOpenId(hash.slice(1)));
    return () => cancelAnimationFrame(frame);
  }, [hash]);
  const storeIssues = data.signals.filter((s) => s.status === "action");
  const visible = useMemo(
    () =>
      data.fixPlan.filter(
        (fix) => (area === "all" || fix.group === area) && (priority === "all" || fix.priority === priority),
      ),
    [data.fixPlan, area, priority],
  );
  const byPriority = (level: Priority) =>
    data.fixPlan.filter((f) => (area === "all" || f.group === area) && f.priority === level).length;
  const unchecked = data.summary.liveCheckable - data.summary.liveChecked;
  const affected = data.summary.needsWork;

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Fix plan</h1>
          <p>
            {data.fixPlan.length
              ? `${data.fixPlan.length} fixes across ${affected} of ${data.summary.active} active products, highest impact first.`
              : "Issues across your active products, grouped so similar fixes can be done in one pass."}
          </p>
        </div>
        <div className="page-actions">
          <HelpButton topic="fixes" />
          {data.summary.total > 0 && <LiveButton live={live} disabled={scan.running || !data.summary.liveCheckable} />}
          <ScanButton scan={scan} primary={!data.summary.total} />
        </div>
      </div>
      <JobPanels scan={scan} live={live} />
      {unchecked > 0 && !live.running && (
        <Notice tone="info">
          {unchecked} published product page{unchecked === 1 ? " has" : "s have"} not been checked live. Visibility and
          structured data fixes appear after a live check.
        </Notice>
      )}

      {storeIssues.length > 0 && (
        <section className="card store-fixes" aria-labelledby="store-wide">
          <div className="card-heading">
            <div>
              <h2 id="store-wide">Store-wide</h2>
              <p>One change helps every product.</p>
            </div>
          </div>
          <ul className="stagger">
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
      )}

      {data.fixPlan.length > 0 && (
        <section className="card" aria-label="Product fixes" style={{ marginTop: storeIssues.length ? 16 : 0 }}>
          <div className="toolbar">
            <div className="segmented" role="group" aria-label="Filter by area">
              {(["all", ...AREAS] as const).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={area === key}
                  onClick={() => setArea(key)}
                >
                  {key === "all" ? "All areas" : GROUPS[key].label}
                  <span className="count" aria-hidden="true">
                    {data.fixPlan.filter((f) => key === "all" || f.group === key).length}
                  </span>
                </button>
              ))}
            </div>
            <div className="priority-filter" role="group" aria-label="Filter by priority">
              {PRIORITIES.map((level) => (
                <button
                  key={level}
                  type="button"
                  className="chip"
                  aria-pressed={priority === level}
                  onClick={() => setPriority(priority === level ? "all" : level)}
                >
                  <Mark kind={level} />
                  {PRIORITY_LABEL[level]}
                  <span className="count">{byPriority(level)}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="fix-head" aria-hidden="true">
            <span />
            <span>Fix</span>
            <span>Area</span>
            <span>Active products affected</span>
            <span />
          </div>
          {visible.length ? (
            <div className="stagger" key={`${area}-${priority}`}>
              {visible.map((fix) => (
                <Fix
                  key={fix.id}
                  fix={fix}
                  active={data.summary.active}
                  open={openId === fix.id}
                  onToggle={() => setOpenId(openId === fix.id ? null : fix.id)}
                />
              ))}
            </div>
          ) : (
            <div className="empty">
              <Icon name="check" size={24} />
              <h3>No fixes match these filters</h3>
              <p>Choose another area or priority.</p>
              <button
                type="button"
                className="button"
                onClick={() => {
                  setArea("all");
                  setPriority("all");
                }}
              >
                Show all fixes
              </button>
            </div>
          )}
        </section>
      )}

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
        Inactive products are left out. Priorities order the work; they are not measured ranking factors.
      </p>
    </>
  );
}
