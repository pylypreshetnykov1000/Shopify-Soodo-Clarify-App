import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  evaluateLivePage,
  parseProductPage,
  parseRobots,
  robotsAllows,
  summarizeStructuredData,
  type FetchResult,
} from "../app/core/storefront";
import { profileForCategory, resolveProfile } from "../app/core/profiles";
import { audit } from "../app/core/catalog";
import { demoProducts } from "../app/core/demo";
import db from "../app/db.server";
import {
  checkLivePage,
  checkNextLivePages,
  isPublicAddress,
  publicFetcher,
  type StorefrontFetcher,
} from "../app/services/live.server";

test("robots.txt uses the most specific group and the longest matching rule", () => {
  const groups = parseRobots(`# Shopify default
User-agent: *
Disallow: /checkout
Disallow: /*?variant=*&
Allow: /checkout/thanks$

User-agent: GPTBot
User-agent: CCBot
Disallow: /

User-agent: PerplexityBot
Disallow: /products/
Allow: /products/tent
`);
  assert.equal(robotsAllows(groups, "Googlebot", "/products/tent"), true);
  assert.equal(robotsAllows(groups, "Googlebot", "/checkout/step"), false);
  assert.equal(robotsAllows(groups, "Googlebot", "/checkout/thanks"), true);
  assert.equal(robotsAllows(groups, "Googlebot", "/checkout/thanks/more"), false);
  assert.equal(robotsAllows(groups, "Googlebot", "/products/a?variant=1&x"), false);
  assert.equal(robotsAllows(groups, "GPTBot", "/products/tent"), false);
  assert.equal(robotsAllows(groups, "CCBot", "/"), false);
  assert.equal(robotsAllows(groups, "PerplexityBot", "/products/backpack"), false);
  // Equal-length allow and disallow: allow wins.
  assert.equal(robotsAllows(groups, "PerplexityBot", "/products/tent"), true);
  assert.equal(robotsAllows(parseRobots("User-agent: *\nDisallow:"), "Bingbot", "/x"), true);
  assert.equal(robotsAllows([], "Bingbot", "/x"), true);
});
test("structured data handles graphs, product groups, aggregate offers and invalid blocks", () => {
  const summary = summarizeStructuredData([
    JSON.stringify({
      "@context": "https://schema.org",
      "@graph": [
        { "@type": "Organization", name: "Shop" },
        {
          "@type": "ProductGroup",
          name: "Shell",
          brand: { "@type": "Brand", name: "Trail" },
          hasVariant: [
            { "@type": "Product", sku: "S", gtin13: "0840123400011", offers: { "@type": "Offer", price: "189.00", priceCurrency: "USD", availability: "https://schema.org/OutOfStock" } },
            { "@type": "Product", sku: "M", offers: { "@type": "Offer", price: 199, availability: "http://schema.org/InStock" } },
          ],
        },
      ],
    }),
    "{ not json",
  ])!;
  assert.equal(summary.count, 1);
  assert.equal(summary.invalidBlocks, 1);
  assert.equal(summary.brand, "Trail");
  assert.equal(summary.hasGtin, true);
  assert.deepEqual(summary.prices.sort(), [189, 199]);
  assert.equal(summary.inStock, true);
  const aggregate = summarizeStructuredData([
    JSON.stringify([{ "@type": ["Product"], name: "Tent", offers: { "@type": "AggregateOffer", lowPrice: "10", highPrice: "20" } }]),
  ])!;
  assert.deepEqual(aggregate.prices, [10, 20]);
  assert.equal(aggregate.inStock, null);
  assert.equal(summarizeStructuredData([JSON.stringify({ "@type": "WebSite" })]), null);
});
test("page parsing finds noindex, canonical, JSON-LD and password pages", () => {
  const page = parseProductPage(`<html><head>
    <meta name="robots" content="noindex, nofollow">
    <link rel="canonical" href="/products/a">
    <script type="application/ld+json">{"@type":"Product","name":"A"}</script>
  </head><body><p>Material: Nylon</p></body></html>`);
  assert.equal(page.noindex, true);
  assert.equal(page.canonical, "/products/a");
  assert.equal(page.jsonLd.length, 1);
  assert.equal(page.password, false);
  assert.equal(parseProductPage('<body class="template-password"><form action="/password"></form></body>').password, true);
});
test("live page evaluation compares the page with Shopify data", () => {
  const product = demoProducts[1];
  const url = product.discovery!.onlineStoreUrl!;
  const page = (body: string, finalUrl = url): FetchResult => ({ status: 200, finalUrl, headers: {}, body });
  const ld = (price: string) =>
    `<script type="application/ld+json">${JSON.stringify({ "@type": "Product", name: product.title, offers: { price, availability: "https://schema.org/InStock" } })}</script>`;
  const good = evaluateLivePage({
    product,
    url,
    page: page(`<link rel="canonical" href="${url}">${ld("129.00")}<p>Material: Ripstop nylon</p>`),
    robots: { status: 200, finalUrl: "", headers: {}, body: "User-agent: OAI-SearchBot\nDisallow: /products/" },
    visibleFacts: ["Ripstop nylon"],
  });
  assert.equal(good.canonicalMatches, true);
  assert.equal(good.priceMatches, true);
  assert.equal(good.availabilityMatches, true);
  assert.equal(good.specsVisible, true);
  assert.equal(good.crawlers.find((c) => c.agent === "OAI-SearchBot")?.allowed, false);
  assert.equal(good.crawlers.find((c) => c.agent === "Googlebot")?.allowed, true);
  const bad = evaluateLivePage({ product, url, page: page(ld("99.00")), robots: null, visibleFacts: ["Ripstop nylon"] });
  assert.equal(bad.priceMatches, false);
  assert.equal(bad.specsVisible, false);
  assert.equal(bad.robotsFound, false);
  const locked = evaluateLivePage({ product, url, page: page("<form action='/password'></form>", "https://trail-supply.example/password"), robots: null, visibleFacts: [] });
  assert.equal(locked.passwordProtected, true);
  assert.equal(locked.structured, null);
  const header = evaluateLivePage({ product, url, page: { ...page(ld("129.00")), headers: { "x-robots-tag": "noindex" } }, robots: null, visibleFacts: [] });
  assert.equal(header.noindex, true);
  assert.equal(evaluateLivePage({ product, url, page: { error: "Timed out" }, robots: null, visibleFacts: [] }).error, "Timed out");
});
test("checklist profiles follow the Shopify category, or the merchant's fixed choice", () => {
  assert.equal(profileForCategory("Sporting Goods > Outdoor Recreation > Camping & Hiking > Tents"), "outdoor");
  assert.equal(profileForCategory("Apparel & Accessories > Clothing > Outerwear"), "apparel");
  assert.equal(profileForCategory("Health & Beauty > Personal Care > Cosmetics"), "beauty");
  assert.equal(profileForCategory("Electronics > Audio"), "electronics");
  assert.equal(profileForCategory("Furniture > Chairs"), "home");
  assert.equal(profileForCategory("Food, Beverages & Tobacco > Beverages"), "food");
  assert.equal(profileForCategory("Toys & Games"), null);
  assert.equal(resolveProfile(null, "auto"), "general");
  assert.equal(resolveProfile({ fullName: "Electronics > Audio" }, "auto"), "electronics");
  assert.equal(resolveProfile({ fullName: "Electronics > Audio" }, "food"), "food");
  assert.equal(resolveProfile(null, "not-a-profile"), "general");
});
test("category metafields provide facts through their resolved display names", () => {
  const product = {
    ...demoProducts[3],
    metafields: [
      { namespace: "shopify", key: "color-pattern", value: '["gid://shopify/Metaobject/1"]', type: "list.metaobject_reference", display: "Black, Navy" },
      { namespace: "shopify", key: "fabric", value: '["gid://shopify/Metaobject/2"]', type: "list.metaobject_reference", display: null },
    ],
  };
  const report = audit(product, "apparel");
  assert.equal(report.facts.find((f) => f.key === "color")?.value, "Black, Navy");
  assert.match(report.facts.find((f) => f.key === "color")!.source, /Shopify category field/);
  // Unresolved references are never published as raw IDs.
  assert.ok(!report.facts.some((f) => f.key === "material"));
});
test("only public addresses and HTTPS on the standard port can be fetched", async () => {
  for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "not-an-ip"])
    assert.equal(isPublicAddress(address), false, address);
  for (const address of ["23.227.38.65", "2620:127:f00f::1"])
    assert.equal(isPublicAddress(address), true, address);
  assert.match(String((await publicFetcher("http://example.com/", "page") as { error: string }).error), /HTTPS/);
  assert.match(String((await publicFetcher("https://127.0.0.1/", "page") as { error: string }).error), /domain name/);
  assert.match(String((await publicFetcher("https://example.com:8443/", "page") as { error: string }).error), /port/);
});
test("live page checks run in batches, reuse robots.txt and stay within the shop", async () => {
  const shop = `live-${randomUUID()}.myshopify.com`;
  const otherShop = `live-${randomUUID()}.myshopify.com`;
  const calls: string[] = [];
  const fetcher: StorefrontFetcher = async (url, kind) => {
    calls.push(`${kind}:${url}`);
    return kind === "robots"
      ? { status: 404, finalUrl: url, headers: {}, body: "" }
      : { status: 200, finalUrl: url, headers: {}, body: '<script type="application/ld+json">{"@type":"Product","name":"x"}</script>' };
  };
  try {
    await db.store.create({ data: { shop, category: "outdoor" } });
    await db.store.create({ data: { shop: otherShop } });
    const rows = await Promise.all(
      demoProducts.map((p) => db.catalogProduct.create({ data: { shop, gid: p.id, title: p.title, payload: JSON.stringify(p) } })),
    );
    const first = await checkNextLivePages(shop, fetcher, 2);
    assert.deepEqual(first, { checked: 2, remaining: 1 });
    assert.equal(calls.filter((c) => c.startsWith("robots")).length, 1);
    const second = await checkNextLivePages(shop, fetcher, 2);
    assert.deepEqual(second, { checked: 1, remaining: 0 });
    // The draft product has no public page and is never fetched.
    assert.equal(calls.filter((c) => c.startsWith("page")).length, 3);
    assert.deepEqual(await checkNextLivePages(shop, fetcher, 2), { checked: 0, remaining: 0 });
    const stored = await db.catalogProduct.findUniqueOrThrow({ where: { id: rows[1].id } });
    assert.equal(JSON.parse(stored.liveCheck!).httpStatus, 200);
    await assert.rejects(checkLivePage(shop, rows[3].id, fetcher), /no public Online Store page/);
    await assert.rejects(checkLivePage(otherShop, rows[1].id, fetcher), /not found/);
    assert.match(await checkLivePage(shop, rows[1].id, fetcher), /moment ago/);
  } finally {
    await db.store.deleteMany({ where: { shop: { in: [shop, otherShop] } } });
  }
});
