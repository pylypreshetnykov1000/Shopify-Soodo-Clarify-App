import type { ReactNode } from "react";
import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import db from "../db.server";
import { context, OPTIONAL_SCOPES } from "../services/context.server";
import { ensureStore } from "../services/catalog.server";
import { catalogOverview } from "../services/geo.server";
import { seedDemo } from "../services/demo.server";
import { readinessTrend } from "../services/snapshots.server";
import { GROUPS } from "../core/geo";
import {
  AppLink,
  Badge,
  Empty,
  formatDate,
  Icon,
  Mark,
  Meter,
  Notice,
  Panel,
  PanelLink,
  PRIORITY_LABEL,
  Spinner,
  Thumb,
} from "../ui/common";
import { CountUp, Steps, type StepState } from "../ui/motion";
import { Distribution, TrendChart } from "../ui/charts";
import { JobPanels, LiveButton, ScanButton, useLiveChecks, useScan } from "../ui/jobs";
import { HelpButton } from "../ui/help";

export async function loader({ request }: LoaderFunctionArgs) {
  const ctx = await context(request);
  if (ctx.demo) await seedDemo();
  else await ensureStore(ctx.shop);
  const [overview, changes, trend] = await Promise.all([
    catalogOverview(ctx.shop),
    db.change.findMany({
      where: { product: { shop: ctx.shop } },
      orderBy: { createdAt: "desc" },
      take: 4,
      select: { id: true, status: true, createdAt: true, product: { select: { id: true, title: true } } },
    }),
    readinessTrend(ctx.shop),
  ]);
  // End the line at today's live figure so the chart always agrees with the
  // hero, even before today's reading has been saved.
  const today = new Date().toISOString().slice(0, 10);
  const current = {
    day: today,
    readiness: overview.summary.readiness,
    ready: overview.summary.ready,
    active: overview.summary.active,
    fixes: overview.fixPlan.length,
  };
  const series = overview.summary.active
    ? [...trend.filter((p) => p.day !== today), current]
    : trend;
  return {
    ...overview,
    trend: series,
    changes: changes.map((c) => ({ ...c, createdAt: c.createdAt.toISOString() })),
    demo: ctx.demo,
    missingScopes: ctx.missingScopes.map(
      (scope) => OPTIONAL_SCOPES[scope as keyof typeof OPTIONAL_SCOPES],
    ),
  };
}

type Data = Awaited<ReturnType<typeof loader>>;
type Next = { kind: "scan" | "live" | "link"; title: string; detail: string; action: ReactNode };

const CHANGE_LABEL: Record<string, string> = {
  PUBLISHED: "Description published",
  RESTORED: "Previous description restored",
  FAILED: "Publish failed",
  CONFLICT: "Stopped: product changed",
};
const shortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Change in readiness across the readings of the last 30 days. */
function delta(trend: Data["trend"]) {
  if (trend.length < 2) return null;
  const end = trend[trend.length - 1];
  const cutoff = new Date(Date.parse(`${end.day}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
  const start = trend.find((p) => p.day >= cutoff) ?? trend[0];
  if (start === end) return null;
  return { points: end.readiness - start.readiness, since: start.day };
}

export default function Overview() {
  const data = useLoaderData<typeof loader>();
  const { summary, store } = data;
  const scan = useScan(store);
  const live = useLiveChecks();
  const hasProducts = summary.total > 0;
  const imported = hasProducts && !store.syncStarted;
  const liveRelevant = summary.liveCheckable > 0;
  const liveDone = liveRelevant && summary.liveChecked >= summary.liveCheckable;
  const syncedAt = formatDate(store.syncedAt);
  const busy = scan.running || live.running;
  const change = delta(data.trend);

  const runButton = (label: string, onClick: () => void, running: boolean) => (
    <button type="button" className="button on-dark" onClick={onClick} disabled={busy} aria-busy={running}>
      {running && <Spinner />}
      {running ? "Working..." : label}
      {!running && <Icon name="arrow" size={15} />}
    </button>
  );
  const next = nextStep(data, {
    scan: (label) => runButton(label, scan.start, scan.running),
    live: (label) => runButton(label, live.start, live.running),
  });
  const steps: { title: string; detail: string; state: StepState }[] = [
    {
      title: "Import catalog",
      detail: imported ? `${summary.total} products` : store.syncStarted ? "Partly imported" : "Not started",
      state: imported ? "done" : "current",
    },
    {
      title: "Check live pages",
      detail: liveRelevant ? `${summary.liveChecked} of ${summary.liveCheckable} pages` : imported ? "No published pages" : "After import",
      state: liveDone ? "done" : imported && liveRelevant ? "current" : "todo",
    },
    {
      title: "Fix issues",
      detail: !imported ? "After import" : data.fixPlan.length ? `${data.fixPlan.length} fixes open` : "All clear",
      state: imported && !data.fixPlan.length ? "done" : imported && (liveDone || !liveRelevant) ? "current" : "todo",
    },
  ];
  const healthy = data.signals.filter((s) => s.status === "pass");
  const signalIssues = data.signals.filter((s) => s.status !== "pass");
  const activeReadiness = data.products.filter((p) => p.status === "ACTIVE").map((p) => p.readiness);

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
          <HelpButton topic="overview" />
          {/* The hero already offers its own action; avoid a duplicate. */}
          {hasProducts && next.kind !== "live" && (
            <LiveButton live={live} disabled={scan.running || !summary.liveCheckable} />
          )}
          {hasProducts && next.kind !== "scan" && <ScanButton scan={scan} />}
        </div>
      </div>
      <JobPanels scan={scan} live={live} />
      {data.missingScopes.length > 0 && (
        <Notice tone="info">
          Approve Soodo’s updated permissions in Shopify to check {data.missingScopes.join(" and ")}. Until then
          those checks show as not checked; everything else works.
        </Notice>
      )}
      {!scan.running && !store.syncStarted && hasProducts && !store.syncedAt && (
        <Notice tone="info">Products changed in Shopify since the last scan. Scan again to refresh these results.</Notice>
      )}

      <section className="brand-hero" aria-labelledby="next-step-title">
        <svg className="hero-mark" viewBox="0 0 200 200" aria-hidden="true">
          <circle cx="92" cy="108" r="58" fill="none" stroke="currentColor" strokeWidth="18" />
          <circle cx="152" cy="48" r="18" fill="currentColor" />
        </svg>
        <div className="hero-figure">
          <span className="hero-eyebrow">Catalog readiness</span>
          {hasProducts ? (
            <>
              <p className="hero-number">
                <CountUp value={summary.readiness} />
                <span>%</span>
              </p>
              <p className="hero-sub">
                {change ? (
                  <>
                    <span className={`delta ${change.points >= 0 ? "up" : "down"}`}>
                      {change.points >= 0 ? "▲" : "▼"} {Math.abs(change.points)} pts
                    </span>{" "}
                    since {shortDay(change.since)}
                  </>
                ) : (
                  `${summary.ready} of ${summary.active} active products fully ready`
                )}
              </p>
            </>
          ) : (
            <p className="hero-number empty">—</p>
          )}
        </div>
        <div className="hero-next">
          <span className="hero-eyebrow">Next step</span>
          <h2 id="next-step-title">{next.title}</h2>
          <p>{next.detail}</p>
          <div className="hero-action">{next.action}</div>
        </div>
      </section>
      <div className="steps-card">
        <Steps steps={steps} label="Setup progress" />
      </div>

      {hasProducts && (
        <>
          <section className="area-grid stagger" aria-label="Readiness by area">
            {data.areas.map((area) => {
              const pct = area.total ? Math.round((area.passing / area.total) * 100) : 0;
              return (
                <AppLink
                  key={area.group}
                  to={`/app/fixes?area=${area.group}`}
                  className="area-tile"
                  label={`${GROUPS[area.group].label}: ${pct}% of products pass`}
                >
                  <span className="area-label">{GROUPS[area.group].label}</span>
                  <strong className="area-value">
                    {area.total ? (
                      <>
                        <CountUp value={pct} />
                        <small>%</small>
                      </>
                    ) : (
                      "—"
                    )}
                  </strong>
                  <Meter value={pct} tone="brand" label={`${GROUPS[area.group].label} products passing`} />
                  <span className="area-note">
                    {area.total
                      ? `${area.passing} of ${area.total} products pass${area.pending ? ` · ${area.pending} pending` : ""}`
                      : area.pending
                        ? area.group === "visibility"
                          ? "Run live checks to measure"
                          : "Rescan to measure"
                        : "Not checked yet"}
                    {area.issues > 0 && (
                      <span className="area-issues">
                        {area.issues} issue{area.issues === 1 ? "" : "s"}
                      </span>
                    )}
                  </span>
                  <Icon name="arrow" size={14} />
                </AppLink>
              );
            })}
          </section>

          {/* Two equal columns whose edges line up with the tiles above. Each
              column stacks independently, so short panels leave no gaps. */}
          <div className="overview-columns">
            <div className="overview-column">
              <Panel
                id="trend-title"
                title="Readiness over time"
                description="One reading per day, saved after scans, live checks and published changes."
              >
                <div className="panel-body">
                  {data.trend.length > 1 ? (
                    <TrendChart points={data.trend} label="Catalog readiness over time" />
                  ) : (
                    <div className="chart-empty">
                      <TrendChart points={data.trend} label="Catalog readiness over time" />
                      <p>
                        Your trend starts {data.trend.length ? "today" : "with your next scan"}. Each day you scan,
                        check live pages or publish a change adds a point.
                      </p>
                    </div>
                  )}
                </div>
              </Panel>

              <Panel
                id="top-fixes"
                title="Top fixes"
                description="Highest impact first: priority × products affected."
                action={data.fixPlan.length > 0 && <PanelLink to="/app/fixes">All {data.fixPlan.length}</PanelLink>}
              >
                {data.fixPlan.length ? (
                  <ul className="panel-rows stagger">
                    {data.fixPlan.slice(0, 5).map((fix) => (
                      <li key={fix.id}>
                        <Mark kind={fix.priority} label={`${PRIORITY_LABEL[fix.priority]} priority`} />
                        <div className="row-main">
                          <strong>{fix.label}</strong>
                          <small>
                            {PRIORITY_LABEL[fix.priority]} · {GROUPS[fix.group].label}
                          </small>
                        </div>
                        <div className="impact" title={`${fix.products.length} of ${summary.active} active products`}>
                          <span className="impact-bar">
                            <span style={{ width: `${(fix.products.length / Math.max(1, summary.active)) * 100}%` }} />
                          </span>
                          <span className="num">
                            {fix.products.length}/{summary.active}
                          </span>
                        </div>
                        <AppLink
                          to={
                            fix.products.length === 1 ? `/app/products/${fix.products[0].recordId}` : `/app/fixes#${fix.id}`
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
                  <Empty title="Nothing to fix right now">Every active product passes the checks that could be run.</Empty>
                )}
              </Panel>

              <Panel
                id="store-signals"
                title="Store-wide signals"
                description={`${healthy.length} of ${data.signals.length} healthy. Shared by every product.`}
              >
                {signalIssues.length > 0 && (
                  <ul className="panel-rows stagger">
                    {signalIssues.map((signal) => (
                      <li className="signal" key={signal.id}>
                        <Mark
                          kind={signal.status === "unknown" ? "unknown" : "medium"}
                          label={signal.status === "unknown" ? "Not checked" : "Needs attention"}
                        />
                        <div className="row-main">
                          <strong>{signal.label}</strong>
                          <small>
                            {signal.evidence}
                            {signal.status === "action" && ` ${signal.action}`}
                          </small>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
                {healthy.length > 0 && (
                  <div className="healthy">
                    {healthy.map((signal) => (
                      <span key={signal.id} className="healthy-chip" title={signal.evidence}>
                        <Icon name="check" size={13} />
                        {signal.label}
                      </span>
                    ))}
                  </div>
                )}
              </Panel>
            </div>

            <div className="overview-column">
              <Panel
                id="distribution-title"
                title="Products by readiness"
                description={`${summary.active} active product${summary.active === 1 ? "" : "s"}, so a high average can’t hide weak ones.`}
              >
                <div className="panel-body">
                  <Distribution values={activeReadiness} />
                </div>
              </Panel>

              <Panel
                id="attention"
                title="Needs attention"
                description="Active products with the lowest readiness."
                action={<PanelLink to="/app/products">All products</PanelLink>}
              >
                {data.attention.length ? (
                  <ul className="panel-rows stagger">
                    {data.attention.map((product) => (
                      <li key={product.recordId} className="link-row">
                        <AppLink to={`/app/products/${product.recordId}`} className="row-link">
                          <Thumb image={product.image} />
                          <span className="row-main">
                            <strong>{product.title}</strong>
                            <small>
                              {product.actions} to fix{product.top ? ` · ${product.top.label}` : ""}
                            </small>
                          </span>
                          <span className="score">
                            <strong>{product.readiness}</strong>
                            <Meter value={product.readiness} label={`${product.title} readiness`} />
                          </span>
                        </AppLink>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty title="No product needs attention">Every active product passes the checks that could be run.</Empty>
                )}
              </Panel>

              <Panel
                id="recent"
                title="Recent changes"
                description="Descriptions published from Soodo."
                action={data.changes.length > 0 && <PanelLink to="/app/history">History</PanelLink>}
              >
                {data.changes.length ? (
                  <ul className="panel-rows stagger">
                    {data.changes.map((item) => (
                      <li key={item.id}>
                        <span className="activity-dot" aria-hidden="true" />
                        <div className="row-main">
                          <strong>{item.product.title}</strong>
                          <small>
                            {CHANGE_LABEL[item.status] ?? item.status.toLowerCase().replace(/_/g, " ")} ·{" "}
                            {formatDate(item.createdAt)}
                          </small>
                        </div>
                        {!["PUBLISHED", "RESTORED"].includes(item.status) && <Badge tone="warning">Check</Badge>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty icon="history" title="Nothing published yet">
                    Approved description updates will appear here.
                  </Empty>
                )}
              </Panel>
            </div>
          </div>
        </>
      )}
      <p className="footer-note">Readiness measures checks Soodo can verify. It is not a search or AI ranking.</p>
    </>
  );
}

/** The single most useful thing to do now, in the order the workflow expects. */
function nextStep(
  data: Data,
  run: { scan: (label: string) => ReactNode; live: (label: string) => ReactNode },
): Next {
  const { summary, store, fixPlan, products } = data;
  if (!summary.total)
    return {
      kind: "scan",
      title: "Get your products found",
      detail:
        "Start with a read-only scan. Soodo imports products, variants, categories and store policies, then checks what search engines and AI assistants can learn from them.",
      action: run.scan("Scan catalog"),
    };
  if (store.syncStarted)
    return {
      kind: "scan",
      title: "Finish importing your catalog",
      detail: `${summary.total} products imported so far. Results cover imported products only.`,
      action: run.scan("Continue scan"),
    };
  if (summary.needsRescan)
    return {
      kind: "scan",
      title: "Rescan to unlock the newest checks",
      detail: `${summary.needsRescan} product${summary.needsRescan === 1 ? " was" : "s were"} imported before category, barcode and price checks existed.`,
      action: run.scan("Scan catalog"),
    };
  if (summary.liveCheckable > summary.liveChecked) {
    const remaining = summary.liveCheckable - summary.liveChecked;
    return {
      kind: "live",
      title: "See what crawlers actually see",
      detail: `${remaining} published page${remaining === 1 ? " hasn’t" : "s haven’t"} been checked. Soodo loads each page and robots.txt the way a crawler does.`,
      action: run.live("Check live pages"),
    };
  }
  const draft = products.find((p) => p.draft);
  if (draft)
    return {
      kind: "link",
      title: `Review the draft for ${draft.title}`,
      detail: "A description update is waiting for your approval. Nothing changes until you publish it.",
      action: (
        <AppLink to={`/app/products/${draft.recordId}#draft`} className="button on-dark">
          Review draft <Icon name="arrow" size={15} />
        </AppLink>
      ),
    };
  const top = fixPlan[0];
  if (top)
    return {
      kind: "link",
      title: top.label,
      detail: `${top.why} Affects ${top.products.length} active product${top.products.length === 1 ? "" : "s"}.`,
      action: (
        <AppLink
          to={top.products.length === 1 ? `/app/products/${top.products[0].recordId}` : `/app/fixes#${top.id}`}
          className="button on-dark"
        >
          Start fixing <Icon name="arrow" size={15} />
        </AppLink>
      ),
    };
  return {
    kind: "scan",
    title: "Your catalog is in good shape",
    detail: "Every active product passes the checks that could be run. Rescan after you change products in Shopify.",
    action: run.scan("Scan again"),
  };
}
