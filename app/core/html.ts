import { parseFragment, type DefaultTreeAdapterMap } from "parse5";

type Node = DefaultTreeAdapterMap["node"];

/**
 * A canonical form of an HTML fragment for comparing what Shopify stored with
 * what Soodo sent. Shopify may re-serialize descriptions: attribute quoting and
 * order, entity encoding (&#39; vs '), and whitespace between tags can change
 * without changing the content. Text and structure must still match exactly.
 */
export function canonicalHtml(html: string): string {
  const out: string[] = [];
  const visit = (node: Node) => {
    if (node.nodeName === "#text") {
      const text = (node as DefaultTreeAdapterMap["textNode"]).value.replace(/\s+/g, " ");
      if (text.trim()) out.push(`"${text.trim()}"`);
      return;
    }
    if (node.nodeName === "#comment") return;
    if ("tagName" in node) {
      const element = node as DefaultTreeAdapterMap["element"];
      const attrs = [...element.attrs]
        .map((a) => `${a.name}=${a.value.replace(/\s+/g, " ").trim()}`)
        .sort()
        .join(" ");
      out.push(`<${element.tagName}${attrs ? ` ${attrs}` : ""}>`);
      element.childNodes.forEach(visit);
      out.push(`</${element.tagName}>`);
      return;
    }
    if ("childNodes" in node) node.childNodes.forEach(visit);
  };
  visit(parseFragment(html));
  return out.join("");
}

export const sameHtml = (a: string, b: string) => a === b || canonicalHtml(a) === canonicalHtml(b);
