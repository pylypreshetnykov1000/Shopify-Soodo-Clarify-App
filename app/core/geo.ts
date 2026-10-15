import { audit, plainText, type ProductData } from "./catalog";
import type { ProfileKey } from "./profiles";
import type { LiveCheck } from "./storefront";

export type CheckStatus = "pass" | "action" | "unknown";
export type Priority = "high" | "medium" | "low";
export type CheckGroup = "visibility" | "identity" | "content" | "offer";
export type Destination = "facts" | "shopify" | "scan" | "live" | "theme";
export type GeoCheck = {
  id: string;
  group: CheckGroup;
  label: string;
  status: CheckStatus;
  priority: Priority;
  evidence: string;
  action: string;
  destination: Destination;
};
export const GROUPS: Record<CheckGroup, { label: string; summary: string }> = {
  visibility: {
    label: "Visibility",
    summary: "Can search engines and AI assistants reach and index the page?",
  },
  identity: {
    label: "Product identity",
    summary: "Can the product be matched to the right category, brand and item?",
  },
  content: {
    label: "Content",
    summary: "Does the page answer the questions buyers ask?",
  },
  offer: {
    label: "Offer & trust",
    summary: "Are price, stock and social proof clear and consistent?",
  },
};
export const WEIGHT: Record<Priority, number> = { high: 3, medium: 2, low: 1 };
const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium: 1, low: 2 };

const normalized = (value: string) =>
  value.trim().replace(/\s+/g, " ").toLowerCase();

export function safePublicUrl(value?: string | null) {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}
const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/**
 * Evaluates imported Shopify data and, when available, the last live page
 * check. Priorities sort work; they are not measured ranking factors.
 */
export function auditGeo(
  product: ProductData,
  profile: ProfileKey = "outdoor",
  live: LiveCheck | null = null,
) {
  const report = audit(product, profile);
  const description = plainText(product.descriptionHtml);
  const visible = audit({ ...product, metafields: [] }, profile);
  const metadata = product.discovery;
  const commerce = product.commerce;
  const knownMetadata = metadata !== undefined;
  const knownCommerce = commerce !== undefined;
  const url = safePublicUrl(metadata?.onlineStoreUrl);
  const active = product.status === "ACTIVE";
  const answers = report.rules.map((rule) => {
    const fact = report.facts.find((f) => f.key === rule.key);
    const inDescription =
      !!fact &&
      visible.facts.some(
        (f) =>
          f.key === rule.key && normalized(f.value) === normalized(fact.value),
      );
    return {
      key: rule.key,
      label: rule.label,
      question: rule.question,
      value: fact?.value ?? null,
      source: fact?.source ?? null,
      status: report.conflicts.includes(rule.key)
        ? ("conflict" as const)
        : !fact
          ? ("missing" as const)
          : inDescription
            ? ("description" as const)
            : ("stored" as const),
    };
  });
  const descriptionAnswers = answers.filter(
    (a) => a.status === "description",
  ).length;
  const variants = commerce?.variants ?? [];
  const withBarcode = variants.filter((v) => v.barcodes.length > 0).length;
  const withSku = variants.filter((v) => v.sku?.trim()).length;
  const unpriced = variants.filter((v) => !(Number(v.price) > 0)).length;
  const available = variants.filter((v) => v.availableForSale).length;
  const sampled =
    commerce && commerce.variantsCount > variants.length
      ? ` (first ${variants.length} of ${commerce.variantsCount} variants checked)`
      : "";
  const categoryFields = product.metafields.filter(
    (f) => f.namespace === "shopify" && f.value.trim() && f.key !== "rating",
  );
  const rating = product.metafields.find(
    (f) => f.namespace === "reviews" && f.key === "rating",
  );
  const ratingCount = product.metafields.find(
    (f) => f.namespace === "reviews" && f.key === "rating_count",
  );
  const liveReady = live && !live.error && live.httpStatus === 200 && !live.passwordProtected;
  const blockedSearch = live?.crawlers.filter(
    (c) => c.purpose !== "training" && !c.allowed,
  );
  const scanStatus = (known: boolean, pass: boolean): CheckStatus =>
    !known ? "unknown" : pass ? "pass" : "action";

  const checks: GeoCheck[] = [
    // ---------------------------------------------------------- visibility
    {
      id: "publication",
      group: "visibility",
      label: "Product status",
      status: active ? "pass" : "action",
      priority: "high",
      evidence: `Shopify status: ${product.status.toLowerCase()}.`,
      action:
        "Set the product to Active when it is ready to sell. Products that are intentionally unpublished can stay as they are.",
      destination: "shopify",
    },
    {
      id: "storefront-url",
      group: "visibility",
      label: "Online Store page",
      status: scanStatus(knownMetadata, !!url),
      priority: "high",
      evidence: !knownMetadata
        ? "This product was imported before page data was collected."
        : url
          ? `Published at ${url}`
          : "Shopify did not return a public Online Store URL.",
      action: !knownMetadata
        ? "Scan the catalog to import page data."
        : "Make the product available on the Online Store sales channel.",
      destination: !knownMetadata ? "scan" : "shopify",
    },
    {
      id: "live-page",
      group: "visibility",
      label: "Live page can be indexed",
      status: !live
        ? "unknown"
        : liveReady && !live.noindex && live.canonicalMatches !== false
          ? "pass"
          : "action",
      priority: "high",
      evidence: !live
        ? url
          ? "The live page has not been checked yet."
          : "No public page to check."
        : live.error
          ? `The page could not be loaded: ${live.error}`
          : live.passwordProtected
            ? "The online store is password protected. Search engines and AI assistants see only the password page."
            : live.httpStatus !== 200
              ? `The page responded with HTTP ${live.httpStatus}.`
              : live.noindex
                ? "The page tells search engines not to index it (noindex)."
                : live.canonicalMatches === false
                  ? `The canonical link points to a different page: ${live.canonical}`
                  : `Loaded successfully${live.canonical ? " with a matching canonical link" : ""}. No noindex directive found.`,
      action: !live
        ? "Run a live page check."
        : live.passwordProtected
          ? "Remove the storefront password in Online Store > Preferences when you are ready to launch."
          : live.noindex
            ? "Remove the noindex tag from the theme or SEO app that adds it."
            : "Open the page in a browser and correct the theme or redirect settings, then check again.",
      destination: !live ? "live" : live.passwordProtected || live.noindex ? "theme" : "shopify",
    },
    {
      id: "ai-crawlers",
      group: "visibility",
      label: "Search and AI crawler access",
      status: !live ? "unknown" : blockedSearch!.length ? "action" : "pass",
      priority: "high",
      evidence: !live
        ? "robots.txt has not been checked yet."
        : !live.robotsFound
          ? "No robots.txt was found, so all crawlers are allowed by default."
          : blockedSearch!.length
            ? `robots.txt blocks ${blockedSearch!.map((c) => c.agent).join(", ")} from this page.`
            : "robots.txt allows the major search and AI assistant crawlers to reach this page.",
      action:
        "Edit robots.txt.liquid in your theme so search and assistant crawlers can reach product pages. Blocking training crawlers is a separate choice and does not affect this check.",
      destination: !live ? "live" : "theme",
    },
    {
      id: "structured-data",
      group: "visibility",
      label: "Product structured data",
      status: !liveReady
        ? "unknown"
        : live.structured &&
            live.structured.count === 1 &&
            !live.structured.invalidBlocks &&
            live.priceMatches !== false &&
            live.availabilityMatches !== false
          ? "pass"
          : "action",
      priority: "medium",
      evidence: !liveReady
        ? "Available after a successful live page check."
        : !live.structured
          ? "No Product JSON-LD was found on the page."
          : live.structured.invalidBlocks
            ? `${plural(live.structured.invalidBlocks, "JSON-LD block")} could not be parsed.`
            : live.structured.count > 1
              ? `${live.structured.count} separate Product blocks were found. Duplicate markup can send mixed signals.`
              : live.priceMatches === false
                ? `Structured price (${live.structured.prices.join(", ")}) does not match the Shopify variant prices.`
                : live.availabilityMatches === false
                  ? "Structured availability does not match Shopify stock status."
                  : `Product markup found${live.structured.hasGtin ? " with GTIN" : ""}${live.structured.brand ? `, brand ${live.structured.brand}` : ""}. Price and availability match Shopify.`,
      action:
        "Use your theme's built-in product structured data and remove duplicate markup from other apps or custom code. Do not add a second Product block.",
      destination: !liveReady ? "live" : "theme",
    },
    // ------------------------------------------------------------ identity
    {
      id: "category",
      group: "identity",
      label: "Shopify product category",
      status: scanStatus(knownCommerce, !!commerce?.category),
      priority: "high",
      evidence: !knownCommerce
        ? "Category data was not collected by the last scan."
        : commerce.category
          ? commerce.category.fullName
          : "No standard product category is set.",
      action: !knownCommerce
        ? "Scan the catalog to import categories."
        : "Choose the most specific category in Shopify. It feeds Shopify's catalog, Google Shopping and AI shopping agents, and unlocks category attributes.",
      destination: !knownCommerce ? "scan" : "shopify",
    },
    {
      id: "vendor",
      group: "identity",
      label: "Brand / vendor",
      status: scanStatus(knownMetadata, !!metadata?.vendor?.trim()),
      priority: "medium",
      evidence: !knownMetadata
        ? "Vendor was not collected by the last scan."
        : metadata.vendor?.trim()
          ? `Vendor: ${metadata.vendor.trim()}`
          : "The vendor field is empty.",
      action: !knownMetadata
        ? "Scan the catalog to import the vendor."
        : "Enter the brand in the Vendor field. Do not guess the manufacturer.",
      destination: !knownMetadata ? "scan" : "shopify",
    },
    {
      id: "gtin",
      group: "identity",
      label: "Barcodes (GTIN, UPC, EAN)",
      status: scanStatus(knownCommerce, variants.length > 0 && withBarcode === variants.length),
      priority: "medium",
      evidence: !knownCommerce
        ? "Variant data was not collected by the last scan."
        : `${withBarcode} of ${plural(variants.length, "variant")} have a barcode${sampled}.`,
      action: !knownCommerce
        ? "Scan the catalog to import variants."
        : "Add the manufacturer barcode to each variant. If the product is handmade or private label with no barcode, you can leave this.",
      destination: !knownCommerce ? "scan" : "shopify",
    },
    {
      id: "sku",
      group: "identity",
      label: "SKUs",
      status: scanStatus(knownCommerce, variants.length > 0 && withSku === variants.length),
      priority: "low",
      evidence: !knownCommerce
        ? "Variant data was not collected by the last scan."
        : `${withSku} of ${plural(variants.length, "variant")} have a SKU${sampled}.`,
      action: !knownCommerce
        ? "Scan the catalog to import variants."
        : "Give every variant a unique SKU so feeds and agents can tell variants apart.",
      destination: !knownCommerce ? "scan" : "shopify",
    },
    // ------------------------------------------------------------- content
    {
      id: "description",
      group: "content",
      label: "Product description",
      status: description.length >= 120 ? "pass" : "action",
      priority: "high",
      evidence: !description
        ? "There is no description text."
        : description.length < 120
          ? `The description is very short (${description.length} characters).`
          : `${description.split(/\s+/).length} words of description text.`,
      action:
        "Describe what the product is, who it is for and what makes it different, in plain factual language.",
      destination: "shopify",
    },
    {
      id: "conflicts",
      group: "content",
      label: "Consistent specifications",
      status: report.conflicts.length ? "action" : "pass",
      priority: "high",
      evidence: report.conflicts.length
        ? `Conflicting values for ${report.conflicts
            .map((key) => report.rules.find((r) => r.key === key)?.label ?? key)
            .join(", ")}.`
        : "No conflicting values were found.",
      action:
        "Correct the conflicting values in Shopify, then scan again. Drafting is blocked until they agree.",
      destination: "shopify",
    },
    {
      id: "visible-facts",
      group: "content",
      label: "Specifications in description",
      status: descriptionAnswers === report.rules.length ? "pass" : "action",
      priority: "medium",
      evidence: `${descriptionAnswers} of ${report.rules.length} key buyer answers are written in the description.`,
      action:
        "Add verified specifications. Soodo writes them as a clear list in the description after you approve it.",
      destination: "facts",
    },
    {
      id: "category-attributes",
      group: "content",
      label: "Category attributes",
      status: !knownCommerce
        ? "unknown"
        : !commerce.category
          ? "action"
          : categoryFields.length
            ? "pass"
            : "action",
      priority: "medium",
      evidence: !knownCommerce
        ? "Category data was not collected by the last scan."
        : !commerce.category
          ? "Set a category first. Attributes depend on it."
          : categoryFields.length
            ? categoryFields
                .slice(0, 4)
                .map((f) => `${f.key.replace(/-/g, " ")}: ${f.display || "set"}`)
                .join(" · ")
            : "No category attributes (such as color, material or size) are filled in.",
      action: !knownCommerce
        ? "Scan the catalog to import category attributes."
        : "Fill in the category attributes in the Category metafields section of the product.",
      destination: !knownCommerce ? "scan" : "shopify",
    },
    {
      id: "image",
      group: "content",
      label: "Product images",
      status: product.image?.url ? "pass" : "action",
      priority: "medium",
      evidence: product.image?.url
        ? commerce
          ? `${plural(commerce.mediaCount, "media item")}.`
          : "A featured image is set."
        : "No product image.",
      action: "Add clear product photos, including one on a plain background.",
      destination: "shopify",
    },
    {
      id: "image-alt",
      group: "content",
      label: "Image alt text",
      status: product.image?.altText?.trim() ? "pass" : "action",
      priority: "low",
      evidence: product.image?.altText?.trim()
        ? `"${product.image.altText.trim()}"`
        : product.image?.url
          ? "The featured image has no alt text."
          : "Add an image first.",
      action:
        "Describe what the image shows in a short sentence. Avoid keyword lists.",
      destination: "shopify",
    },
    {
      id: "search-preview",
      group: "content",
      label: "Search listing",
      status: scanStatus(
        knownMetadata,
        !!(metadata?.seoTitle?.trim() || product.title.trim()) &&
          !!(metadata?.seoDescription?.trim() || description) &&
          (metadata?.seoTitle?.trim().length ?? 0) <= 70,
      ),
      priority: "medium",
      evidence: !knownMetadata
        ? "SEO fields were not collected by the last scan."
        : (metadata.seoTitle?.trim().length ?? 0) > 70
          ? `The SEO title is ${metadata.seoTitle!.trim().length} characters and will likely be cut off.`
          : metadata.seoDescription?.trim()
            ? `Custom meta description: ${metadata.seoDescription.trim().length} characters.`
            : description
              ? "No custom meta description. The product description is used instead."
              : "No title or description text is available for the listing.",
      action: !knownMetadata
        ? "Scan the catalog to import SEO fields."
        : "Edit the search engine listing: a clear title under 70 characters and a factual one-sentence summary.",
      destination: !knownMetadata ? "scan" : "shopify",
    },
    // --------------------------------------------------------------- offer
    {
      id: "price",
      group: "offer",
      label: "Prices",
      status: scanStatus(knownCommerce, variants.length > 0 && unpriced === 0),
      priority: "high",
      evidence: !knownCommerce
        ? "Variant prices were not collected by the last scan."
        : unpriced
          ? `${plural(unpriced, "variant")} have no price.`
          : `All ${plural(variants.length, "variant")} have a price${sampled}.`,
      action: !knownCommerce
        ? "Scan the catalog to import prices."
        : "Set a price for every variant you sell.",
      destination: !knownCommerce ? "scan" : "shopify",
    },
    {
      id: "availability",
      group: "offer",
      label: "Availability",
      status: scanStatus(knownCommerce, !active || available > 0),
      priority: "medium",
      evidence: !knownCommerce
        ? "Stock status was not collected by the last scan."
        : `${available} of ${plural(variants.length, "variant")} available for sale.`,
      action: !knownCommerce
        ? "Scan the catalog to import stock status."
        : "Restock, or allow pre-orders. Shopping agents usually skip products that cannot be bought.",
      destination: !knownCommerce ? "scan" : "shopify",
    },
    {
      id: "reviews",
      group: "offer",
      label: "Ratings",
      status: rating ? "pass" : "action",
      priority: "low",
      evidence: rating
        ? `Rating data from your reviews app${ratingCount ? ` (${ratingCount.value} ratings)` : ""}.`
        : "No rating data in Shopify's standard reviews fields.",
      action:
        "Use a reviews app that writes to Shopify's standard rating fields, and ask recent buyers for reviews.",
      destination: "shopify",
    },
  ];
  const issues = checks
    .filter((c) => c.status !== "pass")
    .sort(
      (a, b) =>
        (a.status === "action" ? 0 : 1) - (b.status === "action" ? 0 : 1) ||
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
    );
  const checked = checks.filter((c) => c.status !== "unknown");
  const earned = checked
    .filter((c) => c.status === "pass")
    .reduce((sum, c) => sum + WEIGHT[c.priority], 0);
  const possible = checked.reduce((sum, c) => sum + WEIGHT[c.priority], 0);
  return {
    profile,
    checks,
    issues,
    answers,
    publicUrl: url,
    needsRescan: !knownMetadata || !knownCommerce,
    readiness: possible ? Math.round((earned / possible) * 100) : 0,
    passed: checks.filter((c) => c.status === "pass").length,
    actions: checks.filter((c) => c.status === "action").length,
    unknown: checks.filter((c) => c.status === "unknown").length,
  };
}

/* ------------------------------------------------------------ store level */

export type StoreProfile = {
  name: string;
  contactEmail: string | null;
  primaryDomain: string | null;
  policies: { type: string; title: string; url: string; filled: boolean }[] | null;
};
export type StoreCheck = {
  id: string;
  label: string;
  status: CheckStatus;
  evidence: string;
  action: string;
  url?: string | null;
};
export function storeSignals(
  profile: StoreProfile | null,
  live: LiveCheck | null,
): StoreCheck[] {
  const policy = (type: string) =>
    profile?.policies?.find((p) => p.type === type && p.filled);
  const policyCheck = (id: string, type: string, label: string, why: string): StoreCheck => {
    const found = policy(type);
    return {
      id,
      label,
      status: !profile?.policies ? "unknown" : found ? "pass" : "action",
      evidence: !profile
        ? "Store details are collected during the next scan."
        : !profile.policies
          ? "Policies could not be read. Approve the updated app permissions, then scan again."
          : found
            ? "Published."
            : "Not set up.",
      action: `Add it in Settings > Policies. ${why}`,
      url: found?.url ?? null,
    };
  };
  const searchBlocked = live?.crawlers.filter((c) => c.purpose === "search" && !c.allowed) ?? [];
  const trainingBlocked = live?.crawlers.filter((c) => c.purpose === "training" && !c.allowed) ?? [];
  return [
    {
      id: "storefront-open",
      label: "Storefront open to visitors",
      status: !live || live.error ? "unknown" : live.passwordProtected ? "action" : "pass",
      evidence: !live
        ? "Known after the first live page check."
        : live.error
          ? "The last live check could not reach the store."
          : live.passwordProtected
            ? "The store is password protected."
            : "Product pages are publicly reachable.",
      action: "Remove the storefront password when you are ready to launch.",
    },
    {
      id: "crawler-policy",
      label: "Search and AI crawlers",
      status: !live || !live.robotsFound && live.error ? "unknown" : searchBlocked.length ? "action" : "pass",
      evidence: !live
        ? "Known after the first live page check."
        : searchBlocked.length
          ? `Blocked: ${searchBlocked.map((c) => c.agent).join(", ")}.`
          : `Search and assistant crawlers allowed.${trainingBlocked.length ? ` Training crawlers blocked: ${trainingBlocked.map((c) => c.agent).join(", ")}.` : ""}`,
      action: "Allow search and assistant crawlers in robots.txt.liquid.",
    },
    policyCheck("refund-policy", "REFUND_POLICY", "Return and refund policy", "Shopping agents compare return terms."),
    policyCheck("shipping-policy", "SHIPPING_POLICY", "Shipping policy", "Delivery cost and time are common buyer questions."),
    {
      id: "contact",
      label: "Contact information",
      status: !profile ? "unknown" : policy("CONTACT_INFORMATION") || profile.contactEmail ? "pass" : "action",
      evidence: !profile
        ? "Store details are collected during the next scan."
        : policy("CONTACT_INFORMATION")
          ? "Contact information page published."
          : profile.contactEmail
            ? "A customer contact email is set."
            : "No public contact details found.",
      action: "Publish a contact information policy so buyers can verify the business.",
      url: policy("CONTACT_INFORMATION")?.url ?? null,
    },
    policyCheck("privacy-policy", "PRIVACY_POLICY", "Privacy policy", "It is a basic trust signal."),
  ];
}
