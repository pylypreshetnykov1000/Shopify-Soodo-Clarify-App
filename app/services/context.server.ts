import { authenticate } from "../shopify.server";
import { demoAdapter, demoFetcher } from "./demo.server";
import { shopifyAdapter } from "./shopify-catalog.server";
import { publicFetcher } from "./live.server";
import { DEMO_SHOP } from "../core/demo";

/** Scopes the app's checks rely on beyond reading and writing products. */
export const OPTIONAL_SCOPES = {
  read_metaobjects: "category attribute values (color, material, size)",
  read_legal_policies: "refund, shipping, privacy and contact policies",
  read_orders: "sales from AI assistants",
} as const;
export const demoEnabled = () => process.env.DEMO_MODE === "true" && process.env.NODE_ENV !== "production";
export async function context(request: Request) {
  if (demoEnabled()) {
    const url = new URL(request.url);
    if (!new Set(["localhost", "127.0.0.1", "[::1]"]).has(url.hostname)) throw new Response("Demo is available on localhost only.", { status: 403 });
    if (request.method !== "GET" && request.method !== "HEAD" && request.headers.get("Origin") !== url.origin) throw new Response("Invalid request origin", { status: 403 });
    return { shop: DEMO_SHOP, adapter: demoAdapter(), fetcher: demoFetcher, demo: true, missingScopes: [] as string[] };
  }
  const { session, admin } = await authenticate.admin(request);
  // session.scope is what the merchant actually approved, which can lag the
  // app configuration until they approve updated permissions.
  const scopes = session.scope?.split(",").map((s) => s.trim()).filter(Boolean);
  const missingScopes = scopes
    ? Object.keys(OPTIONAL_SCOPES).filter((scope) => !scopes.includes(scope))
    : [];
  return {
    shop: session.shop,
    adapter: shopifyAdapter(admin, { scopes }),
    fetcher: publicFetcher,
    demo: false,
    missingScopes,
  };
}
