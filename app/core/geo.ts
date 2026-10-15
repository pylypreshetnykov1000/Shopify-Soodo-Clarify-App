import { audit, plainText, RULES, type ProductData } from "./catalog";

export type GeoCheck = {
  id: string;
  label: string;
  status: "pass" | "action" | "unknown";
  priority: "high" | "medium" | "low";
  evidence: string;
  action: string;
  destination: "facts" | "shopify" | "scan";
};
const QUESTIONS: Record<string, string> = {
  material: "What is it made from?",
  weight: "How much does it weigh?",
  dimensions: "What are its dimensions or fit?",
  use: "What is it designed for?",
  care: "How should it be cared for?",
};
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

/** Checks imported product evidence. This is not a crawler, schema validator, or ranking model. */
export function auditGeo(product: ProductData) {
  const report = audit(product);
  const description = plainText(product.descriptionHtml);
  const visible = audit({ ...product, metafields: [] });
  const metadata = product.discovery;
  const knownMetadata = metadata !== undefined;
  const url = safePublicUrl(metadata?.onlineStoreUrl);
  const answers = RULES.map((rule) => {
    const fact = report.facts.find((f) => f.key === rule.key);
    const inDescription =
      !!fact &&
      visible.facts.some(
        (f) =>
          f.key === rule.key && normalized(f.value) === normalized(fact.value),
      );
    return {
      key: rule.key,
      question: QUESTIONS[rule.key],
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
  const checks: GeoCheck[] = [
    {
      id: "publication",
      label: "Product status",
      status: product.status === "ACTIVE" ? "pass" : "action",
      priority: "high",
      evidence: `Shopify status: ${product.status.toLowerCase()}.`,
      action:
        "Activate and publish only when this product is ready for customers. Intentionally unpublished products can stay as they are.",
      destination: "shopify",
    },
    {
      id: "storefront-url",
      label: "Online Store URL",
      status: !knownMetadata ? "unknown" : url ? "pass" : "action",
      priority: "high",
      evidence: !knownMetadata
        ? "This scan predates the discovery fields."
        : url
          ? "Shopify reports an HTTPS Online Store URL. Live accessibility has not been tested."
          : "Shopify did not return a usable HTTPS Online Store URL.",
      action: !knownMetadata
        ? "Scan the catalog to import discovery fields."
        : "Check Online Store publication and preview the public product page in Shopify.",
      destination: !knownMetadata ? "scan" : "shopify",
    },
    {
      id: "description",
      label: "Product description",
      status: description ? "pass" : "action",
      priority: "high",
      evidence: description
        ? "Product description contains text."
        : "No description text was found.",
      action:
        "Add a factual description of the product, its purpose, and distinguishing details in Shopify.",
      destination: "shopify",
    },
    {
      id: "conflicts",
      label: "Consistent specifications",
      status: report.conflicts.length ? "action" : "pass",
      priority: "high",
      evidence: report.conflicts.length
        ? `Conflicting values: ${report.conflicts.join(", ")}.`
        : "No conflicts were found among the recognized checklist fields.",
      action:
        "Correct conflicting values in Shopify, then scan again. Drafting is blocked until the conflict is resolved.",
      destination: "shopify",
    },
    {
      id: "visible-facts",
      label: "Specifications in description",
      status: descriptionAnswers === RULES.length ? "pass" : "action",
      priority: "medium",
      evidence: `${descriptionAnswers} of ${RULES.length} outdoor checklist answers have a consistent, explicit value in the description.`,
      action:
        "Add only verified missing facts, review the description draft, and approve it before publishing. Unknown facts should stay empty.",
      destination: "facts",
    },
    {
      id: "vendor",
      label: "Vendor information",
      status: !knownMetadata
        ? "unknown"
        : metadata.vendor?.trim()
          ? "pass"
          : "action",
      priority: "medium",
      evidence: !knownMetadata
        ? "Vendor was not collected by this scan."
        : metadata.vendor?.trim()
          ? `Shopify vendor: ${metadata.vendor.trim()}.`
          : "The vendor field is empty.",
      action: !knownMetadata
        ? "Scan the catalog to import the vendor field."
        : "Add the correct vendor in Shopify. Do not assume the vendor is the manufacturer or brand.",
      destination: !knownMetadata ? "scan" : "shopify",
    },
    {
      id: "product-type",
      label: "Product type",
      status: product.productType.trim() ? "pass" : "action",
      priority: "low",
      evidence: product.productType.trim()
        ? `Product type: ${product.productType}.`
        : "The product type is empty.",
      action:
        "Choose an accurate product type in Shopify to help organize the catalog. This field is separate from Shopify's standard product category.",
      destination: "shopify",
    },
    {
      id: "image",
      label: "Featured image",
      status: product.image?.url ? "pass" : "action",
      priority: "medium",
      evidence: product.image?.url
        ? "A featured image is available in the imported data."
        : "No featured image was returned.",
      action: "Add a representative product image in Shopify.",
      destination: "shopify",
    },
    {
      id: "image-alt",
      label: "Featured image description",
      status: product.image?.altText?.trim() ? "pass" : "action",
      priority: "low",
      evidence: product.image?.altText?.trim()
        ? "The featured image has alternative text."
        : product.image?.url
          ? "The featured image has no alternative text."
          : "Add an image before reviewing its alternative text.",
      action:
        "Write concise, accurate alternative text for the featured image in Shopify. Describe the image without adding unsupported claims.",
      destination: "shopify",
    },
    {
      id: "search-preview",
      label: "Search preview content",
      status: !knownMetadata
        ? "unknown"
        : (metadata.seoTitle?.trim() || product.title.trim()) &&
            (metadata.seoDescription?.trim() || description)
          ? "pass"
          : "action",
      priority: "medium",
      evidence: !knownMetadata
        ? "SEO metadata was not collected by this scan."
        : "Checks custom SEO text, with product title and description as content fallbacks. Theme output and search snippets have not been verified.",
      action: !knownMetadata
        ? "Scan the catalog to import SEO metadata."
        : "Review the search engine listing in Shopify. Use an accurate title and useful summary, without keyword stuffing.",
      destination: !knownMetadata ? "scan" : "shopify",
    },
  ];
  const priorities = { high: 0, medium: 1, low: 2 };
  const issues = checks
    .filter((c) => c.status !== "pass")
    .sort(
      (a, b) =>
        (a.status === "action" ? 0 : 1) - (b.status === "action" ? 0 : 1) ||
        priorities[a.priority] - priorities[b.priority],
    );
  return {
    checks,
    issues,
    answers,
    publicUrl: url,
    needsRescan: !knownMetadata,
    passed: checks.filter((c) => c.status === "pass").length,
    actions: checks.filter((c) => c.status === "action").length,
    unknown: checks.filter((c) => c.status === "unknown").length,
  };
}
