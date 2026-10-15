import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
export async function action({ request }: ActionFunctionArgs) {
  const { shop, payload, topic } = await authenticate.webhook(request);
  // Do not trust an out-of-order payload as the latest product. Invalidate and
  // read Shopify afresh before any draft/write; the next scan refreshes the UI.
  const gid = payload.admin_graphql_api_id ?? (payload.id ? `gid://shopify/Product/${payload.id}` : null);
  if (gid) {
    const product = await db.catalogProduct.findUnique({ where: { shop_gid: { shop, gid: String(gid) } } });
    if (product) {
      await db.suggestion.updateMany({ where: { productId: product.id, status: "DRAFT" }, data: { status: "STALE" } });
      if (topic === "PRODUCTS_DELETE") await db.catalogProduct.update({ where: { id: product.id }, data: { deleted: true } });
    }
  }
  await db.store.updateMany({ where: { shop }, data: { syncedAt: null } });
  return new Response(null, { status: 200 });
}
