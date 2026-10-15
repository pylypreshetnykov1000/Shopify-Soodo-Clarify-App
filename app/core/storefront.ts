import { parse, type DefaultTreeAdapterMap } from "parse5";
import { plainText, type ProductData } from "./catalog";

type Node = DefaultTreeAdapterMap["node"];
type Element = DefaultTreeAdapterMap["element"];

export const CRAWLERS = [
  { agent: "Googlebot", owner: "Google Search and AI Overviews", purpose: "search" },
  { agent: "Bingbot", owner: "Bing and Microsoft Copilot", purpose: "search" },
  { agent: "OAI-SearchBot", owner: "ChatGPT search", purpose: "search" },
  { agent: "PerplexityBot", owner: "Perplexity", purpose: "search" },
  { agent: "Claude-SearchBot", owner: "Claude search", purpose: "search" },
  { agent: "Applebot", owner: "Apple Siri and Spotlight", purpose: "search" },
  { agent: "ChatGPT-User", owner: "ChatGPT visits on a user's request", purpose: "assistant" },
  { agent: "GPTBot", owner: "OpenAI model training", purpose: "training" },
  { agent: "Google-Extended", owner: "Google Gemini training", purpose: "training" },
  { agent: "ClaudeBot", owner: "Anthropic model training", purpose: "training" },
  { agent: "CCBot", owner: "Common Crawl datasets", purpose: "training" },
] as const;

export type CrawlerAccess = {
  agent: string;
  owner: string;
  purpose: "search" | "assistant" | "training";
  allowed: boolean;
};
export type StructuredSummary = {
  count: number;
  invalidBlocks: number;
  name: string | null;
  brand: string | null;
  hasGtin: boolean;
  hasSku: boolean;
  hasImage: boolean;
  hasRating: boolean;
  prices: number[];
  currencies: string[];
  inStock: boolean | null;
};
export type LiveCheck = {
  checkedAt: string;
  url: string;
  finalUrl: string | null;
  httpStatus: number | null;
  error: string | null;
  passwordProtected: boolean;
  noindex: boolean;
  canonical: string | null;
  canonicalMatches: boolean | null;
  robotsFound: boolean;
  crawlers: CrawlerAccess[];
  structured: StructuredSummary | null;
  priceMatches: boolean | null;
  availabilityMatches: boolean | null;
  specsVisible: boolean | null;
};
export type FetchResult = {
  status: number;
  finalUrl: string;
  headers: Record<string, string>;
  body: string;
};

/* ---------------------------------------------------------------- robots */

type RobotsGroup = { agents: string[]; rules: { allow: boolean; path: string }[] };
export function parseRobots(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const match = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!match) continue;
    const field = match[1].toLowerCase();
    const value = match[2].trim();
    if (field === "user-agent") {
      if (!current || !lastWasAgent) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!current) continue;
    if (field === "allow" || field === "disallow")
      current.rules.push({ allow: field === "allow", path: value });
  }
  return groups;
}
function patternMatches(pattern: string, path: string) {
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const regex = new RegExp(
    "^" +
      body
        .split("*")
        .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
        .join(".*") +
      (anchored ? "$" : ""),
  );
  return regex.test(path);
}
/** RFC 9309: most specific user-agent group, then the longest matching rule. */
export function robotsAllows(groups: RobotsGroup[], agent: string, path: string) {
  const token = agent.toLowerCase();
  let best: RobotsGroup[] = [];
  let bestLength = -1;
  for (const group of groups)
    for (const ua of group.agents) {
      const length = ua === "*" ? 0 : token.includes(ua) ? ua.length : -1;
      if (length > bestLength) {
        best = [group];
        bestLength = length;
      } else if (length === bestLength && length >= 0 && !best.includes(group))
        best.push(group);
    }
  if (bestLength < 0) return true;
  let verdict = { allow: true, length: -1 };
  for (const rule of best.flatMap((g) => g.rules)) {
    if (!rule.path) continue; // An empty Disallow allows everything.
    if (!patternMatches(rule.path, path)) continue;
    const length = rule.path.length;
    if (length > verdict.length || (length === verdict.length && rule.allow))
      verdict = { allow: rule.allow, length };
  }
  return verdict.allow;
}

/* ------------------------------------------------------------------ page */

function attr(node: Element, name: string) {
  return node.attrs.find((a) => a.name === name)?.value ?? null;
}
function textOf(node: Node): string {
  if (node.nodeName === "#text") return (node as DefaultTreeAdapterMap["textNode"]).value;
  return "childNodes" in node ? node.childNodes.map(textOf).join("") : "";
}
type Json = unknown;
function typeIncludes(node: Record<string, Json>, type: string) {
  const value = node["@type"];
  return Array.isArray(value) ? value.includes(type) : value === type;
}
function flatten(value: Json, out: Record<string, Json>[]) {
  if (Array.isArray(value)) value.forEach((v) => flatten(v, out));
  else if (value && typeof value === "object") {
    const node = value as Record<string, Json>;
    out.push(node);
    if (node["@graph"]) flatten(node["@graph"], out);
  }
}
const asArray = (value: Json): Json[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];
const str = (value: Json) =>
  typeof value === "string" ? value.trim() || null : typeof value === "number" ? String(value) : null;
const AVAILABLE = /(InStock|LimitedAvailability|OnlineOnly|PreOrder|PreSale|BackOrder)$/i;

export function summarizeStructuredData(blocks: string[]): StructuredSummary | null {
  const nodes: Record<string, Json>[] = [];
  let invalidBlocks = 0;
  for (const block of blocks) {
    try {
      flatten(JSON.parse(block), nodes);
    } catch {
      invalidBlocks++;
    }
  }
  const products = nodes.filter(
    (n) => typeIncludes(n, "Product") || typeIncludes(n, "ProductGroup"),
  );
  const top = products.filter((n) => !nodes.some((p) => asArray(p.hasVariant).includes(n)));
  if (!products.length)
    return invalidBlocks
      ? { count: 0, invalidBlocks, name: null, brand: null, hasGtin: false, hasSku: false, hasImage: false, hasRating: false, prices: [], currencies: [], inStock: null }
      : null;
  const all = products.flatMap((p) => [p, ...asArray(p.hasVariant).filter((v): v is Record<string, Json> => !!v && typeof v === "object")]);
  const offers = all.flatMap((p) => asArray(p.offers)).filter((o): o is Record<string, Json> => !!o && typeof o === "object");
  const prices = offers
    .flatMap((o) => [o.price, o.lowPrice, o.highPrice])
    .map(str)
    .filter((p): p is string => p !== null)
    .map(Number)
    .filter((p) => Number.isFinite(p));
  const availability = offers.map((o) => str(o.availability)).filter((a): a is string => !!a);
  const brand = top.map((p) => p.brand).find(Boolean);
  return {
    count: top.length,
    invalidBlocks,
    name: str(top[0]?.name),
    brand: str(brand) ?? (brand && typeof brand === "object" ? str((brand as Record<string, Json>).name) : null),
    hasGtin: all.some((p) => ["gtin", "gtin8", "gtin12", "gtin13", "gtin14", "isbn"].some((k) => str(p[k]))),
    hasSku: all.some((p) => str(p.sku)),
    hasImage: all.some((p) => asArray(p.image).length > 0),
    hasRating: all.some((p) => p.aggregateRating && typeof p.aggregateRating === "object"),
    prices: [...new Set(prices)],
    currencies: [...new Set(offers.map((o) => str(o.priceCurrency)).filter((c): c is string => !!c))],
    inStock: availability.length ? availability.some((a) => AVAILABLE.test(a)) : null,
  };
}

export function parseProductPage(html: string) {
  const document = parse(html);
  let noindex = false;
  let canonical: string | null = null;
  let password = false;
  const jsonLd: string[] = [];
  const visit = (node: Node) => {
    if ("tagName" in node) {
      const element = node as Element;
      if (element.tagName === "meta") {
        const name = attr(element, "name")?.toLowerCase();
        if ((name === "robots" || name === "googlebot") && /noindex|none/i.test(attr(element, "content") ?? ""))
          noindex = true;
      }
      if (element.tagName === "link" && /(^|\s)canonical(\s|$)/i.test(attr(element, "rel") ?? "") && !canonical)
        canonical = attr(element, "href");
      if (element.tagName === "script" && attr(element, "type")?.toLowerCase() === "application/ld+json")
        jsonLd.push(textOf(element));
      if (element.tagName === "form" && /\/password\/?$/.test(attr(element, "action") ?? ""))
        password = true;
      if (element.tagName === "body" && /template-password/.test(attr(element, "class") ?? ""))
        password = true;
    }
    if ("childNodes" in node) node.childNodes.forEach(visit);
  };
  visit(document);
  return { noindex, canonical, password, jsonLd, text: plainText(html) };
}

/* ------------------------------------------------------------ evaluation */

const comparable = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();

export function evaluateLivePage(input: {
  product: ProductData;
  url: string;
  page: FetchResult | { error: string };
  robots: FetchResult | { error: string } | null;
  visibleFacts: string[];
  checkedAt?: Date;
}): LiveCheck {
  const { product, url } = input;
  const path = new URL(url).pathname;
  const robotsText =
    input.robots && "body" in input.robots && input.robots.status === 200 ? input.robots.body : null;
  const groups = robotsText ? parseRobots(robotsText) : [];
  const crawlers: CrawlerAccess[] = CRAWLERS.map((c) => ({
    ...c,
    allowed: robotsAllows(groups, c.agent, path),
  }));
  const base: LiveCheck = {
    checkedAt: (input.checkedAt ?? new Date()).toISOString(),
    url,
    finalUrl: null,
    httpStatus: null,
    error: null,
    passwordProtected: false,
    noindex: false,
    canonical: null,
    canonicalMatches: null,
    robotsFound: robotsText !== null,
    crawlers,
    structured: null,
    priceMatches: null,
    availabilityMatches: null,
    specsVisible: null,
  };
  if ("error" in input.page) return { ...base, error: input.page.error };
  const page = input.page;
  const finalPath = (() => {
    try {
      return new URL(page.finalUrl).pathname;
    } catch {
      return "";
    }
  })();
  const parsed = parseProductPage(page.body);
  const passwordProtected = parsed.password || /^\/password\/?$/.test(finalPath);
  const headerNoindex = /noindex|none/i.test(page.headers["x-robots-tag"] ?? "");
  let canonicalMatches: boolean | null = null;
  if (parsed.canonical) {
    try {
      canonicalMatches = new URL(parsed.canonical, page.finalUrl).pathname.replace(/\/$/, "") === path.replace(/\/$/, "");
    } catch {
      canonicalMatches = false;
    }
  }
  const structured = summarizeStructuredData(parsed.jsonLd);
  const variants = product.commerce?.variants ?? [];
  const adminPrices = variants.map((v) => Number(v.price)).filter((p) => Number.isFinite(p));
  const priceMatches =
    structured && structured.prices.length && adminPrices.length
      ? structured.prices.every((p) => adminPrices.some((a) => Math.abs(a - p) < 0.005))
      : null;
  const availabilityMatches =
    structured && structured.inStock !== null && variants.length
      ? structured.inStock === variants.some((v) => v.availableForSale)
      : null;
  const pageText = comparable(parsed.text);
  const specsVisible = input.visibleFacts.length
    ? input.visibleFacts.every((value) => pageText.includes(comparable(value)))
    : null;
  return {
    ...base,
    finalUrl: page.finalUrl,
    httpStatus: page.status,
    passwordProtected,
    noindex: parsed.noindex || headerNoindex,
    canonical: parsed.canonical,
    canonicalMatches,
    structured: passwordProtected ? null : structured,
    priceMatches: passwordProtected ? null : priceMatches,
    availabilityMatches: passwordProtected ? null : availabilityMatches,
    specsVisible: passwordProtected || page.status !== 200 ? null : specsVisible,
  };
}
