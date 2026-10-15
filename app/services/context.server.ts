import { authenticate } from "../shopify.server";
import { demoAdapter } from "./demo.server";
import { shopifyAdapter } from "./shopify-catalog.server";
import { DEMO_SHOP } from "../core/demo";

export const demoEnabled = () => process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production";
export async function context(request: Request) {
  if (demoEnabled()) {
    const url = new URL(request.url);
    if (!new Set(["localhost", "127.0.0.1", "[::1]"]).has(url.hostname)) throw new Response("Demo is available on localhost only.", { status: 403 });
    if (request.method !== "GET" && request.method !== "HEAD" && request.headers.get("Origin") !== url.origin) throw new Response("Invalid request origin", { status: 403 });
    return { shop: DEMO_SHOP, adapter: demoAdapter(), demo: true };
  }
  const { session, admin } = await authenticate.admin(request);
  return { shop: session.shop, adapter: shopifyAdapter(admin), demo: false };
}
