import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { auditGeo, safePublicUrl, storeSignals } from "../app/core/geo";
import { demoProducts, demoStore } from "../app/core/demo";
import type { ProductData } from "../app/core/catalog";
import { CRAWLERS, type LiveCheck } from "../app/core/storefront";
import { buildDraft } from "../app/services/drafts.server";
import db from "../app/db.server";
import { catalogOverview, productWorkspace } from "../app/services/geo.server";

const status = (report: ReturnType<typeof auditGeo>, id: string) =>
  report.checks.find((c) => c.id === id)?.status;
const live = (overrides: Partial<LiveCheck> = {}): LiveCheck => ({
  checkedAt: "2026-10-16T00:00:00.000Z",
  url: "https://trail-supply.example/products/trail-28-backpack",
  finalUrl: "https://trail-supply.example/products/trail-28-backpack",
  httpStatus: 200,
  error: null,
  passwordProtected: false,
  noindex: false,
  canonical: "https://trail-supply.example/products/trail-28-backpack",
  canonicalMatches: true,
  robotsFound: true,
  crawlers: CRAWLERS.map((c) => ({ ...c, allowed: true })),
  structured: {
    count: 1,
    invalidBlocks: 0,
    name: "Trail 28 Backpack",
    brand: "Trail Supply",
    hasGtin: true,
    hasSku: true,
    hasImage: true,
    hasRating: false,
    prices: [129],
    currencies: ["USD"],
    inStock: true,
  },
  priceMatches: true,
  availabilityMatches: true,
  specsVisible: true,
  ...overrides,
});

test("legacy payloads mark newer checks as not checked instead of guessing", () => {
  const product: ProductData = { ...demoProducts[0], discovery: undefined, commerce: undefined };
  const report = auditGeo(product);
  assert.equal(report.needsRescan, true);
  for (const id of ["storefront-url", "vendor", "search-preview", "category", "gtin", "sku", "price", "availability", "category-attributes"])
    assert.equal(status(report, id), "unknown", id);
  for (const id of ["live-page", "ai-crawlers", "structured-data"])
    assert.equal(status(report, id), "unknown", id);
  assert.equal(report.passed + report.actions + report.unknown, report.checks.length);
});
test("metafield-only facts are stored, not presented as description answers", () => {
  const report = auditGeo(demoProducts[0]);
  assert.equal(report.answers.find((a) => a.key === "material")?.status, "stored");
  assert.equal(report.answers.find((a) => a.key === "care")?.value, null);
  assert.equal(report.answers.find((a) => a.key === "care")?.status, "missing");
  assert.match(report.checks.find((c) => c.id === "visible-facts")!.evidence, /^0 of 5/);
});
test("published verified facts become description answers", () => {
  const product = demoProducts[0];
  const draft = buildDraft(product, { dimensions: "Regular fit", use: "Day hikes", care: "Hand wash" });
  const report = auditGeo({ ...product, descriptionHtml: draft.afterHtml });
  assert.equal(report.answers.filter((a) => a.status === "description").length, 5);
  assert.equal(status(report, "visible-facts"), "pass");
});
test("conflicting facts never produce a buyer answer", () => {
  const report = auditGeo({ ...demoProducts[0], descriptionHtml: "<p>Material: Leather</p>" });
  assert.equal(report.answers.find((a) => a.key === "material")?.status, "conflict");
  assert.equal(report.answers.find((a) => a.key === "material")?.value, null);
  assert.equal(report.checks.find((c) => c.id === "conflicts")?.priority, "high");
  assert.equal(status(report, "conflicts"), "action");
});
test("search listing uses product content as a fallback and flags long SEO titles", () => {
  assert.equal(status(auditGeo(demoProducts[0]), "search-preview"), "pass");
  assert.equal(status(auditGeo({ ...demoProducts[0], title: "", descriptionHtml: "" }), "search-preview"), "action");
  const long = { ...demoProducts[0], discovery: { ...demoProducts[0].discovery!, seoTitle: "x".repeat(80) } };
  assert.equal(status(auditGeo(long), "search-preview"), "action");
});
test("identity checks read category, category attributes, barcodes and SKUs", () => {
  const jacket = auditGeo(demoProducts[0]);
  assert.equal(status(jacket, "category"), "action");
  assert.equal(status(jacket, "category-attributes"), "action");
  assert.equal(status(jacket, "gtin"), "action");
  assert.match(jacket.checks.find((c) => c.id === "gtin")!.evidence, /^1 of 3 variants/);
  assert.equal(status(jacket, "sku"), "pass");
  const tent = auditGeo(demoProducts[2]);
  assert.equal(status(tent, "category"), "pass");
  assert.equal(status(tent, "category-attributes"), "pass");
  assert.match(tent.checks.find((c) => c.id === "category-attributes")!.evidence, /color pattern: Green/);
  assert.equal(status(tent, "reviews"), "pass");
  assert.equal(status(jacket, "reviews"), "action");
});
test("offer checks require prices and a buyable variant on active products only", () => {
  const product = demoProducts[1];
  const soldOut: ProductData = {
    ...product,
    commerce: { ...product.commerce!, variants: product.commerce!.variants.map((v) => ({ ...v, availableForSale: false, price: "0.00" })) },
  };
  assert.equal(status(auditGeo(soldOut), "availability"), "action");
  assert.equal(status(auditGeo(soldOut), "price"), "action");
  assert.equal(status(auditGeo({ ...soldOut, status: "DRAFT" }), "availability"), "pass");
  assert.equal(status(auditGeo(demoProducts[3]), "publication"), "action");
  assert.equal(status(auditGeo(demoProducts[3]), "storefront-url"), "action");
});
test("live checks drive visibility and structured-data results", () => {
  const product = demoProducts[1];
  assert.equal(status(auditGeo(product, "outdoor", live()), "live-page"), "pass");
  assert.equal(status(auditGeo(product, "outdoor", live()), "ai-crawlers"), "pass");
  assert.equal(status(auditGeo(product, "outdoor", live()), "structured-data"), "pass");
  assert.equal(status(auditGeo(product, "outdoor", live({ noindex: true })), "live-page"), "action");
  assert.equal(status(auditGeo(product, "outdoor", live({ canonicalMatches: false })), "live-page"), "action");
  const blocked = live({ crawlers: CRAWLERS.map((c) => ({ ...c, allowed: c.agent !== "OAI-SearchBot" })) });
  assert.equal(status(auditGeo(product, "outdoor", blocked), "ai-crawlers"), "action");
  // Blocking only training crawlers is a merchant choice, not a visibility problem.
  const training = live({ crawlers: CRAWLERS.map((c) => ({ ...c, allowed: c.purpose !== "training" })) });
  assert.equal(status(auditGeo(product, "outdoor", training), "ai-crawlers"), "pass");
  assert.equal(status(auditGeo(product, "outdoor", live({ priceMatches: false })), "structured-data"), "action");
  assert.equal(status(auditGeo(product, "outdoor", live({ structured: null })), "structured-data"), "action");
  const password = auditGeo(product, "outdoor", live({ passwordProtected: true, structured: null }));
  assert.equal(status(password, "live-page"), "action");
  assert.equal(status(password, "structured-data"), "unknown");
});
test("readiness weights priorities and excludes checks that could not run", () => {
  const product = demoProducts[1];
  const unchecked = auditGeo(product);
  const checked = auditGeo(product, "outdoor", live());
  assert.ok(unchecked.unknown >= 3);
  assert.ok(checked.readiness >= 0 && checked.readiness <= 100);
  const ready: ProductData = {
    ...demoProducts[2],
    metafields: [...demoProducts[2].metafields],
  };
  const perfect = auditGeo(ready, "outdoor", live({ structured: { ...live().structured!, prices: [349] } }));
  const failing = perfect.checks.filter((c) => c.status !== "pass").map((c) => c.id);
  assert.deepEqual(failing, [], `Unexpected failures: ${failing.join(", ")}`);
  assert.equal(perfect.readiness, 100);
});
test("public product links reject unsafe schemes and embedded credentials", () => {
  for (const url of ["javascript:alert(1)", "data:text/html,test", "http://example.com", "https://user:password@example.com", "not a URL"])
    assert.equal(safePublicUrl(url), null);
  assert.equal(safePublicUrl("https://example.com/products/pack"), "https://example.com/products/pack");
});
test("store signals report policies, contact and crawler access", () => {
  const signals = storeSignals(demoStore, live());
  const by = (id: string) => signals.find((s) => s.id === id)?.status;
  assert.equal(by("refund-policy"), "pass");
  assert.equal(by("shipping-policy"), "action");
  assert.equal(by("contact"), "pass");
  assert.equal(by("storefront-open"), "pass");
  assert.equal(by("crawler-policy"), "pass");
  const unreadable = storeSignals({ ...demoStore, policies: null }, null);
  assert.equal(unreadable.find((s) => s.id === "refund-policy")?.status, "unknown");
  assert.equal(unreadable.find((s) => s.id === "storefront-open")?.status, "unknown");
  assert.equal(storeSignals(demoStore, live({ passwordProtected: true }))[0].status, "action");
});
test("overview, fix plan and workspace are scoped to the authenticated shop", async () => {
  const shop = `geo-${randomUUID()}.myshopify.com`;
  const otherShop = `geo-${randomUUID()}.myshopify.com`;
  try {
    await db.store.create({ data: { shop, category: "outdoor" } });
    await db.store.create({ data: { shop: otherShop } });
    const rows = await Promise.all(
      demoProducts.map((product) =>
        db.catalogProduct.create({
          data: { shop, gid: product.id, title: product.title, payload: JSON.stringify(product) },
        }),
      ),
    );
    assert.equal((await catalogOverview(otherShop)).products.length, 0);
    await assert.rejects(
      productWorkspace(otherShop, rows[0].id),
      (error: unknown) => error instanceof Response && error.status === 404,
    );
    const own = await productWorkspace(shop, rows[0].id);
    assert.equal(own.report.answers[0].value, "100% recycled nylon");
    assert.equal(own.profile.key, "outdoor");
    const overview = await catalogOverview(shop);
    assert.equal(overview.products.length, 4);
    assert.ok(!("payload" in overview.products[0]));
    assert.ok(!("answers" in overview.products[0]));
    assert.equal(overview.summary.active, 3);
    // Inactive products never appear in the fix plan.
    const fleece = rows[3].id;
    assert.ok(overview.fixPlan.every((fix) => fix.products.every((p) => p.recordId !== fleece)));
    const gtin = overview.fixPlan.find((fix) => fix.id === "gtin");
    assert.deepEqual(gtin?.products.map((p) => p.title), ["Summit Shell Jacket"]);
    // Ranked by priority weight × active products affected.
    const impact = overview.fixPlan.map(
      (fix) => ({ high: 3, medium: 2, low: 1 })[fix.priority] * fix.products.length,
    );
    assert.deepEqual(impact, [...impact].sort((a, b) => b - a));
  } finally {
    await db.store.deleteMany({ where: { shop: { in: [shop, otherShop] } } });
  }
});
test("automatic checklists follow each product's category", async () => {
  const shop = `geo-${randomUUID()}.myshopify.com`;
  try {
    await db.store.create({ data: { shop } });
    const fleece = demoProducts[3];
    const row = await db.catalogProduct.create({
      data: { shop, gid: fleece.id, title: fleece.title, payload: JSON.stringify(fleece) },
    });
    const workspace = await productWorkspace(shop, row.id);
    assert.equal(workspace.profile.key, "apparel");
    assert.ok(workspace.specs.rules.some((r) => r.key === "color"));
    await db.store.update({ where: { shop }, data: { category: "electronics" } });
    assert.equal((await productWorkspace(shop, row.id)).profile.key, "electronics");
  } finally {
    await db.store.deleteMany({ where: { shop } });
  }
});
