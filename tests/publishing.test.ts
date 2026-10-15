import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import db from "../app/db.server";
import { demoProducts } from "../app/core/demo";
import type { ProductData } from "../app/core/catalog";
import type { CatalogAdapter } from "../app/services/shopify-catalog.server";
import { WriteRejectedError } from "../app/services/shopify-catalog.server";
import {
  createDraft,
  publishDraft,
  restoreChange,
  syncPage,
  verifyChange,
} from "../app/services/catalog.server";
import { catalogOverview } from "../app/services/geo.server";

async function fixture() {
  const shop = `${randomUUID()}.myshopify.com`;
  let product: ProductData = structuredClone(demoProducts[0]);
  let writes = 0;
  const adapter: CatalogAdapter = {
    async read() {
      return structuredClone(product);
    },
    async writeDescription(_id, html) {
      writes++;
      product = { ...product, descriptionHtml: html };
    },
    async page() {
      return { products: [structuredClone(product)], cursor: null };
    },
  };
  await syncPage(shop, adapter, true);
  const row = await db.catalogProduct.findUniqueOrThrow({
    where: { shop_gid: { shop, gid: product.id } },
  });
  return {
    shop,
    row,
    adapter,
    current: () => product,
    edit: (html: string) => {
      product = { ...product, descriptionHtml: html };
    },
    writes: () => writes,
    clean: () => db.store.delete({ where: { shop } }),
  };
}

test("catalog lists exclude large descriptions and source facts while retaining fresh draft status", async () => {
  const f = await fixture();
  try {
    f.edit(`<p>${"Long product description ".repeat(1000)}</p>`);
    await syncPage(f.shop, f.adapter, true);
    const draft = await createDraft(f.shop, f.row.id, f.adapter, {
      use: "Hiking",
    });
    let list = (await catalogOverview(f.shop)).products;
    assert.equal(list[0].draft, draft.id);
    // No category and an automatic checklist: the general profile applies.
    assert.deepEqual(list[0].specs, { found: 2, total: 4, conflicts: 0 });
    assert.ok(!("descriptionHtml" in list[0]));
    assert.ok(!("metafields" in list[0]));
    assert.ok(!("facts" in list[0].specs));
    assert.ok(
      JSON.stringify(list).length < 2000,
      "A list row must not carry full descriptions or snapshots",
    );
    f.edit("<p>Changed product description</p>");
    await syncPage(f.shop, f.adapter, true);
    list = (await catalogOverview(f.shop)).products;
    assert.equal(
      list[0].draft,
      null,
      "A stale draft must never be advertised as ready",
    );
  } finally {
    await f.clean();
  }
});
test("publish, repeated publish and restore verify the exact descriptions", async () => {
  const f = await fixture();
  try {
    const draft = await createDraft(f.shop, f.row.id, f.adapter, {
      use: "Hiking",
    });
    await publishDraft(f.shop, draft.id, f.adapter);
    assert.equal(f.current().descriptionHtml, draft.afterHtml);
    await publishDraft(f.shop, draft.id, f.adapter);
    assert.equal(f.writes(), 1);
    const change = await db.change.findFirstOrThrow({
      where: { suggestionId: draft.id },
    });
    await restoreChange(f.shop, change.id, f.adapter);
    assert.equal(f.current().descriptionHtml, draft.beforeHtml);
    assert.equal(
      (await db.change.findUniqueOrThrow({ where: { id: change.id } })).status,
      "RESTORED",
    );
  } finally {
    await f.clean();
  }
});
test("stale source data blocks publishing without a write", async () => {
  const f = await fixture();
  try {
    const draft = await createDraft(f.shop, f.row.id, f.adapter, {});
    f.edit("Merchant edited this description.");
    await assert.rejects(
      publishDraft(f.shop, draft.id, f.adapter),
      /changed since/,
    );
    assert.equal(f.writes(), 0);
    assert.equal(
      f.current().descriptionHtml,
      "Merchant edited this description.",
    );
  } finally {
    await f.clean();
  }
});
test("restore preserves edits made after publishing", async () => {
  const f = await fixture();
  try {
    const draft = await createDraft(f.shop, f.row.id, f.adapter, {});
    await publishDraft(f.shop, draft.id, f.adapter);
    const change = await db.change.findFirstOrThrow({
      where: { suggestionId: draft.id },
    });
    f.edit("A newer merchant edit");
    await assert.rejects(
      restoreChange(f.shop, change.id, f.adapter),
      /newer edits/,
    );
    assert.equal(f.writes(), 1);
  } finally {
    await f.clean();
  }
});
test("a timeout after a successful write is reconciled as published", async () => {
  const f = await fixture();
  try {
    const adapter = {
      ...f.adapter,
      async writeDescription(id: string, html: string) {
        await f.adapter.writeDescription(id, html);
        throw new Error("Timeout");
      },
    };
    const draft = await createDraft(f.shop, f.row.id, adapter, {});
    await publishDraft(f.shop, draft.id, adapter);
    assert.equal(
      (await db.suggestion.findUniqueOrThrow({ where: { id: draft.id } }))
        .status,
      "PUBLISHED",
    );
  } finally {
    await f.clean();
  }
});
test("failed verification blocks further changes until recovered", async () => {
  const f = await fixture();
  try {
    const draft = await createDraft(f.shop, f.row.id, f.adapter, {});
    let reads = 0;
    const adapter = {
      ...f.adapter,
      async read(id: string) {
        if (++reads > 1) throw new Error("Network unavailable");
        return f.adapter.read(id);
      },
    };
    await assert.rejects(
      publishDraft(f.shop, draft.id, adapter),
      /Unable to verify/,
    );
    await assert.rejects(
      createDraft(f.shop, f.row.id, f.adapter, {}),
      /needs verification/,
    );
    const change = await db.change.findFirstOrThrow({
      where: { suggestionId: draft.id },
    });
    await verifyChange(f.shop, change.id, f.adapter);
    assert.equal(
      (await db.change.findUniqueOrThrow({ where: { id: change.id } })).status,
      "PUBLISHED",
    );
  } finally {
    await f.clean();
  }
});
test("store isolation rejects another store's draft and snapshot", async () => {
  const f = await fixture();
  try {
    const draft = await createDraft(f.shop, f.row.id, f.adapter, {});
    await assert.rejects(
      publishDraft("other.myshopify.com", draft.id, f.adapter),
      /not found/,
    );
    await assert.rejects(
      createDraft("other.myshopify.com", f.row.id, f.adapter, {}),
      /not found|busy/,
    );
    assert.equal(f.writes(), 0);
  } finally {
    await f.clean();
  }
});
test("a scan resumes all pages and only marks deletions after completion", async () => {
  const f = await fixture();
  try {
    const adapter = {
      ...f.adapter,
      async page(cursor: string | null) {
        return cursor
          ? { products: [demoProducts[1]], cursor: null }
          : { products: [], cursor: "page-2" };
      },
    };
    await syncPage(f.shop, adapter, true);
    assert.equal(
      (await db.catalogProduct.findUniqueOrThrow({ where: { id: f.row.id } }))
        .deleted,
      false,
    );
    await syncPage(f.shop, adapter);
    assert.equal(
      (await db.catalogProduct.findUniqueOrThrow({ where: { id: f.row.id } }))
        .deleted,
      true,
    );
    assert.equal(
      await db.catalogProduct.count({
        where: { shop: f.shop, deleted: false },
      }),
      1,
    );
  } finally {
    await f.clean();
  }
});
test("conflicting remote result preserves content and invalidates the draft", async () => {
  const f = await fixture();
  try {
    const draft = await createDraft(f.shop, f.row.id, f.adapter, {});
    const adapter = {
      ...f.adapter,
      async writeDescription() {
        f.edit("Concurrent merchant content");
      },
    };
    await assert.rejects(
      publishDraft(f.shop, draft.id, adapter),
      /differs from both/,
    );
    assert.equal(f.current().descriptionHtml, "Concurrent merchant content");
    assert.equal(
      (await db.change.findFirstOrThrow({ where: { suggestionId: draft.id } }))
        .status,
      "CONFLICT",
    );
  } finally {
    await f.clean();
  }
});
test("an unacknowledged write with unchanged content remains uncertain", async () => {
  const f = await fixture();
  try {
    const draft = await createDraft(f.shop, f.row.id, f.adapter, {});
    const adapter = {
      ...f.adapter,
      async writeDescription() {
        throw new Error("Network timeout");
      },
    };
    await assert.rejects(publishDraft(f.shop, draft.id, adapter), /uncertain/);
    const change = await db.change.findFirstOrThrow({
      where: { suggestionId: draft.id },
    });
    assert.equal(change.status, "UNCERTAIN");
    await assert.rejects(
      verifyChange(f.shop, change.id, f.adapter),
      /uncertain/,
    );
    await assert.rejects(
      createDraft(f.shop, f.row.id, f.adapter, {}),
      /needs verification/,
    );
  } finally {
    await f.clean();
  }
});
test("explicit Shopify rejection can safely return a draft for retry", async () => {
  const f = await fixture();
  try {
    const draft = await createDraft(f.shop, f.row.id, f.adapter, {});
    const adapter = {
      ...f.adapter,
      async writeDescription() {
        throw new WriteRejectedError("Invalid value");
      },
    };
    await assert.rejects(
      publishDraft(f.shop, draft.id, adapter),
      /not changed/,
    );
    assert.equal(
      (await db.suggestion.findUniqueOrThrow({ where: { id: draft.id } }))
        .status,
      "DRAFT",
    );
    await publishDraft(f.shop, draft.id, f.adapter);
    assert.equal(f.writes(), 1);
  } finally {
    await f.clean();
  }
});
test("simultaneous approval requests never write twice", async () => {
  const f = await fixture();
  try {
    const draft = await createDraft(f.shop, f.row.id, f.adapter, {});
    const results = await Promise.allSettled([
      publishDraft(f.shop, draft.id, f.adapter),
      publishDraft(f.shop, draft.id, f.adapter),
    ]);
    assert.ok(results.some((r) => r.status === "fulfilled"));
    assert.equal(f.writes(), 1);
    assert.equal(
      (await db.suggestion.findUniqueOrThrow({ where: { id: draft.id } }))
        .status,
      "PUBLISHED",
    );
  } finally {
    await f.clean();
  }
});
test("unknown writes stay blocked when the remote content is a third value", async () => {
  const f = await fixture();
  try {
    const draft = await createDraft(f.shop, f.row.id, f.adapter, {});
    const adapter = {
      ...f.adapter,
      async writeDescription() {
        f.edit("Unrelated remote edit");
        throw new Error("Timeout");
      },
    };
    await assert.rejects(publishDraft(f.shop, draft.id, adapter), /uncertain/);
    assert.equal(
      (await db.change.findFirstOrThrow({ where: { suggestionId: draft.id } }))
        .status,
      "UNCERTAIN",
    );
    await assert.rejects(
      createDraft(f.shop, f.row.id, f.adapter, {}),
      /needs verification/,
    );
  } finally {
    await f.clean();
  }
});
test("a lost product lease prevents a remote write", async () => {
  const f = await fixture();
  try {
    const draft = await createDraft(f.shop, f.row.id, f.adapter, {});
    const adapter = {
      ...f.adapter,
      async read(id: string) {
        await db.catalogProduct.update({
          where: { id: f.row.id },
          data: { lockUntil: new Date(0) },
        });
        return f.adapter.read(id);
      },
    };
    await assert.rejects(
      publishDraft(f.shop, draft.id, adapter),
      /lease|lock/i,
    );
    assert.equal(f.writes(), 0);
  } finally {
    await f.clean();
  }
});
test("scan results fetched before publishing cannot replace the verified cache", async () => {
  const f = await fixture();
  try {
    const draft = await createDraft(f.shop, f.row.id, f.adapter, {
      use: "Hiking",
    });
    const adapter = {
      ...f.adapter,
      async page() {
        const old = structuredClone(f.current());
        await publishDraft(f.shop, draft.id, f.adapter);
        return { products: [old], cursor: null };
      },
    };
    await syncPage(f.shop, adapter, true);
    const cached = JSON.parse(
      (await db.catalogProduct.findUniqueOrThrow({ where: { id: f.row.id } }))
        .payload,
    ) as ProductData;
    assert.equal(cached.descriptionHtml, draft.afterHtml);
  } finally {
    await f.clean();
  }
});
test("an incomplete scan failure preserves catalog and cursor for retry", async () => {
  const f = await fixture();
  try {
    const adapter = {
      ...f.adapter,
      async page(cursor: string | null) {
        if (cursor) throw new Error("Connection unavailable");
        return { products: [f.current()], cursor: "next" };
      },
    };
    await syncPage(f.shop, adapter, true);
    await assert.rejects(syncPage(f.shop, adapter), /Connection unavailable/);
    const store = await db.store.findUniqueOrThrow({ where: { shop: f.shop } });
    assert.equal(store.syncCursor, "next");
    assert.equal(store.syncToken, null);
    assert.equal(
      (await db.catalogProduct.findUniqueOrThrow({ where: { id: f.row.id } }))
        .deleted,
      false,
    );
  } finally {
    await f.clean();
  }
});
test("deletion membership depends on scan pages, not unrelated reads", async () => {
  const f = await fixture();
  try {
    const adapter = {
      ...f.adapter,
      async page(cursor: string | null) {
        return cursor
          ? { products: [], cursor: null }
          : { products: [], cursor: "next" };
      },
    };
    await syncPage(f.shop, adapter, true);
    await createDraft(f.shop, f.row.id, f.adapter, {});
    await syncPage(f.shop, adapter);
    assert.equal(
      (await db.catalogProduct.findUniqueOrThrow({ where: { id: f.row.id } }))
        .deleted,
      true,
    );
  } finally {
    await f.clean();
  }
});
test("restore timeout with third-party edits remains unresolved", async () => {
  const f = await fixture();
  try {
    const draft = await createDraft(f.shop, f.row.id, f.adapter, {});
    await publishDraft(f.shop, draft.id, f.adapter);
    const change = await db.change.findFirstOrThrow({
      where: { suggestionId: draft.id },
    });
    const adapter = {
      ...f.adapter,
      async writeDescription() {
        f.edit("Another edit");
        throw new Error("Timeout");
      },
    };
    await assert.rejects(
      restoreChange(f.shop, change.id, adapter),
      /uncertain/,
    );
    assert.equal(
      (await db.change.findUniqueOrThrow({ where: { id: change.id } })).status,
      "RESTORE_UNCERTAIN",
    );
  } finally {
    await f.clean();
  }
});
test("an expired worker cannot update the journal after a late successful write", async () => {
  const f = await fixture();
  try {
    const draft = await createDraft(f.shop, f.row.id, f.adapter, {});
    const adapter = {
      ...f.adapter,
      async writeDescription(id: string, html: string) {
        await f.adapter.writeDescription(id, html);
        await db.catalogProduct.update({
          where: { id: f.row.id },
          data: { lockUntil: new Date(0) },
        });
      },
    };
    await assert.rejects(
      publishDraft(f.shop, draft.id, adapter),
      /lock lease expired/,
    );
    const change = await db.change.findFirstOrThrow({
      where: { suggestionId: draft.id },
    });
    assert.equal(change.requestOutcome, "PENDING");
    await verifyChange(f.shop, change.id, f.adapter);
    assert.equal(
      (await db.change.findUniqueOrThrow({ where: { id: change.id } })).status,
      "PUBLISHED",
    );
  } finally {
    await f.clean();
  }
});
