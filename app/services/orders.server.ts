import { randomUUID } from "node:crypto";
import db from "../db.server";
import { classifyOrder } from "../core/attribution";
import type { CatalogAdapter } from "./shopify-catalog.server";

/** Days of orders a sync reads; summaries cover the last 30. */
export const ORDER_WINDOW_DAYS = 30;
/** AI orders older than this are deleted (data minimization). */
const RETENTION_DAYS = 90;
const PAGES_PER_RUN = 8;
const LEASE_MS = 120_000;

type SyncState = {
  token: string;
  leaseUntil: string;
  since: string;
  cursor: string | null;
  scanned: number;
  revenue: number;
  currency: string | null;
  startedAt: string;
};
export type OrderStats = {
  since: string;
  until: string;
  scanned: number;
  revenue: number;
  currency: string | null;
};
const parse = <T>(value: string | null | undefined): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

/**
 * Reads recent orders in small batches and records the ones an AI assistant
 * referred. Call repeatedly until it reports done; progress is kept between
 * calls, and a lease stops two syncs from counting the same orders twice.
 */
export async function syncAiOrders(
  shop: string,
  adapter: CatalogAdapter,
  { restart = false, now = new Date() } = {},
) {
  if (!adapter.orders) throw new Error("Order data is not available for this store.");
  const store = await db.store.findUniqueOrThrow({ where: { shop } });
  const current = parse<SyncState>(store.ordersSync);
  if (current && !restart && new Date(current.leaseUntil) > now)
    throw new Error("Sales from AI assistants are already updating. Try again in a moment.");
  const state: SyncState =
    current && !restart
      ? current
      : {
          token: "",
          leaseUntil: "",
          since: new Date(now.getTime() - ORDER_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10),
          cursor: null,
          scanned: 0,
          revenue: 0,
          currency: null,
          startedAt: now.toISOString(),
        };
  state.token = randomUUID();
  state.leaseUntil = new Date(now.getTime() + LEASE_MS).toISOString();
  // Claim the run only if nobody else changed it since we read it.
  const claimed = await db.store.updateMany({
    where: { shop, ordersSync: store.ordersSync },
    data: { ordersSync: JSON.stringify(state) },
  });
  if (!claimed.count) throw new Error("Sales from AI assistants are already updating. Try again in a moment.");

  let found = 0;
  for (let page = 0; page < PAGES_PER_RUN; page++) {
    const result = await adapter.orders(state.since, state.cursor);
    for (const order of result.orders) {
      if (order.test || order.cancelledAt) continue;
      state.scanned++;
      state.revenue += order.amount;
      state.currency ??= order.currency;
      const ai = classifyOrder(order.journey);
      if (!ai) continue;
      found++;
      const data = {
        name: order.name,
        createdAt: new Date(order.createdAt),
        amount: order.amount,
        currency: order.currency,
        assistant: ai.assistant,
        touch: ai.touch,
        landingPage: ai.landingPage,
      };
      await db.aiOrder.upsert({
        where: { shop_orderGid: { shop, orderGid: order.id } },
        create: { shop, orderGid: order.id, ...data },
        update: data,
      });
    }
    state.cursor = result.cursor;
    if (!state.cursor) break;
  }

  const done = !state.cursor;
  if (done) {
    const stats: OrderStats = {
      since: state.since,
      until: now.toISOString(),
      scanned: state.scanned,
      revenue: Math.round(state.revenue * 100) / 100,
      currency: state.currency,
    };
    await db.$transaction([
      db.store.update({
        where: { shop },
        data: { ordersSync: null, orderStats: JSON.stringify(stats), ordersSyncedAt: now },
      }),
      db.aiOrder.deleteMany({
        where: { shop, createdAt: { lt: new Date(now.getTime() - RETENTION_DAYS * 86_400_000) } },
      }),
    ]);
  } else {
    state.leaseUntil = new Date(0).toISOString(); // Released: the next batch may continue.
    await db.store.update({ where: { shop }, data: { ordersSync: JSON.stringify(state) } });
  }
  return { done, scanned: state.scanned, found };
}

/** Sales from AI assistants over the last 30 days, for the Overview. */
export async function aiSalesSummary(shop: string, now = new Date()) {
  const since = new Date(now.getTime() - ORDER_WINDOW_DAYS * 86_400_000);
  const [store, orders] = await Promise.all([
    db.store.findUnique({ where: { shop } }),
    db.aiOrder.findMany({
      where: { shop, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, createdAt: true, amount: true, currency: true, assistant: true, landingPage: true },
    }),
  ]);
  const stats = parse<OrderStats>(store?.orderStats);
  const revenue = orders.reduce((sum, o) => sum + o.amount, 0);
  const byAssistant = new Map<string, { name: string; orders: number; revenue: number }>();
  for (const order of orders) {
    const entry = byAssistant.get(order.assistant) ?? { name: order.assistant, orders: 0, revenue: 0 };
    entry.orders++;
    entry.revenue += order.amount;
    byAssistant.set(order.assistant, entry);
  }
  const syncedAt = store?.ordersSyncedAt ?? null;
  const run = parse<SyncState>(store?.ordersSync);
  return {
    syncedAt: syncedAt?.toISOString() ?? null,
    // An unfinished run (cursor left) also needs continuing.
    stale: !!run || !syncedAt || now.getTime() - syncedAt.getTime() > 6 * 3_600_000,
    syncing: !!run && new Date(run.leaseUntil) > now,
    orders: orders.length,
    revenue: Math.round(revenue * 100) / 100,
    currency: orders[0]?.currency ?? stats?.currency ?? null,
    totalOrders: stats?.scanned ?? null,
    totalRevenue: stats?.revenue ?? null,
    byAssistant: [...byAssistant.values()].sort((a, b) => b.revenue - a.revenue),
    recent: orders.slice(0, 5).map((o) => ({
      ...o,
      createdAt: o.createdAt.toISOString(),
      product: productHandle(o.landingPage),
    })),
  };
}

/** "/products/trail-28-backpack?utm_source=chatgpt.com" → "Trail 28 Backpack". */
export function productHandle(landingPage: string | null) {
  if (!landingPage) return null;
  try {
    const path = new URL(landingPage, "https://shop.example").pathname;
    const handle = /\/products\/([^/?#]+)/.exec(path)?.[1];
    if (!handle) return null;
    return decodeURIComponent(handle)
      .split("-")
      .filter(Boolean)
      .map((w) => w[0].toUpperCase() + w.slice(1))
      .join(" ");
  } catch {
    return null;
  }
}

/** Shopify's customers/redact lists orders to forget. */
export async function redactOrders(shop: string, orderIds: (string | number)[]) {
  if (!orderIds.length) return 0;
  const gids = orderIds.map((id) => (String(id).startsWith("gid://") ? String(id) : `gid://shopify/Order/${id}`));
  const result = await db.aiOrder.deleteMany({ where: { shop, orderGid: { in: gids } } });
  return result.count;
}
