import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import db from "../app/db.server";
import { demoProducts } from "../app/core/demo";
import { audit, type ProductData } from "../app/core/catalog";
import { fitWords, LISTING_LIMITS, suggestListing, validateListing } from "../app/core/listing";
import { planActions } from "../app/core/actions";
import { buildDraft } from "../app/services/drafts.server";
import {
  createDraft,
  createListingDraft,
  publishDraft,
  restoreChange,
  syncPage,
} from "../app/services/catalog.server";
import type { CatalogAdapter } from "../app/services/shopify-catalog.server";

test("listing suggestions use the product's own data and respect the limits", () => {
  const tent = demoProducts[2];
  const suggestion = suggestListing(tent, audit(tent).facts);
  assert.equal(suggestion.title, "Basecamp Two Tent – Tents | Trail Supply");
  assert.ok(suggestion.description.length <= LISTING_LIMITS.idealDescription);
  assert.match(suggestion.description, /^A two-person, three-season tent/);
  // A short description is completed with verified facts, never invented text.
  const jacket = demoProducts[0];
  const jacketListing = suggestListing(jacket, audit(jacket).facts);
  assert.match(jacketListing.description, /Material: 100% recycled nylon\./);
  // Long titles drop the extras first and never end mid-word.
  const long: ProductData = { ...tent, title: "An exceptionally long product name for a tent that keeps going and going" };
  assert.ok(suggestListing(long, []).title.length <= LISTING_LIMITS.title);
  assert.equal(fitWords("one two three four", 9), "one two");
});

test("listings are validated before a draft is made", () => {
  assert.throws(() => validateListing({ title: "", description: "x" }), /title/);
  assert.throws(() => validateListing({ title: "x".repeat(71), description: "x" }), /70 characters/);
  assert.throws(() => validateListing({ title: "Tent", description: "x".repeat(321) }), /320/);
  assert.deepEqual(validateListing({ title: "  Tent  ", description: " A  tent. " }), { title: "Tent", description: "A tent." });
});

test("the buyer Q&A answers each question only with verified facts", () => {
  const draft = buildDraft(demoProducts[0], { care: "Hand wash" }, "outdoor", { faq: true });
  assert.match(draft.afterHtml, /<h3>Common questions<\/h3>/);
  assert.match(draft.afterHtml, /<strong>How should it be cared for\?<\/strong><br>Hand wash/);
  // Unknown facts get no question at all.
  assert.ok(!draft.afterHtml.includes("What are its dimensions or fit?"));
  // The Q&A doesn't create conflicting facts when the description is read back.
  assert.equal(audit({ ...demoProducts[0], descriptionHtml: draft.afterHtml }).conflicts.length, 0);
  assert.ok(!buildDraft(demoProducts[0], { care: "Hand wash" }).afterHtml.includes("Common questions"));
});

test("a search listing is drafted, published, verified and restored like a description", async () => {
  const shop = `listing-${randomUUID()}.myshopify.com`;
  let product: ProductData = structuredClone(demoProducts[1]);
  let seoWrites = 0;
  const adapter: CatalogAdapter = {
    async read() {
      return structuredClone(product);
    },
    async writeDescription(_id, html) {
      product = { ...product, descriptionHtml: html };
    },
    async writeSeo(_id, seo) {
      seoWrites++;
      product = { ...product, discovery: { ...product.discovery!, seoTitle: seo.title, seoDescription: seo.description } };
    },
    async page() {
      return { products: [structuredClone(product)], cursor: null };
    },
  };
  try {
    await syncPage(shop, adapter, true);
    const row = await db.catalogProduct.findUniqueOrThrow({ where: { shop_gid: { shop, gid: product.id } } });
    // Description and listing drafts live side by side.
    const description = await createDraft(shop, row.id, adapter, { care: "Spot clean" });
    const listing = await createListingDraft(shop, row.id, adapter, { title: "Trail 28 Daypack | Trail Supply", description: "A 28 litre daypack for day hikes." });
    assert.equal((await db.suggestion.findUniqueOrThrow({ where: { id: description.id } })).status, "DRAFT");
    assert.match(await publishDraft(shop, listing.id, adapter), /Search listing published and verified/);
    assert.equal(product.discovery?.seoTitle, "Trail 28 Daypack | Trail Supply");
    assert.equal(seoWrites, 1);
    // Publishing the same listing again is refused before anything is written.
    await assert.rejects(
      createListingDraft(shop, row.id, adapter, { title: "Trail 28 Daypack | Trail Supply", description: "A 28 litre daypack for day hikes." }),
      /already live/,
    );
    const change = await db.change.findFirstOrThrow({ where: { suggestionId: listing.id } });
    assert.equal(change.kind, "seo");
    assert.match(await restoreChange(shop, change.id, adapter), /Previous search listing restored/);
    // An empty listing means "no custom listing": Google falls back to the product.
    assert.equal(product.discovery?.seoTitle ?? "", "");
    // A listing edited in Shopify after drafting makes the draft stale.
    const stale = await createListingDraft(shop, row.id, adapter, { title: "New title", description: "New description." });
    product = { ...product, discovery: { ...product.discovery!, seoTitle: "Edited in Shopify" } };
    await assert.rejects(publishDraft(shop, stale.id, adapter), /changed since this draft/);
  } finally {
    await db.store.deleteMany({ where: { shop } });
  }
});

test("next steps speak plainly and follow the workflow", () => {
  const base = {
    summary: { total: 4, liveCheckable: 3, liveChecked: 0, needsRescan: 0 },
    syncStarted: null,
    fixPlan: [
      { id: "category", priority: "high" as const, why: "Why.", destination: "shopify" as const, products: [{ recordId: "a", title: "A" }] },
      { id: "visible-facts", priority: "medium" as const, why: "Why.", destination: "facts" as const, products: [{ recordId: "a", title: "A" }, { recordId: "b", title: "B" }] },
    ],
    signals: [{ id: "shipping-policy", status: "action", action: "Add it." }],
    drafts: [],
  };
  const actions = planActions(base);
  assert.deepEqual(actions.map((a) => a.id), ["live", "category", "visible-facts"]);
  assert.equal(actions[1].title, "Choose a category for each product");
  assert.equal(actions[1].to, "/app/products/a");
  assert.equal(actions[2].to, "/app/fixes#visible-facts");
  assert.equal(actions[2].button, "Fix 2");
  assert.equal(planActions({ ...base, summary: { ...base.summary, total: 0 } })[0].run, "scan");
  assert.equal(planActions({ ...base, drafts: [{ recordId: "b", title: "B" }] })[1].to, "/app/products/b#draft");
});
