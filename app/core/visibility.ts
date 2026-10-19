import type { ProductData } from "./catalog";
import type { StoreProfile } from "./geo";

/** Buyer questions asked per visibility test. */
export const QUESTIONS_PER_TEST = 12;

/** What a shopper might be looking for in one part of the catalog. */
export type CatalogTopic = {
  name: string;
  products: number;
  minPrice: number | null;
  maxPrice: number | null;
  examples: string[];
};
export type CatalogBrief = {
  currency: string | null;
  topics: CatalogTopic[];
};
export type BuyerQuestion = { prompt: string; topic: string };

/** How the store shows up in AI answers: its name, domains and products. */
export type StoreIdentity = {
  name: string | null;
  domains: string[];
  products: string[];
  vendors: string[];
};

export type ParsedAnswer = {
  text: string;
  brands: string[];
  sources: string[];
};
export type Appearance = "recommended" | "cited" | "absent";

const clean = (value: string) => value.replace(/\s+/g, " ").trim();
const lower = (value: string) => value.toLowerCase();

const topicName = (product: ProductData) =>
  clean(
    product.commerce?.category?.name ||
      product.productType ||
      product.title.split(/\s+/).slice(-1)[0] ||
      "",
  );

/** The catalog in a few lines: what is sold, how much of it, at what price. */
export function catalogBrief(products: ProductData[], currency: string | null = null): CatalogBrief {
  const topics = new Map<string, CatalogTopic>();
  for (const product of products) {
    if (product.status !== "ACTIVE") continue;
    const name = topicName(product);
    if (!name) continue;
    const key = lower(name);
    const topic = topics.get(key) ?? { name, products: 0, minPrice: null, maxPrice: null, examples: [] };
    topic.products++;
    if (topic.examples.length < 4) topic.examples.push(clean(product.title));
    for (const variant of product.commerce?.variants ?? []) {
      const price = Number(variant.price);
      if (!Number.isFinite(price) || price <= 0) continue;
      topic.minPrice = topic.minPrice === null ? price : Math.min(topic.minPrice, price);
      topic.maxPrice = topic.maxPrice === null ? price : Math.max(topic.maxPrice, price);
    }
    topics.set(key, topic);
  }
  return {
    currency,
    topics: [...topics.values()].sort((a, b) => b.products - a.products).slice(0, 8),
  };
}

/** Rounds a price up to a figure a shopper would say: 180 → 200, 1240 → 1300. */
export function roundPrice(price: number) {
  const step = price < 100 ? 10 : price < 1000 ? 50 : 100;
  return Math.ceil(price / step) * step;
}

const singular = (name: string) => {
  const word = lower(name);
  if (/ies$/.test(word)) return word.slice(0, -3) + "y";
  if (/(ch|sh|x)es$/.test(word)) return word.slice(0, -2);
  if (/[^s]s$/.test(word)) return word.slice(0, -1);
  return word;
};
const plural = (name: string) => {
  const word = lower(name);
  if (/(s|x|ch|sh)$/.test(word)) return word;
  if (/[^aeiou]y$/.test(word)) return word.slice(0, -1) + "ies";
  return word + "s";
};

/**
 * Buyer questions without AI: the kinds of things shoppers ask assistants,
 * for each part of the catalog. Never names the store, so answers are fair.
 */
export function templateQuestions(brief: CatalogBrief, count = QUESTIONS_PER_TEST): BuyerQuestion[] {
  const price = (value: number) =>
    new Intl.NumberFormat("en-US", { style: "currency", currency: brief.currency ?? "USD", maximumFractionDigits: 0 }).format(
      roundPrice(value),
    );
  const perTopic = brief.topics.map((topic) => {
    const many = plural(topic.name);
    const questions = [
      `What are the best ${many} to buy right now?`,
      `Which ${singular(topic.name)} would you recommend for a beginner?`,
      `Where can I buy a good quality ${singular(topic.name)} online?`,
    ];
    if (topic.maxPrice)
      questions.splice(1, 0, `What is the best ${singular(topic.name)} under ${price(topic.maxPrice)}?`);
    if (topic.examples[0])
      questions.push(`Is the ${topic.examples[0]} worth it, or is there something better?`);
    return questions.map((prompt) => ({ prompt, topic: topic.name }));
  });
  // Round-robin, so every part of the catalog gets asked about.
  const out: BuyerQuestion[] = [];
  for (let i = 0; out.length < count && perTopic.some((q) => q.length > i); i++)
    for (const questions of perTopic) if (questions[i] && out.length < count) out.push(questions[i]);
  return out;
}

export const hostOf = (value: string) => {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
};

/** The store's name, web addresses, product names and brands. */
export function storeIdentity(shop: string, profile: StoreProfile | null, products: ProductData[]): StoreIdentity {
  const domains = new Set<string>();
  const add = (value: string | null | undefined) => {
    const host = value ? hostOf(value) : null;
    if (host) domains.add(host);
  };
  add(shop);
  add(profile?.primaryDomain);
  for (const product of products) add(product.discovery?.onlineStoreUrl);
  return {
    name: profile?.name ? clean(profile.name) : null,
    domains: [...domains],
    // Short or one-word titles ("Tent") would match every answer.
    products: products
      .filter((p) => p.status === "ACTIVE")
      .map((p) => clean(p.title))
      .filter((t) => t.length >= 8 && t.includes(" ")),
    vendors: [...new Set(products.map((p) => clean(p.discovery?.vendor ?? "")).filter(Boolean))],
  };
}

const LINK = /\[[^\]]*\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)<>\]]+)/g;
const BRANDS_LINE = /^\s*\**\s*brands\s*\**\s*:\s*(.*)$/im;

/**
 * Splits an assistant's answer into the text, the brands it recommended (the
 * "BRANDS:" line we ask for) and the sites it cited.
 */
export function parseAnswer(raw: string, citedHosts: string[] = []): ParsedAnswer {
  const match = BRANDS_LINE.exec(raw);
  const brands = match
    ? match[1]
        .split(/[;,]/)
        .map((b) => clean(b.replace(/[*_`]/g, "")))
        .filter((b) => b && !/^(none|n\/a)$/i.test(b))
    : [];
  const text = (match ? raw.slice(0, match.index) : raw).replace(/\n?-{3,}\s*$/, "").trim();
  const sources = new Set<string>();
  for (const host of citedHosts) {
    const h = hostOf(host);
    if (h) sources.add(h);
  }
  for (const link of text.matchAll(LINK)) {
    const h = hostOf(link[1] ?? link[2]);
    if (h && !h.endsWith("vertexaisearch.cloud.google.com")) sources.add(h);
  }
  return { text, brands: [...new Set(brands)].slice(0, 12), sources: [...sources].slice(0, 20) };
}

const escapeRegex = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const mentions = (text: string, phrase: string) =>
  new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(lower(phrase))}($|[^\\p{L}\\p{N}])`, "u").test(lower(text));
const sameSite = (host: string, domain: string) => host === domain || host.endsWith(`.${domain}`);

/** Whether an answer names the store or one of its products, or cites its site. */
export function findStore(answer: ParsedAnswer, identity: StoreIdentity) {
  const products = identity.products.filter((title) => mentions(answer.text, title));
  const named =
    (identity.name !== null && identity.name.length >= 3 && mentions(answer.text, identity.name)) ||
    identity.domains.some((d) => lower(answer.text).includes(d)) ||
    products.length > 0 ||
    answer.brands.some((b) => identity.name !== null && lower(b) === lower(identity.name));
  const cited = answer.sources.some((host) => identity.domains.some((d) => sameSite(host, d)));
  const appearance: Appearance = named ? "recommended" : cited ? "cited" : "absent";
  return { appearance, products };
}

/** True when a recommended brand is the store itself. */
export const isOwnBrand = (brand: string, identity: StoreIdentity) =>
  (identity.name !== null && lower(brand) === lower(identity.name)) ||
  identity.domains.some((d) => lower(brand) === d || lower(brand) === d.split(".")[0]);

export type AnsweredQuestion = {
  prompt: string;
  appearance: Appearance | null;
  brands: string[];
  sources: string[];
};

/**
 * One test in numbers: how often the store appeared, which brands were
 * recommended instead, and which sites the assistant relied on.
 */
export function summarizeTest(answers: AnsweredQuestion[], identity: StoreIdentity) {
  const answered = answers.filter((a) => a.appearance !== null);
  const recommended = answered.filter((a) => a.appearance === "recommended").length;
  const cited = answered.filter((a) => a.appearance === "cited").length;
  const score = answered.length ? Math.round(((recommended + cited) / answered.length) * 100) : null;
  const vendors = new Set(identity.vendors.map(lower));
  const brands = new Map<string, { name: string; count: number; youSell: boolean }>();
  const sources = new Map<string, { host: string; count: number; yours: boolean }>();
  for (const answer of answered) {
    for (const brand of new Set(answer.brands)) {
      if (isOwnBrand(brand, identity)) continue;
      const key = lower(brand);
      const entry = brands.get(key) ?? { name: brand, count: 0, youSell: vendors.has(key) };
      entry.count++;
      brands.set(key, entry);
    }
    for (const host of new Set(answer.sources)) {
      const entry = sources.get(host) ?? {
        host,
        count: 0,
        yours: identity.domains.some((d) => sameSite(host, d)),
      };
      entry.count++;
      sources.set(host, entry);
    }
  }
  const rank = <T extends { count: number }>(map: Map<string, T>) =>
    [...map.values()].sort((a, b) => b.count - a.count).slice(0, 8);
  return {
    score,
    answered: answered.length,
    recommended,
    cited,
    competitors: rank(brands),
    sources: rank(sources),
  };
}
