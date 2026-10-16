import { createHash } from "node:crypto";
import { parseFragment, type DefaultTreeAdapterMap } from "parse5";
import { audit, escapeHtml, type Fact, type ProductData } from "../core/catalog";
import type { ProfileKey } from "../core/profiles";
import { sameHtml } from "../core/html";
export function fingerprint(product: ProductData) {
  return createHash("sha256").update(JSON.stringify({ id: product.id, title: product.title, descriptionHtml: product.descriptionHtml, productType: product.productType, status: product.status,
    metafields: [...product.metafields].map(({ namespace, key, value, type }) => ({ namespace, key, value, type })).sort((a, b) => `${a.namespace}.${a.key}`.localeCompare(`${b.namespace}.${b.key}`)) })).digest("hex");
}
function stripSpecifications(html: string) {
  const root = parseFragment(html, { sourceCodeLocationInfo: true });
  const ranges: { start: number; end: number }[] = [];
  function visit(node: DefaultTreeAdapterMap["node"]) {
    if ("tagName" in node && node.tagName === "div" && node.attrs.some(a => a.name === "data-soodo-specs" && a.value === "v1")) {
      const location = node.sourceCodeLocation;
      if (!location?.endTag) throw new Error("The existing specifications section has an incomplete HTML wrapper. Correct it in Shopify before replacing it.");
      ranges.push({ start: location.startOffset, end: location.endOffset });
      return;
    }
    if ("childNodes" in node) node.childNodes.forEach(visit);
  }
  root.childNodes.forEach(visit);
  for (const range of ranges.sort((a, b) => b.start - a.start)) html = html.slice(0, range.start) + html.slice(range.end);
  return html;
}
export function buildDraft(product: ProductData, input: Record<string, string>, profile: ProfileKey = "outdoor") {
  const result = audit(product, profile);
  if (result.conflicts.length) throw new Error("Conflicting specifications found. Correct the source product data in Shopify and sync again before drafting.");
  const facts: Fact[] = result.rules.flatMap(rule => {
    const source = result.facts.find(f => f.key === rule.key);
    const value = (input[rule.key] ?? source?.value ?? "").trim().replace(/\s+/g, " ");
    if (source && value !== source.value) throw new Error(`${rule.label} already has a source value. Correct it in Shopify before replacing it here.`);
    if (!value) return [];
    if (value.length > 500 || [...value].some(char => char.charCodeAt(0) < 32 && ![9, 10, 13].includes(char.charCodeAt(0)))) throw new Error(`${rule.label} must be plain text, at most 500 characters.`);
    return [{ key: rule.key, label: rule.label, value, source: source?.value === value ? source.source : "Merchant supplied and confirmed" }];
  });
  if (!facts.length) throw new Error("Add at least one verified specification before creating a draft.");
  const original = stripSpecifications(product.descriptionHtml);
  const block = `<div data-soodo-specs="v1"><h3>Product specifications</h3><ul>${facts.map(f => `<li><strong>${escapeHtml(f.label)}:</strong> ${escapeHtml(f.value)}</li>`).join("")}</ul></div>`;
  const afterHtml = `${original}${original && !original.endsWith("\n") ? "\n" : ""}${block}`;
  if (sameHtml(afterHtml, product.descriptionHtml)) throw new Error("These specifications are already published. No changes are needed.");
  return { facts, afterHtml, beforeHtml: product.descriptionHtml, fingerprint: fingerprint(product) };
}
