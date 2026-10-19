import db from "../db.server";
import {
  DEMO_ORIGIN,
  DEMO_SHOP,
  demoOrders,
  demoProducts,
  demoRobots,
  demoStore,
} from "../core/demo";
import { escapeHtml, type ProductData } from "../core/catalog";
import type { CatalogAdapter } from "./shopify-catalog.server";
import type { StorefrontFetcher } from "./live.server";

export async function seedDemo() {
  // The demo store and its products are initialized together. Avoid five
  // unnecessary upserts on every catalog navigation and revalidation.
  if (await db.store.findUnique({ where: { shop: DEMO_SHOP } })) return;
  await db.store.upsert({
    where: { shop: DEMO_SHOP },
    create: {
      shop: DEMO_SHOP,
      // The demo is an outdoor retailer, so it uses one fixed checklist.
      category: "outdoor",
      syncedAt: new Date(),
      profile: JSON.stringify(demoStore),
      profileAt: new Date(),
      snapshots: { create: demoHistory() },
      products: {
        create: demoProducts.map((product) => ({
          gid: product.id,
          title: product.title,
          payload: JSON.stringify(product),
        })),
      },
    },
    update: {},
  });
}
// Older local demo databases predate some fields; a scan fills them in.
function withCurrentFields(product: ProductData): ProductData {
  const source = demoProducts.find((p) => p.id === product.id);
  return {
    ...product,
    image: product.image ?? source?.image ?? null,
    metafields: [
      ...product.metafields,
      ...(source?.metafields.filter(
        (f) =>
          f.namespace !== "custom" &&
          !product.metafields.some((m) => m.namespace === f.namespace && m.key === f.key),
      ) ?? []),
    ],
    discovery: product.discovery ?? source?.discovery,
    commerce: product.commerce ?? source?.commerce,
  };
}
async function demoRow(gid: string) {
  const record = await db.catalogProduct.findUnique({
    where: { shop_gid: { shop: DEMO_SHOP, gid } },
  });
  return record && !record.deleted ? record : null;
}
/**
 * Sample history for the demo's readiness trend: a few weeks of gradual
 * fixes. Real stores only ever show readings Soodo recorded.
 */
function demoHistory(now = new Date()) {
  const readings: [daysAgo: number, readiness: number, ready: number, fixes: number][] = [
    [27, 58, 0, 12], [25, 61, 0, 12], [22, 64, 0, 11], [19, 66, 0, 11], [16, 70, 0, 10],
    [13, 72, 0, 9], [10, 75, 0, 9], [7, 77, 0, 8], [4, 79, 0, 8], [2, 80, 0, 8],
  ];
  return readings.map(([daysAgo, readiness, ready, fixes]) => {
    const date = new Date(now.getTime() - daysAgo * 86_400_000);
    return { day: date.toISOString().slice(0, 10), createdAt: date, readiness, ready, active: 3, fixes };
  });
}
export function demoAdapter(): CatalogAdapter {
  return {
    async read(id) {
      const record = await demoRow(id);
      return record ? (JSON.parse(record.payload) as ProductData) : null;
    },
    async page() {
      await seedDemo();
      let rows = await db.catalogProduct.findMany({
        where: { shop: DEMO_SHOP, deleted: false },
      });
      // A demo store emptied for a first-run walkthrough gets its products back.
      if (!rows.length) {
        await db.catalogProduct.deleteMany({ where: { shop: DEMO_SHOP } });
        await db.catalogProduct.createMany({
          data: demoProducts.map((p) => ({ shop: DEMO_SHOP, gid: p.id, title: p.title, payload: JSON.stringify(p) })),
        });
        rows = await db.catalogProduct.findMany({ where: { shop: DEMO_SHOP, deleted: false } });
      }
      return {
        products: rows.map((row) =>
          withCurrentFields(JSON.parse(row.payload) as ProductData),
        ),
        cursor: null,
      };
    },
    async orders(since) {
      return { orders: demoOrders().filter((o) => o.createdAt.slice(0, 10) >= since), cursor: null };
    },
    async writeSeo(id, seo) {
      const row = await db.catalogProduct.findUniqueOrThrow({
        where: { shop_gid: { shop: DEMO_SHOP, gid: id } },
      });
      const product = JSON.parse(row.payload) as ProductData;
      product.discovery = {
        ...(product.discovery ?? { vendor: "", onlineStoreUrl: null, seoTitle: null, seoDescription: null }),
        seoTitle: seo.title,
        seoDescription: seo.description,
      };
      product.updatedAt = new Date().toISOString();
      await db.catalogProduct.update({ where: { id: row.id }, data: { payload: JSON.stringify(product) } });
    },
    async count() {
      return db.catalogProduct.count({ where: { shop: DEMO_SHOP, deleted: false } });
    },
    async store() {
      return demoStore;
    },
    async writeDescription(id, html) {
      const row = await db.catalogProduct.findUniqueOrThrow({
        where: { shop_gid: { shop: DEMO_SHOP, gid: id } },
      });
      const product = JSON.parse(row.payload) as ProductData;
      product.descriptionHtml = html;
      product.updatedAt = new Date().toISOString();
      await db.catalogProduct.update({
        where: { id: row.id },
        data: { payload: JSON.stringify(product) },
      });
    },
  };
}

/**
 * Renders demo product pages the way a typical Shopify theme would, from the
 * demo catalog. No network request is made.
 */
export const demoFetcher: StorefrontFetcher = async (url, kind) => {
  if (kind === "robots")
    return { status: 200, finalUrl: url, headers: {} as Record<string, string>, body: demoRobots };
  const rows = await db.catalogProduct.findMany({
    where: { shop: DEMO_SHOP, deleted: false },
    select: { payload: true },
  });
  const product = rows
    .map((row) => withCurrentFields(JSON.parse(row.payload) as ProductData))
    .find((p) => p.discovery?.onlineStoreUrl === url && p.status === "ACTIVE");
  if (!product)
    return { status: 404, finalUrl: url, headers: {} as Record<string, string>, body: "<h1>Page not found</h1>" };
  const variants = product.commerce?.variants ?? [];
  const productLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.title,
    brand: { "@type": "Brand", name: product.discovery?.vendor },
    image: product.image ? [`${DEMO_ORIGIN}/cdn/${product.id.split("/").pop()}.jpg`] : undefined,
    offers: variants.map((v) => ({
      "@type": "Offer",
      sku: v.sku ?? undefined,
      gtin: v.barcodes[0],
      price: v.price,
      priceCurrency: "USD",
      availability: v.availableForSale
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
    })),
  };
  const blocks = [JSON.stringify(productLd)];
  // One demo product carries markup left behind by an old reviews app.
  if (product.title === "Basecamp Two Tent")
    blocks.push(JSON.stringify({ "@context": "https://schema.org", "@type": "Product", name: product.title }));
  const body = `<!doctype html><html><head><title>${escapeHtml(product.title)} – Trail Supply</title>
<link rel="canonical" href="${url}">
${blocks.map((b) => `<script type="application/ld+json">${b.replace(/</g, "\\u003c")}</script>`).join("\n")}
</head><body class="template-product"><main><h1>${escapeHtml(product.title)}</h1>
<div class="product__description">${product.descriptionHtml}</div></main></body></html>`;
  return { status: 200, finalUrl: url, headers: { "content-type": "text/html" }, body };
};
