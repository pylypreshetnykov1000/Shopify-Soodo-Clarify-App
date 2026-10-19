import type { Destination, Priority } from "./geo";

/**
 * Plain-language versions of each check, for people new to GEO. The detailed
 * views keep the precise names; the simple Overview speaks in outcomes.
 */
export const PLAIN: Record<string, string> = {
  publication: "Publish products that are ready to sell",
  "storefront-url": "Put products on your online store",
  "live-page": "Make product pages visible to Google and AI",
  "ai-crawlers": "Let AI assistants read your store",
  "structured-data": "Fix the hidden product details on your pages",
  category: "Choose a category for each product",
  vendor: "Add your brand name",
  gtin: "Add barcodes so products can be matched",
  sku: "Give each variant its own SKU",
  description: "Write a fuller product description",
  conflicts: "Fix product details that disagree",
  "visible-facts": "Add the details buyers ask about",
  "category-attributes": "Fill in color, material and size",
  image: "Add product photos",
  "image-alt": "Describe your product photos",
  "search-preview": "Improve how products look on Google",
  price: "Set a price for every variant",
  availability: "Restock or allow pre-orders",
  reviews: "Collect product ratings",
  "refund-policy": "Add a return policy",
  "shipping-policy": "Add a shipping policy",
  "privacy-policy": "Add a privacy policy",
  contact: "Add your contact details",
  "storefront-open": "Remove your store password",
  "crawler-policy": "Let AI assistants read your store",
};

export type NextAction = {
  id: string;
  title: string;
  detail: string;
  /** Where the button goes; or a job the page runs. */
  to?: string;
  run?: "scan" | "live";
  button: string;
  priority?: Priority;
};

type Input = {
  summary: { total: number; liveCheckable: number; liveChecked: number; needsRescan: number };
  syncStarted: string | null;
  fixPlan: {
    id: string;
    priority: Priority;
    why: string;
    destination: Destination;
    products: { recordId: string; title: string }[];
  }[];
  signals: { id: string; status: string; action: string }[];
  drafts: { recordId: string; title: string }[];
};

const productTab = (destination: Destination) =>
  destination === "facts" ? "#specs" : destination === "live" || destination === "theme" ? "#live" : "";

/** The few most useful things to do now, in the order the workflow expects. */
export function planActions(input: Input, limit = 3): NextAction[] {
  const { summary, fixPlan } = input;
  const actions: NextAction[] = [];
  if (!summary.total || input.syncStarted)
    actions.push({
      id: "scan",
      title: summary.total ? "Finish importing your products" : "Import your products",
      detail: "Read-only. Soodo reads your products and store policies; nothing in your store changes.",
      run: "scan",
      button: summary.total ? "Continue" : "Start",
    });
  else if (summary.needsRescan)
    actions.push({
      id: "scan",
      title: "Refresh your products",
      detail: "Some products were imported before the newest checks existed.",
      run: "scan",
      button: "Refresh",
    });
  if (summary.liveCheckable > summary.liveChecked)
    actions.push({
      id: "live",
      title: "Check how Google and AI see your pages",
      detail: `${summary.liveCheckable - summary.liveChecked} published page${summary.liveCheckable - summary.liveChecked === 1 ? "" : "s"} not checked yet.`,
      run: "live",
      button: "Check",
    });
  for (const draft of input.drafts.slice(0, 1))
    actions.push({
      id: `draft-${draft.recordId}`,
      title: `Approve the new description for ${draft.title}`,
      detail: "It’s ready to review. Nothing changes until you approve it.",
      to: `/app/products/${draft.recordId}#draft`,
      button: "Review",
    });
  for (const fix of fixPlan) {
    const count = fix.products.length;
    actions.push({
      id: fix.id,
      title: PLAIN[fix.id] ?? fix.id,
      detail: `${fix.why} ${count} product${count === 1 ? "" : "s"}.`,
      to: count === 1 ? `/app/products/${fix.products[0].recordId}${productTab(fix.destination)}` : `/app/fixes#${fix.id}`,
      button: count === 1 ? "Fix" : `Fix ${count}`,
      priority: fix.priority,
    });
  }
  for (const signal of input.signals.filter((s) => s.status === "action"))
    actions.push({
      id: signal.id,
      title: PLAIN[signal.id] ?? signal.id,
      detail: signal.action,
      to: "/app/fixes",
      button: "How",
      priority: "medium",
    });
  return actions.slice(0, limit);
}
