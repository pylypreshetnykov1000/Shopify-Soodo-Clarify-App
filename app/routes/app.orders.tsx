import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { context } from "../services/context.server";
import { syncAiOrders } from "../services/orders.server";

export const loader = () => redirect("/app");

/** Reads a batch of recent orders; the client continues until done. */
export async function action({ request }: ActionFunctionArgs) {
  const ctx = await context(request);
  const form = await request.formData();
  try {
    const result = await syncAiOrders(ctx.shop, ctx.adapter, { restart: form.get("restart") === "true" });
    return {
      ok: true,
      done: result.done,
      message: result.done
        ? `Sales updated: ${result.scanned} order${result.scanned === 1 ? "" : "s"} checked.`
        : `Checked ${result.scanned} orders so far.`,
    };
  } catch (error) {
    return {
      ok: false,
      done: true,
      message: error instanceof Error ? error.message : "Sales could not be updated. Please retry.",
    };
  }
}
