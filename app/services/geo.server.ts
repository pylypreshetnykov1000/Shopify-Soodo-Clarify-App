import db from "../db.server";
import { auditGeo } from "../core/geo";
import type { ProductData } from "../core/catalog";

export async function listGeoProducts(shop: string) {
  const rows = await db.catalogProduct.findMany({
    where: { shop, deleted: false },
    select: { id: true, payload: true },
  });
  return rows.map((row) => {
    const product = JSON.parse(row.payload) as ProductData;
    const report = auditGeo(product);
    return {
      recordId: row.id,
      title: product.title,
      status: product.status,
      actions: report.actions,
      unknown: report.unknown,
      passed: report.passed,
      total: report.checks.length,
      topIssue: report.issues[0] ?? null,
      needsRescan: report.needsRescan,
    };
  });
}

export async function getGeoProduct(shop: string, id: string) {
  const row = await db.catalogProduct.findFirst({
    where: { id, shop, deleted: false },
    select: { id: true, payload: true },
  });
  if (!row) throw new Response("Product not found", { status: 404 });
  const product = JSON.parse(row.payload) as ProductData;
  const numericId = /^gid:\/\/shopify\/Product\/(\d+)$/.exec(product.id)?.[1];
  const adminUrl =
    numericId && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)
      ? `https://${shop}/admin/products/${numericId}`
      : null;
  return {
    recordId: row.id,
    title: product.title,
    report: auditGeo(product),
    adminUrl,
  };
}
