import { useCallback, useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import type { action as scanAction } from "../routes/app.scan";
import type { action as liveAction } from "../routes/app.live";
import type { action as ordersAction } from "../routes/app.orders";
import type { action as visibilityAction } from "../routes/app.visibility";
import { Icon, Notice, Spinner, useAppHref } from "./common";

type Step = { ok: boolean; done: boolean; message: string };

/**
 * Runs a server action in small steps until it reports done. Each step is a
 * short request, so large catalogs never hit request timeouts, and every
 * completed step revalidates the page so results appear as they arrive.
 */
function useBatchJob<D extends Step>(path: string, next: (d: D) => Record<string, string>) {
  const fetcher = useFetcher<D>();
  const href = useAppHref(path);
  const stopped = useRef(false);
  const handled = useRef<D | null>(null);
  const [running, setRunning] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [last, setLast] = useState<D | null>(null);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  useEffect(() => {
    const data = fetcher.data as D | undefined;
    if (fetcher.state !== "idle" || !data || handled.current === data) return;
    handled.current = data;
    setLast(data);
    if (!data.ok || data.done || stopped.current) {
      setRunning(false);
      setStopping(false);
      setResult(
        data.ok && !data.done
          ? { ok: true, message: "Paused. Continue any time; finished work is kept." }
          : data,
      );
      return;
    }
    fetcher.submit(next(data), { method: "post", action: href });
  }, [fetcher, fetcher.state, fetcher.data, href, next]);

  const start = useCallback(
    (form: Record<string, string>) => {
      stopped.current = false;
      setStopping(false);
      setRunning(true);
      setResult(null);
      setLast(null);
      fetcher.submit(form, { method: "post", action: href });
    },
    [fetcher, href],
  );
  const stop = useCallback(() => {
    stopped.current = true;
    setStopping(true);
  }, []);
  return { running, last, result, start, stop, stopping: running && stopping };
}

const continueScan = () => ({ restart: "false" });
const continueOrders = () => ({});
const continueLive = () => ({});
const continueVisibility = () => ({ intent: "continue" });

export function useScan(store: { syncStarted: string | null; scanTotal: number | null }) {
  const job = useBatchJob<Awaited<ReturnType<typeof scanAction>>>("/app/scan", continueScan);
  return {
    ...job,
    start: () => job.start({ restart: store.syncStarted ? "false" : "true" }),
    resumable: !!store.syncStarted,
  };
}
export function useLiveChecks() {
  const job = useBatchJob<Awaited<ReturnType<typeof liveAction>>>("/app/live", continueLive);
  return { ...job, start: () => job.start({}) };
}

/** Updates "sales from AI assistants" in batches of recent orders. */
export function useOrdersSync() {
  const job = useBatchJob<Awaited<ReturnType<typeof ordersAction>>>("/app/orders", continueOrders);
  return { ...job, start: () => job.start({}) };
}

/** Asks the AI assistant a few buyer questions per request until the test is done. */
export function useVisibilityTest() {
  const job = useBatchJob<Awaited<ReturnType<typeof visibilityAction>>>("/app/visibility", continueVisibility);
  return { ...job, start: () => job.start({ intent: "start" }) };
}

export function ScanButton({
  scan,
  primary,
}: {
  scan: ReturnType<typeof useScan>;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      className={`button${primary ? " primary" : ""}`}
      onClick={scan.start}
      disabled={scan.running}
      aria-busy={scan.running}
    >
      {scan.running ? <Spinner /> : <Icon name="refresh" size={15} />}
      {scan.running ? "Scanning..." : scan.resumable ? "Continue scan" : "Scan catalog"}
    </button>
  );
}
export function LiveButton({
  live,
  disabled,
}: {
  live: ReturnType<typeof useLiveChecks>;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      className="button"
      onClick={live.start}
      disabled={live.running || disabled}
      aria-busy={live.running}
    >
      {live.running ? <Spinner /> : <Icon name="globe" size={15} />}
      {live.running ? "Checking..." : "Check live pages"}
    </button>
  );
}

export function JobPanels({
  scan,
  live,
}: {
  scan: ReturnType<typeof useScan>;
  live?: ReturnType<typeof useLiveChecks>;
}) {
  const imported = scan.last?.imported ?? 0;
  const total = scan.last?.total ?? null;
  return (
    <>
      {scan.running && (
        <div className="scan-panel" role="status">
          <div className="scan-panel-text">
            <span>
              {scan.stopping ? "Pausing after this batch..." : "Importing products from Shopify"}
            </span>
            <div
              className={`meter${total ? "" : " indeterminate"}`}
              style={{ ["--progress" as string]: total ? Math.min(1, imported / total) : 0 }}
            >
              <span />
            </div>
            <small>
              {total ? `${Math.min(imported, total)} of ${total} products` : `${imported} products imported`}
            </small>
          </div>
          <button type="button" className="button compact quiet" onClick={scan.stop} disabled={scan.stopping}>
            <Icon name="pause" size={14} /> Pause
          </button>
        </div>
      )}
      {live?.running && (
        <div className="scan-panel" role="status">
          <div className="scan-panel-text">
            <span>
              {live.stopping ? "Pausing after this batch..." : "Checking live product pages"}
            </span>
            <div
              className={`meter${live.last ? "" : " indeterminate"}`}
              style={{
                ["--progress" as string]: live.last
                  ? live.last.checked / Math.max(1, live.last.checked + live.last.remaining)
                  : 0,
              }}
            >
              <span />
            </div>
            <small>
              {live.last ? `${live.last.remaining} pages remaining` : "Loading pages and robots.txt"}
            </small>
          </div>
          <button type="button" className="button compact quiet" onClick={live.stop} disabled={live.stopping}>
            <Icon name="pause" size={14} /> Pause
          </button>
        </div>
      )}
      <Notice result={scan.result} />
      {live && <Notice result={live.result} />}
    </>
  );
}
