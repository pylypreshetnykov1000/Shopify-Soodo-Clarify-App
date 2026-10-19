import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import db from "../db.server";
import { context } from "../services/context.server";
import { ensureStore } from "../services/catalog.server";

export const loader = () => redirect("/app");

/** Remembers whether the Overview shows the simple or the detailed view. */
export async function action({ request }: ActionFunctionArgs) {
  const { shop } = await context(request);
  const form = await request.formData();
  await ensureStore(shop);
  const detailed = form.get("view") === "detailed";
  await db.store.update({ where: { shop }, data: { detailed } });
  return { ok: true, detailed };
}
