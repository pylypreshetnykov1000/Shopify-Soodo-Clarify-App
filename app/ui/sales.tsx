import { AppLink, Empty, formatDate, Icon, Panel, Spinner } from "./common";
import { CountUp } from "./motion";

export type AiSales = {
  syncedAt: string | null;
  stale: boolean;
  syncing: boolean;
  orders: number;
  revenue: number;
  currency: string | null;
  totalOrders: number | null;
  totalRevenue: number | null;
  byAssistant: { name: string; orders: number; revenue: number }[];
  recent: {
    id: string;
    name: string;
    createdAt: string;
    amount: number;
    currency: string;
    assistant: string;
    product: string | null;
  }[];
};

export const money = (amount: number, currency: string | null) =>
  new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency ?? "USD",
    maximumFractionDigits: amount >= 1000 ? 0 : 2,
  }).format(amount);

const share = (sales: AiSales) =>
  sales.totalRevenue && sales.totalRevenue > 0
    ? Math.max(sales.revenue > 0 ? 0.1 : 0, Math.round((sales.revenue / sales.totalRevenue) * 1000) / 10)
    : null;

/** The outcome merchants care about: orders that AI assistants sent. */
export function AiSalesPanel({
  sales,
  connected,
  updating,
  onRefresh,
  compact = false,
}: {
  sales: AiSales;
  connected: boolean;
  updating: boolean;
  onRefresh: () => void;
  /** Figures only, with a link to Performance for the breakdown. */
  compact?: boolean;
}) {
  const pct = share(sales);
  const top = Math.max(1, ...sales.byAssistant.map((a) => a.revenue));
  return (
    <Panel
      id="ai-sales"
      title="Sales from AI assistants"
      description={
        connected
          ? `Last 30 days${sales.syncedAt ? ` · updated ${formatDate(sales.syncedAt)}` : ""}`
          : "Orders from ChatGPT, Perplexity, Gemini, Copilot and Claude."
      }
      action={
        connected && (
          <button type="button" className="button compact quiet" onClick={onRefresh} disabled={updating} aria-busy={updating}>
            {updating ? <Spinner /> : <Icon name="refresh" size={14} />}
            {updating ? "Updating..." : "Refresh"}
          </button>
        )
      }
      className="ai-sales"
    >
      {!connected ? (
        <Empty icon="info" title="Approve order access to see these sales">
          Soodo reads which website each order came from, never who placed it. Approve the order permission in your
          Shopify admin, then open Soodo again.
        </Empty>
      ) : !sales.syncedAt && updating ? (
        <Empty icon="refresh" title="Reading your recent orders">
          This takes a few seconds the first time.
        </Empty>
      ) : (
        <>
          <div className="sales-figures">
            <div>
              <span className="stat-label">Orders</span>
              <strong className="sales-value">
                <CountUp value={sales.orders} />
              </strong>
              {sales.totalOrders !== null && (
                <span className="stat-note">of {sales.totalOrders} orders</span>
              )}
            </div>
            <div>
              <span className="stat-label">Revenue</span>
              <strong className="sales-value">{money(sales.revenue, sales.currency)}</strong>
              {pct !== null && <span className="stat-note">{pct}% of your sales</span>}
            </div>
          </div>
          {compact ? (
            <div className="next-foot">
              <AppLink to="/app/performance" className="panel-link">
                See sales by assistant
                <Icon name="arrow" size={13} />
              </AppLink>
            </div>
          ) : sales.orders > 0 ? (
            <>
              <ul className="assistant-bars" aria-label="Revenue by assistant">
                {sales.byAssistant.map((a) => (
                  <li key={a.name}>
                    <span className="assistant-name">{a.name}</span>
                    <span className="assistant-track">
                      <span style={{ width: `calc((100% - 70px) * ${a.revenue / top})` }} />
                      <span className="assistant-value">{money(a.revenue, sales.currency)}</span>
                    </span>
                    <span className="assistant-orders">
                      {a.orders} order{a.orders === 1 ? "" : "s"}
                    </span>
                  </li>
                ))}
              </ul>
              <ul className="panel-rows recent-orders" aria-label="Recent orders from AI assistants">
                {sales.recent.map((order) => (
                  <li key={order.id}>
                    <span className="activity-dot" aria-hidden="true" />
                    <div className="row-main">
                      <strong>
                        {order.name}
                        {order.product ? ` · ${order.product}` : ""}
                      </strong>
                      <small>
                        From {order.assistant} · {formatDate(order.createdAt)}
                      </small>
                    </div>
                    <span className="row-meta">{money(order.amount, order.currency)}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <Empty icon="info" title="No orders from AI assistants yet">
              As your products get easier to find, orders that start in ChatGPT, Perplexity and others will show
              here.
            </Empty>
          )}
          {!compact && (
          <p className="sales-note">
            Counts orders whose visit came from an AI assistant. Some assistants don’t pass this on, so the real
            number can be higher.
          </p>
          )}
        </>
      )}
    </Panel>
  );
}
