import db from "../db.server";
import { audit, previewText, type Fact, type ProductData } from "../core/catalog";
import {
  auditGeo,
  GROUPS,
  storeSignals,
  WEIGHT,
  WHY,
  type CheckGroup,
  type Destination,
  type Priority,
  type StoreProfile,
} from "../core/geo";
import { PROFILES, resolveProfile } from "../core/profiles";
import type { LiveCheck } from "../core/storefront";
import { fingerprint } from "./drafts.server";
import { listingFingerprint } from "./catalog.server";
import { currentListing, suggestListing, type Listing } from "../core/listing";

const parseJson = <T>(value: string | null): T | null => {
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
};

export function adminProductUrl(shop: string, gid: string) {
  const numericId = /^gid:\/\/shopify\/Product\/(\d+)$/.exec(gid)?.[1];
  return numericId && /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(shop)
    ? `https://admin.shopify.com/store/${shop.replace(".myshopify.com", "")}/products/${numericId}`
    : null;
}

export type FixGroup = {
  id: string;
  label: string;
  group: CheckGroup;
  priority: Priority;
  action: string;
  why: string;
  destination: Destination;
  products: { recordId: string; title: string; evidence: string }[];
};
export type LiveStatus = "ok" | "issues" | "unchecked" | "none";

/** One pass over the catalog for the overview, product list and fix plan. */
export async function catalogOverview(shop: string) {
  const [store, rows] = await Promise.all([
    db.store.findUnique({ where: { shop } }),
    db.catalogProduct.findMany({
      where: { shop, deleted: false },
      orderBy: { title: "asc" },
      select: {
        id: true,
        payload: true,
        liveCheck: true,
        liveCheckedAt: true,
        suggestions: {
          where: { status: "DRAFT", kind: "description" },
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { id: true, fingerprint: true },
        },
      },
    }),
  ]);
  const setting = store?.category ?? "auto";
  const groups = new Map<string, FixGroup>();
  const areaKeys = Object.keys(GROUPS) as CheckGroup[];
  const areas = Object.fromEntries(
    areaKeys.map((key) => [key, { group: key, passing: 0, total: 0, issues: 0, pending: 0 }]),
  ) as Record<
    CheckGroup,
    { group: CheckGroup; passing: number; total: number; issues: number; pending: number }
  >;
  let latestLive: { at: Date; check: LiveCheck } | null = null;
  const products = rows.map((row) => {
    const product = JSON.parse(row.payload) as ProductData;
    const live = parseJson<LiveCheck>(row.liveCheck);
    if (live && row.liveCheckedAt && (!latestLive || row.liveCheckedAt > latestLive.at))
      latestLive = { at: row.liveCheckedAt, check: live };
    const profile = resolveProfile(product.commerce?.category, setting);
    const report = auditGeo(product, profile, live);
    const specs = audit(product, profile);
    const draft = row.suggestions[0];
    const active = product.status === "ACTIVE";
    // Inactive products are excluded from the fix plan; they are not for sale.
    if (active)
      for (const key of areaKeys) {
        // A product passes an area only when every check in it has run and
        // passed. Known failures count at once; passes with checks still
        // outstanding (live page, legacy data) are pending, not passing.
        const checks = report.checks.filter((c) => c.group === key);
        const failing = checks.filter((c) => c.status === "action").length;
        const unknown = checks.filter((c) => c.status === "unknown").length;
        if (failing) {
          areas[key].total++;
          areas[key].issues += failing;
        } else if (unknown) areas[key].pending++;
        else {
          areas[key].total++;
          areas[key].passing++;
        }
      }
    if (active)
      for (const issue of report.issues.filter((c) => c.status === "action")) {
        const entry = groups.get(issue.id) ?? {
          id: issue.id,
          label: issue.label,
          group: issue.group,
          priority: issue.priority,
          action: issue.action,
          why: WHY[issue.id] ?? "",
          destination: issue.destination,
          products: [],
        };
        entry.products.push({ recordId: row.id, title: product.title, evidence: issue.evidence });
        groups.set(issue.id, entry);
      }
    return {
      recordId: row.id,
      title: product.title,
      productType: product.productType,
      category: product.commerce?.category?.name ?? null,
      status: product.status,
      image: product.image,
      profile,
      readiness: report.readiness,
      actions: report.actions,
      unknown: report.unknown,
      top: report.issues[0]
        ? {
            label: report.issues[0].label,
            priority: report.issues[0].priority,
            status: report.issues[0].status,
          }
        : null,
      specs: {
        found: specs.facts.length,
        total: specs.rules.length,
        conflicts: specs.conflicts.length,
      },
      needsRescan: report.needsRescan,
      draft:
        draft && draft.fingerprint === fingerprint(product) ? draft.id : null,
      liveCheckedAt: row.liveCheckedAt?.toISOString() ?? null,
      hasPublicUrl: !!report.publicUrl,
      live: (!report.publicUrl
        ? "none"
        : !live
          ? "unchecked"
          : report.checks.some((c) => c.group === "visibility" && c.status === "action" && c.id !== "publication")
            ? "issues"
            : "ok") as LiveStatus,
    };
  });
  const activeProducts = products.filter((p) => p.status === "ACTIVE");
  const fixPlan = [...groups.values()].sort(
    (a, b) =>
      WEIGHT[b.priority] * b.products.length - WEIGHT[a.priority] * a.products.length ||
      WEIGHT[b.priority] - WEIGHT[a.priority],
  );
  const live = latestLive as { at: Date; check: LiveCheck } | null;
  return {
    store: {
      syncedAt: store?.syncedAt?.toISOString() ?? null,
      syncStarted: store?.syncStarted?.toISOString() ?? null,
      scanTotal: store?.scanTotal ?? null,
      setting,
      name: parseJson<StoreProfile>(store?.profile ?? null)?.name ?? null,
    },
    products,
    fixPlan,
    areas: areaKeys.map((key) => areas[key]),
    attention: activeProducts
      .filter((p) => p.actions > 0)
      .sort((a, b) => a.readiness - b.readiness || b.actions - a.actions)
      .slice(0, 5),
    signals: storeSignals(parseJson<StoreProfile>(store?.profile ?? null), live?.check ?? null),
    summary: {
      total: products.length,
      active: activeProducts.length,
      readiness: activeProducts.length
        ? Math.round(activeProducts.reduce((s, p) => s + p.readiness, 0) / activeProducts.length)
        : 0,
      ready: activeProducts.filter((p) => !p.actions && !p.unknown).length,
      needsWork: activeProducts.filter((p) => p.actions > 0).length,
      drafts: products.filter((p) => p.draft).length,
      liveChecked: activeProducts.filter((p) => p.liveCheckedAt).length,
      liveCheckable: activeProducts.filter((p) => p.hasPublicUrl).length,
      needsRescan: products.filter((p) => p.needsRescan).length,
    },
  };
}

export async function productWorkspace(shop: string, id: string) {
  const [store, row] = await Promise.all([
    db.store.findUnique({ where: { shop } }),
    db.catalogProduct.findFirst({
      where: { shop, id },
      include: {
        suggestions: {
          where: { kind: "description" },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
    }),
  ]);
  const listingDraft = row
    ? await db.suggestion.findFirst({
        where: { productId: row.id, kind: "seo" },
        orderBy: { createdAt: "desc" },
      })
    : null;
  if (!row) throw new Response("Product not found", { status: 404 });
  const product = JSON.parse(row.payload) as ProductData;
  const live = parseJson<LiveCheck>(row.liveCheck);
  const setting = store?.category ?? "auto";
  const profile = resolveProfile(product.commerce?.category, setting);
  const report = auditGeo(product, profile, live);
  const specs = audit(product, profile);
  const draft = row.suggestions[0] ?? null;
  return {
    row: { id: row.id, deleted: row.deleted },
    product: {
      title: product.title,
      productType: product.productType,
      category: product.commerce?.category?.fullName ?? null,
      status: product.status,
      updatedAt: product.updatedAt,
      image: product.image,
      vendor: product.discovery?.vendor ?? null,
      descriptionText: previewText(product.descriptionHtml),
    },
    profile: { key: profile, label: PROFILES[profile].label, automatic: setting === "auto" },
    report,
    specs: {
      rules: specs.rules.map(({ key, label, hint }) => ({ key, label, hint })),
      facts: specs.facts,
      conflicts: specs.conflicts,
      score: specs.score,
    },
    live,
    draft: draft
      ? {
          id: draft.id,
          status: draft.status,
          beforeText: previewText(draft.beforeHtml),
          afterText: previewText(draft.afterHtml),
          facts: JSON.parse(draft.facts) as Fact[],
          stale: draft.fingerprint !== fingerprint(product),
        }
      : null,
    listing: {
      url: product.discovery?.onlineStoreUrl ?? null,
      current: currentListing(product),
      // What Google shows when no custom listing is set.
      fallback: {
        title: product.title,
        description: previewText(product.descriptionHtml).replace(/\s+/g, " ").slice(0, 160),
      },
      suggested: suggestListing(product, specs.facts),
      draft: listingDraft
        ? {
            id: listingDraft.id,
            status: listingDraft.status,
            before: JSON.parse(listingDraft.beforeHtml) as Listing,
            after: JSON.parse(listingDraft.afterHtml) as Listing,
            stale: listingDraft.fingerprint !== listingFingerprint(product),
          }
        : null,
    },
    adminUrl: adminProductUrl(shop, product.id),
  };
}
