import type { ReactNode } from "react";
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
  Spinner,
} from "../ui/common";
import { CountUp, Steps, type StepState } from "../ui/motion";
import { JobPanels, LiveButton, ScanButton, useLiveChecks, useScan } from "../ui/jobs";

export async function loader({ request }: LoaderFunctionArgs) {
  const ctx = await context(request);
  if (ctx.demo) await seedDemo();
  else await ensureStore(ctx.shop);
  return { ...(await catalogOverview(ctx.shop)), demo: ctx.demo };
}

type Data = Awaited<ReturnType<typeof loader>>;
type Next = { title: string; detail: string; action: ReactNode };

export default function Overview() {
  const data = useLoaderData<typeof loader>();
  const { summary, store } = data;
  const scan = useScan(store);
  const live = useLiveChecks();
  const hasProducts = summary.total > 0;
  const imported = hasProducts && !store.syncStarted;
  const liveDone = summary.liveCheckable > 0 && summary.liveChecked >= summary.liveCheckable;
  const liveRelevant = summary.liveCheckable > 0;
  const fixesDone = imported && data.fixPlan.length === 0;
  const notChecked = Math.max(0, summary.active - summary.ready - summary.needsWork);
  const share = (n: number) => `${summary.active ? (n / summary.active) * 100 : 0}%`;
  const syncedAt = formatDate(store.syncedAt);
  const busy = scan.running || live.running;

  const runButton = (label: string, onClick: () => void, running: boolean) => (
    <button type="button" className="button primary" onClick={onClick} disabled={busy} aria-busy={running}>
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
      detail: liveRelevant
        ? `${summary.liveChecked} of ${summary.liveCheckable} pages`
        : imported
          ? "No published pages"
          : "After import",
      state: liveDone ? "done" : imported && liveRelevant ? "current" : "todo",
    },
    {
      title: "Fix issues",
      detail: !imported ? "After import" : data.fixPlan.length ? `${data.fixPlan.length} fixes open` : "All clear",
      state: fixesDone ? "done" : imported && (liveDone || !liveRelevant) ? "current" : "todo",
    },
  ];

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
        {hasProducts && (
          <div className="page-actions">
            <LiveButton live={live} disabled={scan.running || !summary.liveCheckable} />
            <ScanButton scan={scan} />
          </div>
        )}
      </div>
      <JobPanels scan={scan} live={live} />
      {!scan.running && !store.syncStarted && hasProducts && !store.syncedAt && (
        <Notice tone="info">
          Products changed in Shopify since the last scan. Scan again to refresh these results.
        </Notice>
      )}

      <section className="card next-step" aria-labelledby="next-step-title">
        <div className="next-step-main">
          <div>
            <span className="eyebrow">Next step</span>
            <h2 id="next-step-title">{next.title}</h2>
            <p>{next.detail}</p>
          </div>
          {next.action}
        </div>
        <div className="steps-wrap">
          <Steps steps={steps} label="Setup progress" />
        </div>
      </section>

      {hasProducts && (
        <>
          <section className="hero" aria-label="Catalog summary">
            <div className="hero-score">
              <Dial value={summary.readiness} label="Catalog readiness" />
              <div style={{ minWidth: 0, flex: 1 }}>
                <span className="stat-label">Catalog readiness</span>
                <p>
                  Average of {summary.active} active product{summary.active === 1 ? "" : "s"}
                </p>
                <div className="distribution" aria-hidden="true">
                  <span style={{ width: share(summary.ready), background: "var(--pass)" }} />
                  <span style={{ width: share(summary.needsWork), background: "var(--medium)" }} />
                  <span style={{ width: share(notChecked), background: "var(--line-strong)" }} />
                </div>
                <div className="legend">
                  <span>
                    <i style={{ background: "var(--pass)" }} /> Ready {summary.ready}
                  </span>
                  <span>
                    <i style={{ background: "var(--medium)" }} /> Needs fixes {summary.needsWork}
                  </span>
                  {notChecked > 0 && (
                    <span>
                      <i style={{ background: "var(--line-strong)" }} /> Pending {notChecked}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div>
              <span className="stat-label">Fully ready</span>
              <strong className="stat-value">
                <CountUp value={summary.ready} />
                <small> / {summary.active}</small>
              </strong>
              <span className="stat-note">All checks passed</span>
            </div>
            <div>
              <span className="stat-label">Need fixes</span>
              <strong className="stat-value">
                <CountUp value={summary.needsWork} />
              </strong>
              <span className="stat-note">
                <AppLink to="/app/fixes" className="text-link">
                  Open fix plan
                </AppLink>
              </span>
            </div>
            <div>
              <span className="stat-label">Live pages checked</span>
              <strong className="stat-value">
                <CountUp value={summary.liveChecked} />
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
                  <p>Highest impact first: priority × active products affected.</p>
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
                        <small>
                          {GROUPS[fix.group].label} · {fix.products.length} product
                          {fix.products.length === 1 ? "" : "s"}
                        </small>
                      </div>
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
              <ul className="stagger">
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
                      {signal.url && !data.demo && <ExternalLink href={signal.url}>View</ExternalLink>}
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

/** The single most useful thing to do now, in the order the workflow expects. */
function nextStep(
  data: Data,
  run: { scan: (label: string) => ReactNode; live: (label: string) => ReactNode },
): Next {
  const { summary, store, fixPlan, products } = data;
  if (!summary.total)
    return {
      title: "Import your catalog",
      detail:
        "Read-only. Soodo imports products, variants, categories and store policies, then checks what search engines and AI assistants can learn from them.",
      action: run.scan("Scan catalog"),
    };
  if (store.syncStarted)
    return {
      title: "Finish importing your catalog",
      detail: `${summary.total} products imported so far. Results cover imported products only.`,
      action: run.scan("Continue scan"),
    };
  if (summary.needsRescan)
    return {
      title: "Rescan to unlock the newest checks",
      detail: `${summary.needsRescan} product${summary.needsRescan === 1 ? " was" : "s were"} imported before category, barcode and price checks existed.`,
      action: run.scan("Scan catalog"),
    };
  if (summary.liveCheckable > summary.liveChecked)
    return {
      title: "See what crawlers actually see",
      detail: `${summary.liveCheckable - summary.liveChecked} published page${summary.liveCheckable - summary.liveChecked === 1 ? " hasn't" : "s haven't"} been checked. Soodo loads each page and robots.txt the way a crawler does.`,
      action: run.live("Check live pages"),
    };
  const draft = products.find((p) => p.draft);
  if (draft)
    return {
      title: `Review the draft for ${draft.title}`,
      detail: "A description update is waiting for your approval. Nothing changes until you publish it.",
      action: (
        <AppLink to={`/app/products/${draft.recordId}#draft`} className="button primary">
          Review draft <Icon name="arrow" size={15} />
        </AppLink>
      ),
    };
  const top = fixPlan[0];
  if (top)
    return {
      title: top.label,
      detail: `${top.action} Affects ${top.products.length} active product${top.products.length === 1 ? "" : "s"}.`,
      action: (
        <AppLink
          to={top.products.length === 1 ? `/app/products/${top.products[0].recordId}` : `/app/fixes#${top.id}`}
          className="button primary"
        >
          Start fixing <Icon name="arrow" size={15} />
        </AppLink>
      ),
    };
  return {
    title: "Your catalog is in good shape",
    detail: "Every active product passes the checks that could be run. Rescan after you change products in Shopify.",
    action: run.scan("Scan again"),
  };
}
