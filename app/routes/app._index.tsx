import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { useLoaderData } from "react-router";
import { context } from "../services/context.server";
import { ensureStore, listCatalog, syncPage } from "../services/catalog.server";
import { seedDemo } from "../services/demo.server";
import { CatalogView } from "../ui/catalog-view";
export async function loader({ request }: LoaderFunctionArgs) {
  const ctx = await context(request);
  if (ctx.demo) await seedDemo();
  const store = await ensureStore(ctx.shop);
  return { products: await listCatalog(ctx.shop), store, demo: ctx.demo };
}
export async function action({ request }: ActionFunctionArgs) {
  const ctx = await context(request);
  const form = await request.formData();
  try {
    if (form.get("intent") !== "sync") throw new Error("Unknown action.");
    return { ok: true, message: await syncPage(ctx.shop, ctx.adapter, form.get("restart") === "true") };
  } catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Scan failed. Please retry." }; }
}
export default function Overview() { return <CatalogView data={useLoaderData<typeof loader>()} overview />; }
