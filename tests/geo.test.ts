import { test } from "node:test";
import assert from "node:assert/strict";
import { auditGeo, safePublicUrl } from "../app/core/geo";
import { demoProducts } from "../app/core/demo";
import { buildDraft } from "../app/services/drafts.server";
import db from "../app/db.server";
import { getGeoProduct, listGeoProducts } from "../app/services/geo.server";
import { randomUUID } from "node:crypto";

test("legacy product payloads require a rescan rather than guessing discovery data", () => {
  const product = { ...demoProducts[0], discovery: undefined };
  const report = auditGeo(product);
  assert.equal(report.needsRescan, true);
  for (const id of ["storefront-url", "vendor", "search-preview"])
    assert.equal(report.checks.find((c) => c.id === id)?.status, "unknown");
  assert.equal(
    report.passed + report.actions + report.unknown,
    report.checks.length,
  );
});
test("private metafield facts are not presented as visible description answers", () => {
  const report = auditGeo(demoProducts[0]);
  assert.equal(
    report.answers.find((a) => a.key === "material")?.status,
    "stored",
  );
  assert.equal(report.answers.find((a) => a.key === "care")?.value, null);
  assert.equal(report.answers.find((a) => a.key === "care")?.status, "missing");
  assert.match(
    report.checks.find((c) => c.id === "visible-facts")!.evidence,
    /^0 of 5/,
  );
});
test("published verified facts become description answers, with matching metafield values", () => {
  const product = demoProducts[0];
  const draft = buildDraft(product, {
    dimensions: "Regular fit",
    use: "Day hikes",
    care: "Hand wash",
  });
  const report = auditGeo({ ...product, descriptionHtml: draft.afterHtml });
  assert.equal(
    report.answers.filter((a) => a.status === "description").length,
    5,
  );
  assert.equal(
    report.checks.find((c) => c.id === "visible-facts")?.status,
    "pass",
  );
});
test("conflicting facts never produce a buyer answer", () => {
  const report = auditGeo({
    ...demoProducts[0],
    descriptionHtml: "<p>Material: Leather</p>",
  });
  assert.equal(
    report.answers.find((a) => a.key === "material")?.status,
    "conflict",
  );
  assert.equal(report.answers.find((a) => a.key === "material")?.value, null);
  assert.equal(
    report.checks.find((c) => c.id === "conflicts")?.priority,
    "high",
  );
  assert.equal(
    report.checks.find((c) => c.id === "conflicts")?.status,
    "action",
  );
});
test("missing custom SEO fields use available product content without a false failure", () => {
  const report = auditGeo(demoProducts[0]);
  assert.equal(
    report.checks.find((c) => c.id === "search-preview")?.status,
    "pass",
  );
  const empty = auditGeo({
    ...demoProducts[0],
    title: "",
    descriptionHtml: "",
  });
  assert.equal(
    empty.checks.find((c) => c.id === "search-preview")?.status,
    "action",
  );
});
test("publication and image checks show evidence without claiming crawlability", () => {
  const draft = auditGeo(demoProducts[3]);
  assert.equal(
    draft.checks.find((c) => c.id === "publication")?.status,
    "action",
  );
  assert.equal(
    draft.checks.find((c) => c.id === "storefront-url")?.status,
    "action",
  );
  const image = auditGeo({
    ...demoProducts[0],
    image: { url: "https://cdn.shopify.com/test.jpg", altText: "  " },
  });
  assert.equal(image.checks.find((c) => c.id === "image")?.status, "pass");
  assert.equal(
    image.checks.find((c) => c.id === "image-alt")?.status,
    "action",
  );
  assert.match(
    image.checks.find((c) => c.id === "storefront-url")!.evidence,
    /has not been tested/,
  );
});
test("public product links reject unsafe schemes and embedded credentials", () => {
  for (const url of [
    "javascript:alert(1)",
    "data:text/html,test",
    "http://example.com",
    "https://user:password@example.com",
    "not a URL",
  ])
    assert.equal(safePublicUrl(url), null);
  assert.equal(
    safePublicUrl("https://example.com/products/pack"),
    "https://example.com/products/pack",
  );
});
test("GEO reports and worklists are scoped to the authenticated shop", async () => {
  const shop = `geo-${randomUUID()}.myshopify.com`;
  const otherShop = `geo-${randomUUID()}.myshopify.com`;
  try {
    await db.store.create({ data: { shop } });
    await db.store.create({ data: { shop: otherShop } });
    const row = await db.catalogProduct.create({
      data: {
        shop,
        gid: demoProducts[0].id,
        title: demoProducts[0].title,
        payload: JSON.stringify(demoProducts[0]),
      },
    });
    assert.equal((await listGeoProducts(otherShop)).length, 0);
    await assert.rejects(
      getGeoProduct(otherShop, row.id),
      (error: unknown) => error instanceof Response && error.status === 404,
    );
    const own = await getGeoProduct(shop, row.id);
    assert.equal(own.report.answers[0].value, "100% recycled nylon");
    const list = await listGeoProducts(shop);
    assert.equal(list[0].title, demoProducts[0].title);
    assert.ok(!("payload" in list[0]));
    assert.ok(!("answers" in list[0]));
  } finally {
    await db.store.deleteMany({ where: { shop: { in: [shop, otherShop] } } });
  }
});
