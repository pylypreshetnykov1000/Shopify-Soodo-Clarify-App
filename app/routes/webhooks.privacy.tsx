import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { redactOrders } from "../services/orders.server";
export async function action({ request }: ActionFunctionArgs) {
  const { shop, topic, payload } = await authenticate.webhook(request);
  if (topic === "SHOP_REDACT") await db.$transaction([
    db.store.deleteMany({ where: { shop } }), db.session.deleteMany({ where: { shop } }),
  ]);
  // Soodo stores no customer details. AI-referred orders keep only the order
  // number, amount and source; a customer redaction removes those orders too.
  if (topic === "CUSTOMERS_REDACT") {
    const orders = (payload as { orders_to_redact?: (string | number)[] }).orders_to_redact ?? [];
    await redactOrders(shop, orders);
  }
  // customers/data_request: nothing is held per customer, so there is nothing to return.
  return new Response(null, { status: 200 });
}
