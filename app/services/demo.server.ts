import db from "../db.server";
import { DEMO_SHOP, demoProducts } from "../core/demo";
import type { ProductData } from "../core/catalog";
import type { CatalogAdapter } from "./shopify-catalog.server";

export async function seedDemo() {
  await db.store.upsert({ where: { shop: DEMO_SHOP }, create: { shop: DEMO_SHOP, syncedAt: new Date() }, update: {} });
  for (const product of demoProducts) await db.catalogProduct.upsert({ where: { shop_gid: { shop: DEMO_SHOP, gid: product.id } }, create: { shop: DEMO_SHOP, gid: product.id, title: product.title, payload: JSON.stringify(product) }, update: {} });
}
export function demoAdapter(): CatalogAdapter {
  return {
    async read(id) {
      const record = await db.catalogProduct.findUnique({ where: { shop_gid: { shop: DEMO_SHOP, gid: id } } });
      return record && !record.deleted ? JSON.parse(record.payload) as ProductData : null;
    },
    async page() {
      await seedDemo();
      const rows = await db.catalogProduct.findMany({ where: { shop: DEMO_SHOP, deleted: false } });
      return { products: rows.map(row => JSON.parse(row.payload) as ProductData), cursor: null };
    },
    async writeDescription(id, html) {
      const row = await db.catalogProduct.findUniqueOrThrow({ where: { shop_gid: { shop: DEMO_SHOP, gid: id } } });
      const product = JSON.parse(row.payload) as ProductData;
      product.descriptionHtml = html;
      product.updatedAt = new Date().toISOString();
      await db.catalogProduct.update({ where: { id: row.id }, data: { payload: JSON.stringify(product) } });
    },
  };
}
