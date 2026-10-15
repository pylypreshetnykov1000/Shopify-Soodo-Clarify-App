import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import db from "../db.server";
import { audit, type ProductData } from "../core/catalog";
import { safePublicUrl } from "../core/geo";
import { resolveProfile } from "../core/profiles";
import {
  evaluateLivePage,
  type FetchResult,
  type LiveCheck,
} from "../core/storefront";

/** Fetches a public storefront resource. Errors are returned, not thrown. */
export type StorefrontFetcher = (
  url: string,
  kind: "page" | "robots",
) => Promise<FetchResult | { error: string }>;

const blocked = new BlockList();
for (const [net, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
  ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24],
  ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const)
  blocked.addSubnet(net, prefix, "ipv4");
for (const [net, prefix] of [
  ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
  ["64:ff9b::", 96], ["2001:db8::", 32],
] as const)
  blocked.addSubnet(net, prefix, "ipv6");

export function isPublicAddress(address: string) {
  const family = isIP(address);
  if (!family) return false;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address)?.[1];
  if (mapped) return !blocked.check(mapped, "ipv4");
  return !blocked.check(address, family === 6 ? "ipv6" : "ipv4");
}

class FetchBlocked extends Error {}

// Resolve once and connect only to the validated address, which prevents DNS
// rebinding between the check and the connection.
function guardedLookup(
  hostname: string,
  options: { all?: boolean; family?: number },
  callback: (
    error: NodeJS.ErrnoException | null,
    address: string | LookupAddress[],
    family?: number,
  ) => void,
) {
  dnsLookup(hostname, { all: true }, (error, addresses) => {
    if (error) return callback(error, []);
    const safe = addresses.filter((a) => isPublicAddress(a.address));
    if (!safe.length || safe.length !== addresses.length)
      return callback(new FetchBlocked("The store address is not public."), []);
    if (options.all) return callback(null, safe);
    callback(null, safe[0].address, safe[0].family);
  });
}

const LIMITS = { page: 3_000_000, robots: 500_000 } as const;
const TIMEOUT_MS = 8_000;
const USER_AGENT =
  "Mozilla/5.0 (compatible; SoodoGEO/1.0; +https://apps.shopify.com) product readiness check";

function fetchOnce(url: URL, kind: "page" | "robots") {
  return new Promise<FetchResult>((resolve, reject) => {
    if (url.protocol !== "https:" || url.username || url.password)
      return reject(new FetchBlocked("Only public HTTPS pages can be checked."));
    if (url.port && url.port !== "443")
      return reject(new FetchBlocked("Only the standard HTTPS port is allowed."));
    if (isIP(url.hostname.replace(/^\[|\]$/g, "")))
      return reject(new FetchBlocked("Store pages must use a domain name."));
    const req = request(
      url,
      {
        method: "GET",
        lookup: guardedLookup as never,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: kind === "page" ? "text/html,application/xhtml+xml" : "text/plain",
          "Accept-Encoding": "identity",
        },
        timeout: TIMEOUT_MS,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (chunk: Buffer) => {
          size += chunk.length;
          // Keep the beginning of an oversized page; structured data is
          // normally in the head or near the product form.
          if (size <= LIMITS[kind]) chunks.push(chunk);
          else res.destroy();
        });
        const finish = () =>
          resolve({
            status: res.statusCode ?? 0,
            finalUrl: url.href,
            headers: Object.fromEntries(
              Object.entries(res.headers).map(([k, v]) => [
                k.toLowerCase(),
                Array.isArray(v) ? v.join(", ") : String(v ?? ""),
              ]),
            ),
            body: Buffer.concat(chunks).toString("utf8"),
          });
        res.on("end", finish);
        res.on("close", finish);
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("The store took too long to respond.")));
    req.on("error", reject);
    req.end();
  });
}

export const publicFetcher: StorefrontFetcher = async (start, kind) => {
  let url = new URL(start);
  try {
    for (let hop = 0; hop <= 5; hop++) {
      const result = await fetchOnce(url, kind);
      const location = result.headers.location;
      if (result.status >= 300 && result.status < 400 && location) {
        url = new URL(location, url);
        continue;
      }
      return result;
    }
    return { error: "Too many redirects." };
  } catch (error) {
    return {
      error:
        error instanceof FetchBlocked
          ? error.message
          : error instanceof Error && /ENOTFOUND|EAI_AGAIN/.test(error.message)
            ? "The store domain could not be found."
            : error instanceof Error && error.message.includes("too long")
              ? error.message
              : "The page could not be reached.",
    };
  }
};

async function inspect(
  product: ProductData,
  url: string,
  setting: string,
  fetcher: StorefrontFetcher,
  robotsCache: Map<string, Promise<FetchResult | { error: string }>>,
) {
  const origin = new URL(url).origin;
  if (!robotsCache.has(origin))
    robotsCache.set(origin, fetcher(`${origin}/robots.txt`, "robots"));
  const [page, robots] = await Promise.all([
    fetcher(url, "page"),
    robotsCache.get(origin)!,
  ]);
  // Only facts written in the Admin description are expected on the page.
  const profile = resolveProfile(product.commerce?.category, setting);
  const visibleFacts = audit({ ...product, metafields: [] }, profile).facts.map(
    (f) => f.value,
  );
  return evaluateLivePage({ product, url, page, robots, visibleFacts });
}

/** Checks one product's live page and stores the result. Read-only for Shopify. */
export async function checkLivePage(
  shop: string,
  id: string,
  fetcher: StorefrontFetcher,
) {
  const [store, row] = await Promise.all([
    db.store.findUnique({ where: { shop } }),
    db.catalogProduct.findFirst({ where: { shop, id, deleted: false } }),
  ]);
  if (!row) throw new Error("Product not found in this store.");
  const product = JSON.parse(row.payload) as ProductData;
  const url = safePublicUrl(product.discovery?.onlineStoreUrl);
  if (!url)
    throw new Error(
      "This product has no public Online Store page. Publish it to the Online Store, scan, and try again.",
    );
  if (row.liveCheckedAt && Date.now() - row.liveCheckedAt.getTime() < 15_000)
    return "This page was checked a moment ago.";
  const result = await inspect(product, url, store?.category ?? "auto", fetcher, new Map());
  await save(row.id, result);
  return summarize(result);
}

/**
 * Checks the next few active products that were never checked or were checked
 * longest ago. Small batches keep each request short; the client continues.
 */
export async function checkNextLivePages(
  shop: string,
  fetcher: StorefrontFetcher,
  batch = 4,
) {
  const store = await db.store.findUnique({ where: { shop } });
  const cutoff = new Date(Date.now() - 10 * 60_000);
  const rows = await db.catalogProduct.findMany({
    where: {
      shop,
      deleted: false,
      OR: [{ liveCheckedAt: null }, { liveCheckedAt: { lt: cutoff } }],
    },
    orderBy: [{ liveCheckedAt: { sort: "asc", nulls: "first" } }, { title: "asc" }],
    select: { id: true, payload: true },
  });
  const candidates = rows.flatMap((row) => {
    const product = JSON.parse(row.payload) as ProductData;
    const url = safePublicUrl(product.discovery?.onlineStoreUrl);
    return product.status === "ACTIVE" && url ? [{ row, product, url }] : [];
  });
  const robotsCache = new Map<string, Promise<FetchResult | { error: string }>>();
  const work = candidates.slice(0, batch);
  // In parallel, so one request stays within a single page timeout.
  await Promise.all(
    work.map(async ({ row, product, url }) =>
      save(row.id, await inspect(product, url, store?.category ?? "auto", fetcher, robotsCache)),
    ),
  );
  return { checked: work.length, remaining: candidates.length - work.length };
}

async function save(id: string, result: LiveCheck) {
  await db.catalogProduct.update({
    where: { id },
    data: { liveCheck: JSON.stringify(result), liveCheckedAt: new Date(result.checkedAt) },
  });
}

function summarize(result: LiveCheck) {
  if (result.error) return `Live check finished: ${result.error}`;
  if (result.passwordProtected)
    return "Live check finished: the store is password protected, so crawlers only see the password page.";
  const blocked = result.crawlers.filter((c) => c.purpose !== "training" && !c.allowed);
  const problems = [
    result.httpStatus !== 200 && `HTTP ${result.httpStatus}`,
    result.noindex && "noindex found",
    blocked.length && `${blocked.length} crawler${blocked.length === 1 ? "" : "s"} blocked`,
    !result.structured && "no Product structured data",
    result.priceMatches === false && "price mismatch",
    result.availabilityMatches === false && "availability mismatch",
  ].filter(Boolean);
  return problems.length
    ? `Live check finished: ${problems.join(", ")}.`
    : "Live check passed. The page is reachable, indexable and its product data matches Shopify.";
}
