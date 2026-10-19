import type { LoaderFunctionArgs } from "react-router";
import { useEffect, useRef } from "react";
import { useLoaderData } from "react-router";
import { context, OPTIONAL_SCOPES } from "../services/context.server";
import { ensureStore } from "../services/catalog.server";
import { catalogOverview } from "../services/geo.server";
import { seedDemo } from "../services/demo.server";
import { liveTrend } from "../services/snapshots.server";
import { aiSalesSummary } from "../services/orders.server";
import { visibilitySummary } from "../services/visibility.server";
import { visibilityEngine } from "../services/gemini.server";
import { planActions } from "../core/actions";
import { AppLink, Empty, formatDate, Icon, Notice, Panel, PanelLink, Spinner } from "../ui/common";
import { CountUp, Steps, type StepState } from "../ui/motion";
import { JobPanels, LiveButton, ScanButton, useAiSalesRefresh, useLiveChecks, useScan } from "../ui/jobs";
import { AiSalesPanel } from "../ui/sales";
import { HelpButton } from "../ui/help";
import { visibilityBand } from "../ui/visibility";

export async function loader({ request }: LoaderFunctionArgs) {
  const ctx = await context(request);
  if (ctx.demo) await seedDemo();
  else await ensureStore(ctx.shop);
  const [overview, sales, visibility] = await Promise.all([
    catalogOverview(ctx.shop),
    aiSalesSummary(ctx.shop),
    visibilitySummary(ctx.shop, visibilityEngine() !== null),
  ]);
  const trend = await liveTrend(ctx.shop, overview.summary, overview.fixPlan.length);
  const latest = visibility.latest;
  return {
    store: overview.store,
    summary: overview.summary,
    fixes: overview.fixPlan.length,
    actions: planActions({
      summary: overview.summary,
      syncStarted: overview.store.syncStarted,
      fixPlan: overview.fixPlan,
      signals: overview.signals,
      drafts: overview.products.filter((p) => p.draft).map((p) => ({ recordId: p.recordId, title: p.title })),
      visibilityTested: !!visibility.latest,
    }),
    change: delta(trend),
    sales,
    visibility: {
      configured: visibility.configured,
      running: visibility.running,
      latest: latest && {
        score: latest.score,
        answered: latest.answered,
        appeared: latest.recommended + latest.cited,
        createdAt: latest.createdAt,
        assistant: latest.assistant,
        competitors: latest.competitors.slice(0, 3),
      },
    },
    ordersConnected: !ctx.missingScopes.includes("read_orders"),
    demo: ctx.demo,
    missingScopes: ctx.missingScopes
      .filter((scope) => scope !== "read_orders")
      .map((scope) => OPTIONAL_SCOPES[scope as keyof typeof OPTIONAL_SCOPES]),
  };
}

const shortDay = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Change in readiness across the readings of the last 30 days. */
function delta(trend: { day: string; readiness: number }[]) {
  if (trend.length < 2) return null;
  const end = trend[trend.length - 1];
  const cutoff = new Date(Date.parse(`${end.day}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);
  const start = trend.find((p) => p.day >= cutoff) ?? trend[0];
  if (start === end) return null;
  return { points: end.readiness - start.readiness, since: start.day };
}

const readinessBand = (score: number) =>
  score >= 80
    ? {
        label: "Good",
        tone: "pass",
        badge: "success",
        text: "Your products give AI assistants and search engines what they need to recommend them.",
      }
    : score >= 50
      ? {
          label: "Getting there",
          tone: "medium",
          badge: "warning",
          text: "AI assistants can read most of your product details. A few fixes will help them recommend you.",
        }
      : {
          label: "Needs work",
          tone: "high",
          badge: "critical",
          text: "AI assistants and search engines are missing key details on most of your products.",
        };

export default function Dashboard() {
  const data = useLoaderData<typeof loader>();
  const { summary, store, change } = data;
  const scan = useScan(store);
  const live = useLiveChecks();
  const hasProducts = summary.total > 0;
  const imported = hasProducts && !store.syncStarted;
  const liveRelevant = summary.liveCheckable > 0;
  const liveDone = liveRelevant && summary.liveChecked >= summary.liveCheckable;
  const syncedAt = formatDate(store.syncedAt);
  const busy = scan.running || live.running;
  const sales = useAiSalesRefresh(data.sales, data.ordersConnected, hasProducts);
  // "Get started" scans, then checks live pages, in one go.
  const chained = useRef(false);
  const getStarted = () => {
    chained.current = true;
    scan.start();
  };
  useEffect(() => {
    if (!chained.current || scan.running || !scan.result) return;
    chained.current = false;
    if (scan.result.ok) live.start();
  }, [scan.running, scan.result, live]);
  const setupDone = imported && (liveDone || !liveRelevant);

  const steps: { title: string; detail: string; state: StepState }[] = [
    {
      title: "Import catalog",
      detail: imported ? `${summary.total} products` : store.syncStarted ? "Partly imported" : "Not started",
      state: imported ? "done" : "current",
    },
    {
      title: "Check live pages",
      detail: liveRelevant
        ? `${summary.liveChecked} of ${summary.liveCheckable} pages`
        : imported
          ? "No published pages"
          : "After import",
      state: liveDone ? "done" : imported && liveRelevant ? "current" : "todo",
    },
    {
      title: "Fix issues",
      detail: !imported ? "After import" : data.fixes ? `${data.fixes} fixes open` : "All clear",
      state: imported && !data.fixes ? "done" : imported && (liveDone || !liveRelevant) ? "current" : "todo",
    },
  ];
  const band = readinessBand(summary.readiness);
  const vis = data.visibility.latest;

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Dashboard</h1>
          <p>
            {data.demo ? "Trail Supply" : (store.name ?? "Your store")}
            {syncedAt ? ` · Last scan ${syncedAt}` : " · Not scanned yet"}
          </p>
        </div>
        <div className="page-actions">
          <HelpButton topic="overview" />
          {hasProducts && <LiveButton live={live} disabled={scan.running || !summary.liveCheckable} />}
          {hasProducts && <ScanButton scan={scan} />}
        </div>
      </div>
      <JobPanels scan={scan} live={live} />
      <Notice result={sales.notice} />
      {data.missingScopes.length > 0 && (
        <Notice tone="info">
          Approve Soodo’s updated permissions in Shopify to check {data.missingScopes.join(" and ")}. Until then those
          checks show as not checked; everything else works.
        </Notice>
      )}
      {!scan.running && !store.syncStarted && hasProducts && !store.syncedAt && (
        <Notice tone="info">Products changed in Shopify since the last scan. Scan again to refresh these results.</Notice>
      )}

      {!hasProducts && (
        <section className="brand-hero onboarding" aria-labelledby="welcome-title">
          <svg className="hero-mark" viewBox="0 0 200 200" aria-hidden="true">
            <circle cx="92" cy="108" r="58" fill="none" stroke="currentColor" strokeWidth="18" />
            <circle cx="152" cy="48" r="18" fill="currentColor" />
          </svg>
          <div className="hero-next">
            <span className="hero-eyebrow">Welcome to Soodo</span>
            <h2 id="welcome-title">Let’s see how easily AI assistants can find your products</h2>
            <p>
              One click reads your products and checks your pages the way ChatGPT and Google do. It takes about a
              minute and changes nothing in your store.
            </p>
            <ol className="onboarding-steps">
              <li>Read your products and store policies</li>
              <li>Check how your product pages look to AI and search</li>
              <li>Show your first three things to fix</li>
            </ol>
            <div className="hero-action">
              <button type="button" className="button on-dark" onClick={getStarted} disabled={busy} aria-busy={busy}>
                {busy && <Spinner />}
                {busy ? "Working..." : "Get started"}
                {!busy && <Icon name="arrow" size={15} />}
              </button>
            </div>
          </div>
        </section>
      )}

      {hasProducts && (
        <>
          <section className="summary-card" aria-labelledby="score-title">
            <div className="summary-score">
              <div className="summary-head">
                <h2 id="score-title">AI readiness score</h2>
                <span className={`badge ${band.badge}`}>{band.label}</span>
              </div>
              <p className="summary-number">
                <CountUp value={summary.readiness} />
                <small>/100</small>
              </p>
              <div
                className="summary-meter"
                role="img"
                aria-label={`Score ${summary.readiness} out of 100. 80 or more is good.`}
              >
                <span className={band.tone} style={{ width: `${summary.readiness}%` }} />
                <i style={{ left: "80%" }} aria-hidden="true" />
              </div>
              <p className="summary-text">
                {band.text}
                {change && change.points !== 0 && (
                  <>
                    {" "}
                    <span className={`delta ${change.points > 0 ? "up" : "down"}`}>
                      {change.points > 0 ? "Up" : "Down"} {Math.abs(change.points)} points
                    </span>{" "}
                    since {shortDay(change.since)}.
                  </>
                )}
              </p>
            </div>
            <div className="summary-stat">
              <span className="stat-label">AI visibility</span>
              {vis ? (
                <>
                  <strong className="summary-value">
                    {vis.score}
                    <small>/100</small>
                  </strong>
                  <span className="stat-note">
                    <AppLink to="/app/visibility" className="text-link">
                      Named or cited in {vis.appeared} of {vis.answered} answers
                    </AppLink>
                  </span>
                </>
              ) : (
                <>
                  <strong className="summary-value empty">Not tested</strong>
                  <span className="stat-note">
                    <AppLink to="/app/visibility" className="text-link">
                      See what Gemini recommends
                    </AppLink>
                  </span>
                </>
              )}
            </div>
            <div className="summary-stat">
              <span className="stat-label">Products fully ready</span>
              <strong className="summary-value">
                {summary.ready}
                <small> of {summary.active}</small>
              </strong>
              <span className="stat-note">Active products with nothing left to fix</span>
            </div>
            <div className="summary-stat">
              <span className="stat-label">Things to fix</span>
              <strong className="summary-value">{data.fixes}</strong>
              <span className="stat-note">
                {data.fixes ? (
                  <AppLink to="/app/fixes" className="text-link">
                    Open the action plan
                  </AppLink>
                ) : (
                  "All clear"
                )}
              </span>
            </div>
            {!setupDone && (
              <div className="summary-steps">
                <Steps steps={steps} label="Setup progress" />
              </div>
            )}
          </section>

          <div className="overview-columns simple-columns">
            <Panel
              id="next-steps"
              title="Your next steps"
              description="Start at the top. Each one makes your products easier to find."
              className="next-steps"
            >
              {data.actions.length ? (
                <ol className="next-list stagger">
                  {data.actions.map((action, i) => (
                    <li key={action.id}>
                      <span className="next-index" aria-hidden="true">
                        {i + 1}
                      </span>
                      <div className="row-main">
                        <strong>{action.title}</strong>
                        <small>{action.detail}</small>
                      </div>
                      {action.run ? (
                        <button
                          type="button"
                          className={`button compact${i === 0 ? " primary" : ""}`}
                          onClick={action.run === "scan" ? scan.start : live.start}
                          disabled={busy}
                        >
                          {action.button}
                        </button>
                      ) : (
                        <AppLink
                          to={action.to!}
                          className={`button compact${i === 0 ? " primary" : ""}`}
                          label={`${action.button}: ${action.title}`}
                        >
                          {action.button}
                        </AppLink>
                      )}
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty title="You’re all set">
                  Every check that could run has passed. Scan again after you change products.
                </Empty>
              )}
              <div className="next-foot">
                <AppLink to="/app/fixes" className="panel-link">
                  See the full action plan
                  <Icon name="arrow" size={13} />
                </AppLink>
              </div>
            </Panel>
            <div className="overview-column">
              <Panel
                id="dashboard-visibility"
                title="Who AI recommends"
                description={
                  vis
                    ? `${vis.assistant}, ${formatDate(vis.createdAt)}`
                    : "Ask Gemini your shoppers’ questions and see who it suggests."
                }
                action={vis && <PanelLink to="/app/visibility">All answers</PanelLink>}
              >
                {vis ? (
                  <ul className="panel-rows who-list">
                    <li>
                      <div className="row-main">
                        <strong>You</strong>
                        <small>Named or cited</small>
                      </div>
                      <span className={`badge ${visibilityBand(vis.score).badge}`}>
                        {vis.appeared} of {vis.answered}
                      </span>
                    </li>
                    {vis.competitors.map((c) => (
                      <li key={c.name}>
                        <div className="row-main">
                          <strong>{c.name}</strong>
                          <small>{c.youSell ? "A brand you sell" : "Recommended instead"}</small>
                        </div>
                        <span className="badge">
                          {c.count} of {vis.answered}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="panel-body cta-body">
                    <AppLink to="/app/visibility" className="button primary">
                      Test AI visibility
                    </AppLink>
                    {!data.visibility.configured && <small>Needs a Gemini API key on the server.</small>}
                  </div>
                )}
              </Panel>
              <AiSalesPanel
                sales={data.sales}
                connected={data.ordersConnected}
                updating={sales.updating}
                onRefresh={sales.refresh}
                compact
              />
            </div>
          </div>
          <p className="footer-note">Readiness measures checks Soodo can verify. It is not a search or AI ranking.</p>
        </>
      )}
    </>
  );
}
