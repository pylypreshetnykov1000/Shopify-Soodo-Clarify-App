import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import db from "../db.server";
import { context } from "../services/context.server";
import { syncPage } from "../services/catalog.server";

export const loader = () => redirect("/app");

/** Imports one batch. The scan control calls this repeatedly until done. */
export async function action({ request }: ActionFunctionArgs) {
  const ctx = await context(request);
  const form = await request.formData();
  try {
    const message = await syncPage(
      ctx.shop,
      ctx.adapter,
      form.get("restart") === "true",
    );
    const store = await db.store.findUniqueOrThrow({ where: { shop: ctx.shop } });
    const done = !store.syncStarted;
    const imported = await db.catalogProduct.count({
      where: done
        ? { shop: ctx.shop, deleted: false }
        : { shop: ctx.shop, scanRun: store.scanRun },
    });
    return {
      ok: true,
      done,
      imported,
      total: store.scanTotal,
      message: done
        ? `Scan complete. ${imported} product${imported === 1 ? "" : "s"} up to date.`
        : message,
    };
  } catch (error) {
    return {
      ok: false,
      done: true,
      imported: 0,
      total: null,
      message: error instanceof Error ? error.message : "Scan failed. Please retry.",
    };
  }
}
