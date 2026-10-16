import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { context } from "../services/context.server";
import { checkNextLivePages } from "../services/live.server";
import { recordSnapshot } from "../services/snapshots.server";

export const loader = () => redirect("/app");

/** Checks a small batch of live product pages. The client continues until done. */
export async function action({ request }: ActionFunctionArgs) {
  const ctx = await context(request);
  try {
    const { checked, remaining } = await checkNextLivePages(ctx.shop, ctx.fetcher);
    if (checked && !remaining) await recordSnapshot(ctx.shop);
    return {
      ok: true,
      done: remaining === 0,
      checked,
      remaining,
      message:
        checked === 0
          ? "All live pages were checked in the last 10 minutes."
          : remaining === 0
            ? "Live page checks complete."
            : `Checked ${checked} pages.`,
    };
  } catch (error) {
    return {
      ok: false,
      done: true,
      checked: 0,
      remaining: 0,
      message: error instanceof Error ? error.message : "Live check failed. Please retry.",
    };
  }
}
