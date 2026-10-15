export type ProductData = {
  id: string;
  title: string;
  descriptionHtml: string;
  productType: string;
  status: string;
  updatedAt: string;
  image: { url: string; altText: string | null } | null;
  metafields: { namespace: string; key: string; value: string; type: string }[];
  discovery?: {
    vendor: string;
    onlineStoreUrl: string | null;
    seoTitle: string | null;
    seoDescription: string | null;
  };
};
export const RULES = [
  {
    key: "material",
    label: "Material",
    aliases: ["material", "materials", "fabric"],
    hint: "For example: 100% recycled nylon. Use the manufacturer's specification.",
  },
  {
    key: "weight",
    label: "Weight",
    aliases: ["weight", "product_weight", "packed_weight"],
    hint: "Include a unit and specify the size or variant when relevant.",
  },
  {
    key: "dimensions",
    label: "Dimensions / fit",
    aliases: ["dimensions", "size_guide", "fit", "packed_size"],
    hint: "Include units, or a useful fit description for apparel.",
  },
  {
    key: "use",
    label: "Intended use",
    aliases: ["intended_use", "best_for", "use_case", "recommended_use"],
    hint: "Describe the activity this product is designed for.",
  },
  {
    key: "care",
    label: "Care instructions",
    aliases: ["care", "care_instructions", "care_guide"],
    hint: "Use verified washing, cleaning, or storage instructions.",
  },
] as const;
export type Fact = {
  key: string;
  label: string;
  value: string;
  source: string;
};
function readableField(
  field: ProductData["metafields"][number],
): string | null {
  if (["single_line_text_field", "multi_line_text_field"].includes(field.type))
    return field.value.trim().replace(/\s+/g, " ");
  if (field.type === "list.single_line_text_field") {
    try {
      const list: unknown = JSON.parse(field.value);
      return Array.isArray(list) && list.every((v) => typeof v === "string")
        ? list.join(", ").trim().replace(/\s+/g, " ")
        : null;
    } catch {
      return null;
    }
  }
  // Unit-bearing and rich-text formats need explicit conversion; never publish
  // their raw JSON as a shopper-facing specification.
  return null;
}
export function plainText(html: string) {
  return decodeHTML(
    html
      .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "")
      .replace(/<\/(p|li|div|h[1-6]|tr)>|<br\s*\/?\s*>/gi, "\n")
      .replace(/<[^>]*>/g, " "),
  ).trim();
}
export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ]!,
  );
}
export function audit(product: ProductData) {
  const text = plainText(product.descriptionHtml);
  const facts: Fact[] = [];
  const conflicts: string[] = [];
  for (const rule of RULES) {
    const fields = product.metafields.filter(
      (f) =>
        rule.aliases.some((a) => a === f.key.toLowerCase()) && f.value.trim(),
    );
    const candidates: Fact[] = fields.flatMap((f) => {
      const value = readableField(f);
      return value
        ? [
            {
              key: rule.key,
              label: rule.label,
              value,
              source: `Metafield: ${f.namespace}.${f.key}`,
            },
          ]
        : [];
    });
    const labels = [
      rule.label,
      ...rule.aliases.map((a) => a.replace(/_/g, " ")),
    ].map((v) => v.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const matches = text.matchAll(
      new RegExp(
        `(?:^|\\n)[^\\S\\r\\n]*(?:${labels.join("|")})[^\\S\\r\\n]*:[^\\S\\r\\n]*([^\\n\\r]+)`,
        "gi",
      ),
    );
    for (const match of matches) {
      const value = match[1].trim().replace(/\s+/g, " ");
      if (value)
        candidates.push({
          key: rule.key,
          label: rule.label,
          value,
          source: "Product description (explicit label)",
        });
    }
    const distinct = new Set(
      candidates.map((c) => c.value.toLowerCase().replace(/\s+/g, " ")),
    );
    if (distinct.size > 1) conflicts.push(rule.key);
    else if (candidates[0]) facts.push(candidates[0]);
  }
  return {
    facts,
    conflicts,
    missing: RULES.filter((r) => !facts.some((f) => f.key === r.key)),
    score: Math.round((facts.length / RULES.length) * 100),
  };
}
import { decodeHTML } from "entities";
