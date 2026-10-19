import type { LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { context } from "../services/context.server";
import { ensureStore } from "../services/catalog.server";
import { seedDemo } from "../services/demo.server";
import { catalogOverview } from "../services/geo.server";
import { liveTrend } from "../services/snapshots.server";
import { aiSalesSummary } from "../services/orders.server";
import { visibilitySummary } from "../services/visibility.server";
import { visibilityEngine } from "../services/gemini.server";
import { GROUPS } from "../core/geo";
import { AppLink, Empty, Icon, Meter, Notice, Panel, PanelLink } from "../ui/common";
import { CountUp } from "../ui/motion";
import { Distribution, TrendChart } from "../ui/charts";
import { AiSalesPanel } from "../ui/sales";
import { useAiSalesRefresh } from "../ui/jobs";
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
  return {
    summary: overview.summary,
    areas: overview.areas,
    readiness: overview.products.filter((p) => p.status === "ACTIVE").map((p) => p.readiness),
    trend: await liveTrend(ctx.shop, overview.summary, overview.fixPlan.length),
    sales,
    ordersConnected: !ctx.missingScopes.includes("read_orders"),
    visibility: { history: visibility.history, latest: visibility.latest && { score: visibility.latest.score } },
  };
}

const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

export default function Performance() {
  const data = useLoaderData<typeof loader>();
  const { summary } = data;
  const sales = useAiSalesRefresh(data.sales, data.ordersConnected, summary.total > 0);
  const history = data.visibility.history;

  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Performance</h1>
          <p>Whether your products are getting found by AI assistants, and whether it pays off</p>
        </div>
        <div className="page-actions">
          <HelpButton topic="performance" />
        </div>
      </div>
      <Notice result={sales.notice} />

      {!summary.total ? (
        <section className="panel">
          <Empty icon="info" title="Nothing to measure yet">
            Import your products from the Dashboard first. Results appear here as you work.
          </Empty>
        </section>
      ) : (
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

          <div className="overview-columns">
            <div className="overview-column">
              <AiSalesPanel
                sales={data.sales}
                connected={data.ordersConnected}
                updating={sales.updating}
                onRefresh={sales.refresh}
              />
              <Panel
                id="visibility-history"
                title="AI visibility over time"
                description="The score from each visibility test, newest last."
                action={<PanelLink to="/app/visibility">Tests</PanelLink>}
              >
                {history.length ? (
                  <ul className="rank-bars score-history" aria-label="AI visibility by test">
                    {history.map((h, i) => (
                      <li key={i}>
                        <span className="rank-name">
                          <strong>{shortDate(h.date)}</strong>
                        </span>
                        <span className="rank-track" aria-hidden="true">
                          <span
                            className={visibilityBand(h.score).tone}
                            style={{ width: `${h.score}%` }}
                          />
                        </span>
                        <span className="rank-count">{h.score}/100</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty icon="chat" title="No visibility test yet">
                    <AppLink to="/app/visibility" className="text-link">
                      Run your first test
                    </AppLink>{" "}
                    to see how often Gemini recommends your store. Repeat it weekly to build a trend.
                  </Empty>
                )}
              </Panel>
            </div>
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
                id="distribution-title"
                title="Products by readiness"
                description={`${summary.active} active product${summary.active === 1 ? "" : "s"}, so a high average can’t hide weak ones.`}
              >
                <div className="panel-body">
                  <Distribution values={data.readiness} />
                </div>
              </Panel>
            </div>
          </div>
          <p className="footer-note">
            Readiness measures checks Soodo can verify. AI visibility is a sample of Gemini’s answers. Neither is a
            search ranking.
          </p>
        </>
      )}
    </>
  );
}
