import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import db from "../app/db.server";
import { demoProducts } from "../app/core/demo";
import { readinessTrend, recordSnapshot } from "../app/services/snapshots.server";

async function store(products = demoProducts) {
  const shop = `trend-${randomUUID()}.myshopify.com`;
  await db.store.create({ data: { shop, category: "outdoor" } });
  for (const product of products)
    await db.catalogProduct.create({
      data: { shop, gid: product.id, title: product.title, payload: JSON.stringify(product) },
    });
  return shop;
}

test("snapshots keep one reading per day and replace it with the latest", async () => {
  const shop = await store();
  try {
    const morning = new Date("2026-10-10T08:00:00Z");
    const evening = new Date("2026-10-10T19:00:00Z");
    const first = await recordSnapshot(shop, morning);
    assert.ok(first);
    assert.equal(first.active, 3);
    // Archive a product the same day: the day's reading is updated, not duplicated.
    const row = await db.catalogProduct.findFirstOrThrow({ where: { shop, title: "Basecamp Two Tent" } });
    await db.catalogProduct.update({ where: { id: row.id }, data: { deleted: true } });
    const second = await recordSnapshot(shop, evening);
    assert.equal(second?.active, 2);
    assert.equal(await db.readinessSnapshot.count({ where: { shop } }), 1);
    await recordSnapshot(shop, new Date("2026-10-11T09:00:00Z"));
    const trend = await readinessTrend(shop, 90, new Date("2026-10-11T12:00:00Z"));
    assert.deepEqual(trend.map((p) => p.day), ["2026-10-10", "2026-10-11"]);
    assert.equal(trend[0].active, 2);
  } finally {
    await db.store.deleteMany({ where: { shop } });
  }
});

test("the trend window excludes old readings, and stores without active products record nothing", async () => {
  const shop = await store();
  const empty = await store([demoProducts[3]]);
  try {
    await recordSnapshot(shop, new Date("2026-06-01T10:00:00Z"));
    await recordSnapshot(shop, new Date("2026-10-01T10:00:00Z"));
    const trend = await readinessTrend(shop, 30, new Date("2026-10-15T10:00:00Z"));
    assert.deepEqual(trend.map((p) => p.day), ["2026-10-01"]);
    assert.equal(await recordSnapshot(empty), null);
    assert.equal(await db.readinessSnapshot.count({ where: { shop: empty } }), 0);
  } finally {
    await db.store.deleteMany({ where: { shop: { in: [shop, empty] } } });
  }
  // Uninstall and shop redaction delete the store; its history goes with it.
  assert.equal(await db.readinessSnapshot.count({ where: { shop } }), 0);
});

test("a failure to record history never surfaces as an error", async () => {
  const shop = await store();
  const original = console.error;
  let logged = false;
  console.error = () => {
    logged = true;
  };
  try {
    // An invalid timestamp makes the write itself fail after the overview succeeds.
    assert.equal(await recordSnapshot(shop, new Date(Number.NaN)), null);
    assert.ok(logged, "the failure is logged for operators");
    assert.equal(await db.readinessSnapshot.count({ where: { shop } }), 0);
  } finally {
    console.error = original;
    await db.store.deleteMany({ where: { shop } });
  }
});
