import { test } from "node:test";
import assert from "node:assert/strict";
import {
  shopifyAdapter,
  WriteRejectedError,
  type GraphqlClient,
} from "../app/services/shopify-catalog.server";
function client(results: unknown[]): GraphqlClient {
  return {
    async graphql() {
      if (!results.length) throw new Error("Unexpected extra GraphQL request");
      return Response.json(results.shift());
    },
  };
}
const raw = {
  id: "gid://shopify/Product/1",
  title: "Pack",
  descriptionHtml: "",
  productType: "Pack",
  status: "ACTIVE",
  updatedAt: "2026-10-13T00:00:00Z",
  featuredMedia: null,
  vendor: "Trail Supply",
  onlineStoreUrl: "https://trail.example/products/pack",
  seo: { title: null, description: "A hiking pack." },
  metafields: {
    nodes: [
      {
        namespace: "custom",
        key: "material",
        value: "Nylon",
        type: "single_line_text_field",
      },
    ],
    pageInfo: { hasNextPage: true, endCursor: "meta-2" },
  },
};
test("adapter retrieves additional metafield pages without losing facts", async () => {
  const adapter = shopifyAdapter(
    client([
      {
        data: {
          products: {
            nodes: [raw],
            pageInfo: { hasNextPage: true, endCursor: "products-2" },
          },
        },
      },
      {
        data: {
          product: {
            metafields: {
              nodes: [
                {
                  namespace: "custom",
                  key: "care",
                  value: "Hand wash",
                  type: "single_line_text_field",
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      },
    ]),
  );
  const page = await adapter.page(null);
  assert.equal(page.cursor, "products-2");
  assert.equal(page.products[0].metafields.length, 2);
  assert.equal(page.products[0].discovery?.vendor, "Trail Supply");
  assert.equal(page.products[0].discovery?.onlineStoreUrl, raw.onlineStoreUrl);
});
test("adapter distinguishes explicit mutation rejection from ambiguous failures", async () => {
  const rejected = shopifyAdapter(
    client([
      {
        data: {
          productUpdate: {
            product: null,
            userErrors: [{ message: "Invalid input" }],
          },
        },
      },
    ]),
  );
  await assert.rejects(
    rejected.writeDescription(raw.id, "text"),
    WriteRejectedError,
  );
  const failed = shopifyAdapter(
    client([{ errors: [{ message: "Throttled" }] }]),
  );
  await assert.rejects(
    failed.writeDescription(raw.id, "text"),
    /Shopify could not complete/,
  );
});
test("adapter handles a deleted product and malformed pagination explicitly", async () => {
  assert.equal(
    await shopifyAdapter(client([{ data: { product: null } }])).read(raw.id),
    null,
  );
  const invalid = shopifyAdapter(
    client([
      {
        data: {
          products: {
            nodes: [],
            pageInfo: { hasNextPage: true, endCursor: null },
          },
        },
      },
    ]),
  );
  await assert.rejects(invalid.page(null), /invalid pagination/);
});
test("repeated cursors are rejected instead of looping forever", async () => {
  const extra = {
    data: {
      product: {
        metafields: {
          nodes: [],
          pageInfo: { hasNextPage: true, endCursor: "meta-2" },
        },
      },
    },
  };
  const adapter = shopifyAdapter(client([{ data: { product: raw } }, extra]));
  await assert.rejects(adapter.read(raw.id), /invalid pagination/);
  const page = shopifyAdapter(
    client([
      {
        data: {
          products: {
            nodes: [],
            pageInfo: { hasNextPage: true, endCursor: "same" },
          },
        },
      },
    ]),
  );
  await assert.rejects(page.page("same"), /invalid pagination/);
});
