import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import db from "../app/db.server";
import { assistantForVisit, classifyOrder } from "../app/core/attribution";
import {
  aiSalesSummary,
  productHandle,
  redactOrders,
  syncAiOrders,
} from "../app/services/orders.server";
import type { CatalogAdapter, OrderRecord } from "../app/services/shopify-catalog.server";

test("AI assistants are recognized from the referrer or the UTM source", () => {
  assert.equal(assistantForVisit({ referrerUrl: "https://chatgpt.com/c/123" }), "ChatGPT");
  assert.equal(assistantForVisit({ referrerUrl: "https://www.perplexity.ai/search?q=tent" }), "Perplexity");
  assert.equal(assistantForVisit({ referrerUrl: "https://gemini.google.com/app" }), "Gemini");
  assert.equal(assistantForVisit({ referrerUrl: "https://copilot.microsoft.com/" }), "Copilot");
  assert.equal(assistantForVisit({ referrerUrl: "https://claude.ai/chat/1" }), "Claude");
  // ChatGPT tags links even when the browser sends no referrer.
  assert.equal(assistantForVisit({ referrerUrl: null, landingPage: "/products/a?utm_source=chatgpt.com" }), "ChatGPT");
  assert.equal(assistantForVisit({ utmParameters: { source: "Perplexity" } }), "Perplexity");
  // Search engines and lookalike domains are not AI assistants.
  for (const referrerUrl of ["https://www.google.com/", "https://www.bing.com/", "https://notchatgpt.com/", "not a url"])
    assert.equal(assistantForVisit({ referrerUrl }), null, referrerUrl);
  assert.equal(assistantForVisit(null), null);
});

test("an order is credited to the last AI visit, or the first one", () => {
  const ai = { referrerUrl: "https://chatgpt.com/", landingPage: "/products/tent" };
  const google = { referrerUrl: "https://www.google.com/", landingPage: "/" };
  assert.deepEqual(classifyOrder({ firstVisit: google, lastVisit: ai }), { assistant: "ChatGPT", touch: "last", landingPage: "/products/tent" });
  assert.deepEqual(classifyOrder({ firstVisit: ai, lastVisit: google }), { assistant: "ChatGPT", touch: "first", landingPage: "/products/tent" });
  assert.equal(classifyOrder({ firstVisit: google, lastVisit: google }), null);
  assert.equal(classifyOrder(null), null);
});

function order(i: number, overrides: Partial<OrderRecord> = {}): OrderRecord {
  return {
    id: `gid://shopify/Order/${i}`,
    name: `#${1000 + i}`,
    createdAt: new Date(Date.UTC(2026, 9, 10, 12)).toISOString(),
    test: false,
    cancelledAt: null,
    amount: 100,
    currency: "EUR",
    journey: { firstVisit: null, lastVisit: { referrerUrl: "https://www.google.com/", landingPage: "/", utmParameters: null } },
    ...overrides,
  };
}
const fromAi = (referrerUrl: string, landingPage = "https://shop.example/products/blue-tent") => ({
  journey: { firstVisit: null, lastVisit: { referrerUrl, landingPage, utmParameters: null } },
});

async function storeWithOrders(pages: OrderRecord[][]) {
  const shop = `orders-${randomUUID()}.myshopify.com`;
  await db.store.create({ data: { shop } });
  let calls = 0;
  const adapter: CatalogAdapter = {
    async read() {
      return null;
    },
    async writeDescription() {},
    async page() {
      return { products: [], cursor: null };
    },
    async orders(_since, cursor) {
      calls++;
      const index = cursor ? Number(cursor) : 0;
      return { orders: pages[index], cursor: index + 1 < pages.length ? String(index + 1) : null };
    },
  };
  return { shop, adapter, calls: () => calls };
}

test("syncing records AI orders, skips test and cancelled orders, and totals all sales", async () => {
  const now = new Date(Date.UTC(2026, 9, 15, 12));
  const { shop, adapter } = await storeWithOrders([
    [
      order(1, fromAi("https://chatgpt.com/")),
      order(2, { ...fromAi("https://www.perplexity.ai/"), amount: 250 }),
      order(3),
      order(4, { ...fromAi("https://chatgpt.com/"), test: true }),
    ],
    [order(5, { ...fromAi("https://chatgpt.com/"), cancelledAt: now.toISOString() }), order(6, { amount: 50 })],
  ]);
  try {
    const result = await syncAiOrders(shop, adapter, { now });
    assert.deepEqual(result, { done: true, scanned: 4, found: 2 });
    const summary = await aiSalesSummary(shop, now);
    assert.equal(summary.orders, 2);
    assert.equal(summary.revenue, 350);
    assert.equal(summary.totalOrders, 4);
    assert.equal(summary.totalRevenue, 500);
    assert.equal(summary.currency, "EUR");
    assert.deepEqual(summary.byAssistant.map((a) => [a.name, a.orders, a.revenue]), [["Perplexity", 1, 250], ["ChatGPT", 1, 100]]);
    assert.equal(summary.recent[0].product, "Blue Tent");
    assert.equal(summary.stale, false);
    // Running again does not duplicate orders.
    await syncAiOrders(shop, adapter, { now, restart: true });
    assert.equal(await db.aiOrder.count({ where: { shop } }), 2);
  } finally {
    await db.store.deleteMany({ where: { shop } });
  }
});

test("large order histories continue across runs, and only one sync runs at a time", async () => {
  const pages = Array.from({ length: 10 }, (_, p) => [order(p * 2, fromAi("https://claude.ai/")), order(p * 2 + 1)]);
  const { shop, adapter, calls } = await storeWithOrders(pages);
  const now = new Date(Date.UTC(2026, 9, 15, 12));
  try {
    const first = await syncAiOrders(shop, adapter, { now });
    assert.equal(first.done, false);
    assert.equal(calls(), 8);
    // The run is not finished, so the summary asks for another pass.
    assert.equal((await aiSalesSummary(shop, now)).stale, true);
    const second = await syncAiOrders(shop, adapter, { now });
    assert.deepEqual(second, { done: true, scanned: 20, found: 2 });
    assert.equal(await db.aiOrder.count({ where: { shop } }), 10);
    // A held lease blocks a second, overlapping sync.
    await db.store.update({
      where: { shop },
      data: { ordersSync: JSON.stringify({ token: "x", leaseUntil: new Date(now.getTime() + 60_000).toISOString(), since: "2026-09-15", cursor: "3", scanned: 0, revenue: 0, currency: null, startedAt: now.toISOString() }) },
    });
    await assert.rejects(syncAiOrders(shop, adapter, { now }), /already updating/);
  } finally {
    await db.store.deleteMany({ where: { shop } });
  }
});

test("old AI orders are deleted after 90 days, and customer redaction removes orders", async () => {
  const now = new Date(Date.UTC(2026, 9, 15, 12));
  const { shop, adapter } = await storeWithOrders([[order(1, fromAi("https://chatgpt.com/"))]]);
  try {
    await db.aiOrder.create({
      data: { shop, orderGid: "gid://shopify/Order/old", name: "#1", createdAt: new Date(Date.UTC(2026, 5, 1)), amount: 10, currency: "EUR", assistant: "ChatGPT", touch: "last" },
    });
    await syncAiOrders(shop, adapter, { now });
    assert.deepEqual((await db.aiOrder.findMany({ where: { shop } })).map((o) => o.orderGid), ["gid://shopify/Order/1"]);
    assert.equal(await redactOrders(shop, [1]), 1);
    assert.equal(await db.aiOrder.count({ where: { shop } }), 0);
  } finally {
    await db.store.deleteMany({ where: { shop } });
  }
});

test("landing pages become readable product names", () => {
  assert.equal(productHandle("https://shop.example/products/trail-28-backpack?utm_source=chatgpt.com"), "Trail 28 Backpack");
  assert.equal(productHandle("/collections/all"), null);
  assert.equal(productHandle(null), null);
});
