import { randomUUID } from "node:crypto";
import db from "../db.server";
import { type ProductData } from "../core/catalog";
import { resolveProfile } from "../core/profiles";
import { buildDraft, fingerprint } from "./drafts.server";
import type { CatalogAdapter } from "./shopify-catalog.server";
import { WriteRejectedError } from "./shopify-catalog.server";

const unresolved = [
  "PUBLISHING",
  "UNCERTAIN",
  "RESTORING",
  "RESTORE_UNCERTAIN",
];
export async function ensureStore(shop: string) {
  const existing = await db.store.findUnique({ where: { shop } });
  if (existing) return existing;
  return db.store.upsert({ where: { shop }, create: { shop }, update: {} });
}
export async function storeProfileSetting(shop: string) {
  return (await db.store.findUnique({ where: { shop } }))?.category ?? "auto";
}
export async function syncPage(
  shop: string,
  adapter: CatalogAdapter,
  restart = false,
) {
  await ensureStore(shop);
  const token = randomUUID();
  const lease = await db.store.updateMany({
    where: {
      shop,
      OR: [{ syncLease: null }, { syncLease: { lt: new Date() } }],
    },
    data: { syncToken: token, syncLease: new Date(Date.now() + 120_000) },
  });
  if (!lease.count)
    throw new Error("A scan is already running. Wait a moment and retry.");
  try {
    let store = await db.store.findUniqueOrThrow({ where: { shop } });
    if (restart || !store.syncStarted || !store.scanRun) {
      // Store details and the product total are refreshed once per scan.
      const [total, profile] = await Promise.all([
        adapter.count?.() ?? null,
        adapter.store?.() ?? null,
      ]);
      store = await db.store.update({
        where: { shop },
        data: {
          syncCursor: null,
          syncStarted: new Date(),
          scanRun: randomUUID(),
          scanTotal: total,
          ...(profile
            ? { profile: JSON.stringify(profile), profileAt: new Date() }
            : {}),
        },
      });
    }
    const fetchedAt = new Date();
    const page = await adapter.page(store.syncCursor);
    await db.$transaction(async (tx) => {
      const owns = await tx.store.updateMany({
        where: { shop, syncToken: token, syncLease: { gt: new Date() } },
        data: { syncCursor: page.cursor },
      });
      if (!owns.count) throw new Error("Scan lease expired. Retry this batch.");
      for (const product of page.products) {
        const existing = await tx.catalogProduct.findUnique({
          where: { shop_gid: { shop, gid: product.id } },
        });
        if (!existing)
          await tx.catalogProduct.create({
            data: {
              shop,
              gid: product.id,
              title: product.title,
              payload: JSON.stringify(product),
              seenAt: new Date(),
              scanRun: store.scanRun,
            },
          });
        else {
          const newer =
            existing.cacheUpdatedAt >= fetchedAt ||
            (existing.lockUntil !== null && existing.lockUntil > new Date());
          await tx.catalogProduct.update({
            where: { id: existing.id },
            data: {
              seenAt: new Date(),
              scanRun: store.scanRun,
              ...(!newer
                ? {
                    title: product.title,
                    payload: JSON.stringify(product),
                    cacheUpdatedAt: new Date(),
                    deleted: false,
                  }
                : {}),
            },
          });
        }
      }
      if (!page.cursor) {
        await tx.catalogProduct.updateMany({
          where: {
            shop,
            OR: [{ scanRun: null }, { scanRun: { not: store.scanRun! } }],
          },
          data: { deleted: true },
        });
        await tx.store.update({
          where: { shop },
          data: { syncedAt: new Date(), syncStarted: null, syncCursor: null },
        });
      }
    });
    return page.cursor
      ? `Synced ${page.products.length} products. Continue the scan to load the next batch.`
      : "Scan complete. Your catalog is up to date.";
  } finally {
    await db.store.updateMany({
      where: { shop, syncToken: token },
      data: { syncLease: null, syncToken: null },
    });
  }
}
async function ownedProduct(shop: string, id: string) {
  const product = await db.catalogProduct.findFirst({ where: { shop, id } });
  if (!product) throw new Error("Product not found in this store.");
  return product;
}
async function withLock<T>(
  shop: string,
  id: string,
  work: (assertLease: () => Promise<void>) => Promise<T>,
) {
  const token = randomUUID();
  const acquired = await db.catalogProduct.updateMany({
    where: {
      id,
      shop,
      OR: [{ lockUntil: null }, { lockUntil: { lt: new Date() } }],
    },
    data: { lockToken: token, lockUntil: new Date(Date.now() + 120_000) },
  });
  if (!acquired.count)
    throw new Error("This product is busy. Wait a moment and retry.");
  const assertLease = async () => {
    const renewed = await db.catalogProduct.updateMany({
      where: { id, shop, lockToken: token, lockUntil: { gt: new Date() } },
      data: { lockUntil: new Date(Date.now() + 120_000) },
    });
    if (!renewed.count)
      throw new Error(
        "Product lock lease expired. No new write will be started; retry or verify the operation in History.",
      );
  };
  try {
    return await work(assertLease);
  } finally {
    await db.catalogProduct.updateMany({
      where: { id, shop, lockToken: token },
      data: { lockUntil: null, lockToken: null },
    });
  }
}
async function refresh(
  shop: string,
  id: string,
  adapter: CatalogAdapter,
  assertLease: () => Promise<void>,
) {
  const row = await ownedProduct(shop, id);
  const product = await adapter.read(row.gid);
  await assertLease();
  if (!product) {
    await db.catalogProduct.update({ where: { id }, data: { deleted: true } });
    throw new Error("This product was deleted in Shopify.");
  }
  await db.catalogProduct.update({
    where: { id },
    data: {
      title: product.title,
      payload: JSON.stringify(product),
      deleted: false,
      cacheUpdatedAt: new Date(),
    },
  });
  return product;
}
async function assertResolved(id: string) {
  if (
    await db.change.count({
      where: { productId: id, status: { in: unresolved } },
    })
  )
    throw new Error(
      "A previous operation needs verification. Open History and verify its result first.",
    );
}
export async function createDraft(
  shop: string,
  id: string,
  adapter: CatalogAdapter,
  input: Record<string, string>,
) {
  return withLock(shop, id, async (assertLease) => {
    await assertResolved(id);
    const product = await refresh(shop, id, adapter, assertLease);
    const profile = resolveProfile(
      product.commerce?.category,
      await storeProfileSetting(shop),
    );
    const draft = buildDraft(product, input, profile);
    await assertLease();
    return db.$transaction(async (tx) => {
      await tx.suggestion.updateMany({
        where: { productId: id, status: "DRAFT" },
        data: { status: "SUPERSEDED" },
      });
      return tx.suggestion.create({
        data: { productId: id, ...draft, facts: JSON.stringify(draft.facts) },
      });
    });
  });
}
export async function rejectDraft(shop: string, suggestionId: string) {
  const draft = await db.suggestion.findFirst({
    where: { id: suggestionId, product: { shop } },
  });
  if (!draft) throw new Error("Draft not found.");
  return withLock(shop, draft.productId, async (assertLease) => {
    await assertLease();
    const result = await db.suggestion.updateMany({
      where: { id: draft.id, status: "DRAFT" },
      data: { status: "REJECTED" },
    });
    if (!result.count) throw new Error("This draft is no longer pending.");
  });
}
export async function publishDraft(
  shop: string,
  suggestionId: string,
  adapter: CatalogAdapter,
) {
  const initial = await db.suggestion.findFirst({
    where: { id: suggestionId, product: { shop } },
  });
  if (!initial) throw new Error("Draft not found.");
  return withLock(shop, initial.productId, async (assertLease) => {
    const draft = await db.suggestion.findFirstOrThrow({
      where: { id: suggestionId, product: { shop } },
    });
    if (draft.status === "PUBLISHED")
      return "This draft has already been published.";
    if (draft.status !== "DRAFT")
      throw new Error("This draft is no longer pending.");
    await assertResolved(draft.productId);
    const current = await refresh(shop, draft.productId, adapter, assertLease);
    await assertLease();
    if (fingerprint(current) !== draft.fingerprint) {
      await db.suggestion.update({
        where: { id: draft.id },
        data: { status: "STALE" },
      });
      throw new Error(
        "Product information changed since this draft was created. Review the current facts and create a new draft.",
      );
    }
    const change = await db.$transaction(async (tx) => {
      await tx.suggestion.update({
        where: { id: draft.id },
        data: { status: "PUBLISHING" },
      });
      return tx.change.create({
        data: {
          productId: draft.productId,
          suggestionId: draft.id,
          beforeHtml: draft.beforeHtml,
          afterHtml: draft.afterHtml,
        },
      });
    });
    await assertLease();
    try {
      await adapter.writeDescription(current.id, draft.afterHtml);
      await assertLease();
      await db.change.update({
        where: { id: change.id },
        data: { requestOutcome: "ACKNOWLEDGED" },
      });
    } catch (error) {
      await assertLease();
      await db.change.update({
        where: { id: change.id },
        data: {
          requestOutcome:
            error instanceof WriteRejectedError ? "REJECTED" : "UNKNOWN",
        },
      });
    }
    return verifyChangeUnlocked(shop, change.id, adapter, assertLease);
  });
}
async function verifyChangeUnlocked(
  shop: string,
  changeId: string,
  adapter: CatalogAdapter,
  assertLease: () => Promise<void>,
) {
  const change = await db.change.findFirst({
    where: { id: changeId, product: { shop } },
  });
  if (!change) throw new Error("Change not found.");
  const restoring = ["RESTORING", "RESTORE_UNCERTAIN"].includes(change.status);
  let product: ProductData;
  try {
    product = await refresh(shop, change.productId, adapter, assertLease);
  } catch {
    await assertLease();
    await db.change.update({
      where: { id: change.id },
      data: {
        status: restoring ? "RESTORE_UNCERTAIN" : "UNCERTAIN",
        message:
          "Unable to verify the saved description. Retry verification before making another change.",
      },
    });
    throw new Error(
      "Unable to verify the saved description. Open History and retry verification.",
    );
  }
  if (
    product.descriptionHtml ===
    (restoring ? change.beforeHtml : change.afterHtml)
  ) {
    await db.$transaction([
      db.change.update({
        where: { id: change.id },
        data: { status: restoring ? "RESTORED" : "PUBLISHED", message: null },
      }),
      db.suggestion.update({
        where: { id: change.suggestionId },
        data: { status: restoring ? "RESTORED" : "PUBLISHED" },
      }),
    ]);
    return restoring
      ? "Previous description restored and verified."
      : "Description published and verified.";
  }
  if (
    product.descriptionHtml ===
    (restoring ? change.afterHtml : change.beforeHtml)
  ) {
    if (["PENDING", "UNKNOWN"].includes(change.requestOutcome)) {
      await db.change.update({
        where: { id: change.id },
        data: {
          status: restoring ? "RESTORE_UNCERTAIN" : "UNCERTAIN",
          message:
            "The request was not acknowledged. The current description is unchanged, but a delayed write cannot be ruled out. Retry verification; publishing remains blocked.",
        },
      });
      throw new Error(
        "The write result is uncertain. The description is currently unchanged. Verify again in History before making another change.",
      );
    }
    await db.$transaction([
      db.change.update({
        where: { id: change.id },
        data: {
          status: restoring ? "PUBLISHED" : "FAILED",
          message: "The saved description was unchanged. You can retry.",
        },
      }),
      db.suggestion.update({
        where: { id: change.suggestionId },
        data: { status: restoring ? "PUBLISHED" : "DRAFT" },
      }),
    ]);
    throw new Error("The description was not changed. You can retry safely.");
  }
  if (["PENDING", "UNKNOWN"].includes(change.requestOutcome)) {
    await db.change.update({
      where: { id: change.id },
      data: {
        status: restoring ? "RESTORE_UNCERTAIN" : "UNCERTAIN",
        message:
          "Remote content differs from both snapshots and the request was not acknowledged. Further writes remain blocked until the operation can be verified.",
      },
    });
    throw new Error(
      "The write result is uncertain and the remote description changed. Verify again in History; further writes remain blocked.",
    );
  }
  await db.$transaction([
    db.change.update({
      where: { id: change.id },
      data: {
        status: "CONFLICT",
        message:
          "The current description differs from both snapshots. It has been preserved; review the product before drafting again.",
      },
    }),
    db.suggestion.update({
      where: { id: change.suggestionId },
      data: { status: "STALE" },
    }),
  ]);
  throw new Error(
    "The product description differs from both snapshots. Your current content was preserved. Review the product again.",
  );
}
export async function verifyChange(
  shop: string,
  changeId: string,
  adapter: CatalogAdapter,
) {
  const change = await db.change.findFirst({
    where: { id: changeId, product: { shop } },
  });
  if (!change) throw new Error("Change not found.");
  return withLock(shop, change.productId, async (assertLease) => {
    const current = await db.change.findUniqueOrThrow({
      where: { id: changeId },
    });
    if (!unresolved.includes(current.status))
      throw new Error("This operation is already resolved.");
    return verifyChangeUnlocked(shop, changeId, adapter, assertLease);
  });
}
export async function restoreChange(
  shop: string,
  changeId: string,
  adapter: CatalogAdapter,
) {
  const initial = await db.change.findFirst({
    where: { id: changeId, product: { shop } },
  });
  if (!initial) throw new Error("Change not found.");
  return withLock(shop, initial.productId, async (assertLease) => {
    const change = await db.change.findFirstOrThrow({
      where: { id: changeId, product: { shop } },
    });
    await assertResolved(change.productId);
    if (change.status === "RESTORED")
      return "This description has already been restored.";
    if (change.status !== "PUBLISHED")
      throw new Error("Only a verified published change can be restored.");
    const current = await refresh(shop, change.productId, adapter, assertLease);
    await assertLease();
    if (current.descriptionHtml !== change.afterHtml)
      throw new Error(
        "The description changed after publishing. Restore is blocked to preserve your newer edits.",
      );
    await db.change.update({
      where: { id: change.id },
      data: { status: "RESTORING", requestOutcome: "PENDING" },
    });
    await assertLease();
    try {
      await adapter.writeDescription(current.id, change.beforeHtml);
      await assertLease();
      await db.change.update({
        where: { id: change.id },
        data: { requestOutcome: "ACKNOWLEDGED" },
      });
    } catch (error) {
      await assertLease();
      await db.change.update({
        where: { id: change.id },
        data: {
          requestOutcome:
            error instanceof WriteRejectedError ? "REJECTED" : "UNKNOWN",
        },
      });
    }
    return verifyChangeUnlocked(shop, change.id, adapter, assertLease);
  });
}
