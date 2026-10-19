import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import db from "../app/db.server";
import type { ProductData } from "../app/core/catalog";
import {
  catalogBrief,
  findStore,
  parseAnswer,
  roundPrice,
  storeIdentity,
  summarizeTest,
  templateQuestions,
} from "../app/core/visibility";
import { continueTest, startTest, visibilityHeadline, visibilitySummary } from "../app/services/visibility.server";
import { EngineError, type VisibilityEngine } from "../app/services/gemini.server";

function product(title: string, productType: string, price: string, overrides: Partial<ProductData> = {}): ProductData {
  return {
    id: `gid://shopify/Product/${randomUUID()}`,
    title,
    descriptionHtml: "",
    productType,
    status: "ACTIVE",
    updatedAt: "2026-10-01T00:00:00Z",
    image: null,
    metafields: [],
    discovery: { vendor: "Trail Supply", onlineStoreUrl: null, seoTitle: null, seoDescription: null },
    commerce: {
      category: null,
      variants: [
        { id: "v1", title: "Default", sku: null, barcodes: [], price, compareAtPrice: null, availableForSale: true },
      ],
      variantsCount: 1,
      mediaCount: 1,
    },
    ...overrides,
  };
}
const catalog = [
  product("Summit Shell Jacket", "Jacket", "189.00"),
  product("Ridge Rain Jacket", "Jacket", "129.00"),
  product("Trail 28 Backpack", "Backpack", "129.00"),
  product("Old Tent", "Tent", "99.00", { status: "DRAFT" }),
];
const identity = storeIdentity(
  "trail-supply.myshopify.com",
  { name: "Trail Supply", contactEmail: null, primaryDomain: "https://www.trailsupply.com", policies: null },
  catalog,
);

test("buyer questions cover every product type and never name the store", () => {
  const brief = catalogBrief(catalog, "USD");
  assert.deepEqual(
    brief.topics.map((t) => [t.name, t.products, t.maxPrice]),
    [
      ["Jacket", 2, 189],
      ["Backpack", 1, 129],
    ],
  );
  const questions = templateQuestions(brief, 6);
  assert.equal(questions.length, 6);
  assert.deepEqual(questions.slice(0, 2).map((q) => q.topic), ["Jacket", "Backpack"]);
  assert.ok(questions.some((q) => q.prompt === "What is the best jacket under $200?"));
  assert.ok(questions.every((q) => !/trail supply/i.test(q.prompt)));
  assert.equal(roundPrice(189), 200);
  assert.equal(roundPrice(1240), 1300);
  assert.equal(roundPrice(42), 50);
});

test("an answer is split into text, recommended brands and cited sites", () => {
  const parsed = parseAnswer(
    "Try the **Patagonia Torrentshell** ([REI](https://www.rei.com/product/1)).\nMore at https://outdoorgearlab.com/x.\n\n---\nBRANDS: Patagonia; REI Co-op; none",
    ["switchbacktravel.com", "not a host"],
  );
  assert.equal(parsed.text, "Try the **Patagonia Torrentshell** ([REI](https://www.rei.com/product/1)).\nMore at https://outdoorgearlab.com/x.");
  assert.deepEqual(parsed.brands, ["Patagonia", "REI Co-op"]);
  assert.deepEqual(parsed.sources, ["switchbacktravel.com", "rei.com", "outdoorgearlab.com"]);
  assert.deepEqual(parseAnswer("No brands line here.").brands, []);
});

test("the store counts as recommended when named, and as cited when only its site is used", () => {
  assert.deepEqual(identity.domains, ["trail-supply.myshopify.com", "trailsupply.com"]);
  // One-word titles would match every answer, so they are not used.
  assert.deepEqual(identity.products, ["Summit Shell Jacket", "Ridge Rain Jacket", "Trail 28 Backpack"]);
  const named = findStore(parseAnswer("The Summit Shell Jacket is great.\nBRANDS: Trail Supply"), identity);
  assert.deepEqual(named, { appearance: "recommended", products: ["Summit Shell Jacket"] });
  assert.equal(findStore(parseAnswer("Buy it from trail supply."), identity).appearance, "recommended");
  assert.equal(findStore(parseAnswer("See https://shop.trailsupply.com/specs."), identity).appearance, "recommended");
  assert.equal(findStore(parseAnswer("Patagonia is best.", ["trailsupply.com"]), identity).appearance, "cited");
  // A name inside another word is not a mention.
  assert.equal(findStore(parseAnswer("Mytrail suppliers are fine."), identity).appearance, "absent");
});

test("a test's score, competitors and sources", () => {
  const summary = summarizeTest(
    [
      { prompt: "a", appearance: "recommended", brands: ["Trail Supply", "Patagonia"], sources: ["rei.com"] },
      { prompt: "b", appearance: "cited", brands: ["Patagonia", "Patagonia"], sources: ["trailsupply.com", "rei.com"] },
      { prompt: "c", appearance: "absent", brands: ["Arc'teryx"], sources: [] },
      { prompt: "d", appearance: "absent", brands: ["Patagonia"], sources: ["reddit.com"] },
      { prompt: "failed", appearance: null, brands: [], sources: [] },
    ],
    { ...identity, vendors: ["Trail Supply", "Arc'teryx"] },
  );
  assert.equal(summary.score, 50);
  assert.equal(summary.answered, 4);
  assert.deepEqual(summary.competitors, [
    { name: "Patagonia", count: 3, youSell: false },
    { name: "Arc'teryx", count: 1, youSell: true },
  ]);
  assert.deepEqual(summary.sources[0], { host: "rei.com", count: 2, yours: false });
  assert.ok(summary.sources.some((s) => s.host === "trailsupply.com" && s.yours));
});

async function seedStore() {
  const shop = `visibility-${randomUUID()}.myshopify.com`;
  await db.store.create({
    data: {
      shop,
      profile: JSON.stringify({ name: "Trail Supply", contactEmail: null, primaryDomain: null, policies: null }),
    },
  });
  for (const p of catalog)
    await db.catalogProduct.create({ data: { shop, gid: p.id, title: p.title, payload: JSON.stringify(p) } });
  return shop;
}
function engine(answer: (prompt: string) => Promise<string>): VisibilityEngine & { asked: string[] } {
  const asked: string[] = [];
  return {
    assistant: "Gemini",
    model: "test",
    asked,
    async questions(brief, count) {
      return templateQuestions(brief, Math.min(count, 5));
    },
    async ask(prompt) {
      asked.push(prompt);
      return { raw: await answer(prompt), citedHosts: [] };
    },
  };
}

test("a test asks every question in batches, then scores the store", async () => {
  const shop = await seedStore();
  const gemini = engine(async (prompt) =>
    /backpack/i.test(prompt) ? "Get the Trail 28 Backpack.\nBRANDS: Trail Supply" : "Patagonia.\nBRANDS: Patagonia",
  );
  const empty = await visibilitySummary(shop, true);
  assert.equal(empty.latest, null);
  assert.equal(empty.due, true);
  await startTest(shop, gemini);
  // Starting again continues the same test instead of a second one.
  await startTest(shop, gemini);
  assert.equal(await db.visibilityTest.count({ where: { shop } }), 1);
  const first = await continueTest(shop, gemini);
  assert.deepEqual([first.done, first.answered, first.total], [false, 3, 5]);
  const progress = await visibilitySummary(shop, true);
  assert.deepEqual(progress.running, { answered: 3, total: 5 });
  const second = await continueTest(shop, gemini);
  assert.equal(second.done, true);
  assert.equal(gemini.asked.length, 5);
  const summary = await visibilitySummary(shop, true);
  assert.equal(summary.running, null);
  assert.equal(summary.latest?.answered, 5);
  const backpack = summary.latest!.questions.filter((q) => /backpack/i.test(q.prompt)).length;
  assert.equal(summary.latest?.recommended, backpack);
  assert.equal(summary.latest?.score, Math.round((backpack / 5) * 100));
  assert.equal(summary.latest?.competitors[0].name, "Patagonia");
  assert.deepEqual(summary.history.map((h) => h.score), [summary.latest!.score]);
  const headline = await visibilityHeadline(shop);
  assert.deepEqual([headline?.answered, headline?.appeared], [5, backpack]);
  // Nothing left to ask.
  assert.equal((await continueTest(shop, gemini)).done, true);
});

test("a test stops when every answer in a batch fails, and says why", async () => {
  const shop = await seedStore();
  const broken = engine(async () => {
    throw new EngineError("Gemini's usage limit was reached.");
  });
  await startTest(shop, broken);
  await assert.rejects(continueTest(shop, broken), /usage limit/);
  assert.equal(broken.asked.length, 3);
  const summary = await visibilitySummary(shop, true);
  assert.equal(summary.latest, null);
  assert.match(summary.failed?.error ?? "", /usage limit/);
  // A single failed question is recorded, and the rest still count.
  let calls = 0;
  const flaky = engine(async () => {
    calls++;
    if (calls === 1) throw new Error("socket hang up");
    return "Patagonia.\nBRANDS: Patagonia";
  });
  await startTest(shop, flaky);
  while (!(await continueTest(shop, flaky)).done);
  const after = await visibilitySummary(shop, true);
  assert.equal(after.failed, null);
  assert.equal(after.latest?.answered, 4);
  assert.equal(after.latest?.questions.filter((q) => q.status === "FAILED").length, 1);
});

test("a second tab cannot ask the same questions while a batch is running", async () => {
  const shop = await seedStore();
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  const slow = engine(async () => {
    await gate;
    return "BRANDS: Patagonia";
  });
  await startTest(shop, slow);
  const running = continueTest(shop, slow);
  await new Promise((r) => setTimeout(r, 50));
  await assert.rejects(continueTest(shop, slow), /already running/);
  release();
  await running;
});

test("a store with no active products cannot be tested", async () => {
  const shop = `visibility-${randomUUID()}.myshopify.com`;
  await db.store.create({ data: { shop } });
  await assert.rejects(startTest(shop, engine(async () => "")), /Import your active products/);
});
