import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AccessDeniedError,
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
test("adapter imports category, variants, barcodes and resolved category attributes", async () => {
  const adapter = shopifyAdapter(
    client([
      {
        data: {
          product: {
            ...raw,
            metafields: {
              nodes: [
                {
                  namespace: "shopify",
                  key: "color-pattern",
                  value: '["gid://shopify/Metaobject/1","gid://shopify/Metaobject/2"]',
                  type: "list.metaobject_reference",
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
            category: { id: "gid://shopify/TaxonomyCategory/lb-1", name: "Backpacks", fullName: "Luggage & Bags > Backpacks" },
            mediaCount: { count: 3 },
            variantsCount: { count: 14 },
            variants: {
              nodes: [
                { id: "v1", title: "Red", sku: "P-R", price: "50.00", compareAtPrice: null, availableForSale: true, barcodes: { nodes: [{ value: "0840123400011" }] } },
                { id: "v2", title: "Blue", sku: null, price: "50.00", compareAtPrice: null, availableForSale: false, barcodes: { nodes: [{ value: " " }] } },
              ],
            },
            categoryFields: {
              nodes: [
                {
                  key: "color-pattern",
                  reference: null,
                  references: { nodes: [{ displayName: "Red" }, { displayName: "Blue" }] },
                },
              ],
            },
          },
        },
      },
    ]),
  );
  const product = (await adapter.read(raw.id))!;
  assert.equal(product.commerce?.category?.name, "Backpacks");
  assert.equal(product.commerce?.variantsCount, 14);
  assert.equal(product.commerce?.mediaCount, 3);
  assert.deepEqual(product.commerce?.variants.map((v) => v.barcodes), [["0840123400011"], []]);
  assert.equal(product.metafields[0].display, "Red, Blue");
});
test("adapter waits and retries when Shopify throttles a query", async () => {
  const throttled = {
    errors: [{ message: "Throttled", extensions: { code: "THROTTLED" } }],
    extensions: { cost: { requestedQueryCost: 100, throttleStatus: { currentlyAvailable: 50, restoreRate: 100 } } },
  };
  const adapter = shopifyAdapter(client([throttled, { data: { product: null } }]));
  assert.equal(await adapter.read(raw.id), null);
  const exhausted = shopifyAdapter(client([throttled, throttled, throttled, throttled]));
  await assert.rejects(exhausted.read(raw.id), /Shopify is busy/);
});
test("store details survive a missing policy permission", async () => {
  const adapter = shopifyAdapter(
    client([
      { data: { shop: { name: "Trail", contactEmail: "", primaryDomain: { url: "https://trail.example" } } } },
      { errors: [{ message: "Access denied for shopPolicies field." }] },
    ]),
  );
  assert.deepEqual(await adapter.store!(), {
    name: "Trail",
    contactEmail: null,
    primaryDomain: "https://trail.example",
    policies: null,
  });
  const policies = shopifyAdapter(
    client([
      { data: { shop: { name: "Trail", contactEmail: "a@b.example", primaryDomain: null } } },
      { data: { shop: { shopPolicies: [
        { type: "REFUND_POLICY", title: "Refund", url: "https://trail.example/policies/refund-policy", body: "<p>30 days</p>" },
        { type: "SHIPPING_POLICY", title: "Shipping", url: "https://trail.example/policies/shipping-policy", body: "<p> </p>" },
      ] } } },
    ]),
  );
  assert.deepEqual((await policies.store!())?.policies?.map((p) => p.filled), [true, false]);
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
function recording(results: unknown[]) {
  const queries: string[] = [];
  const graphqlClient: GraphqlClient = {
    async graphql(query) {
      queries.push(query);
      if (!results.length) throw new Error("Unexpected extra GraphQL request");
      return Response.json(results.shift());
    },
  };
  return { graphqlClient, queries };
}
const plainProduct = {
  ...raw,
  metafields: { nodes: [], pageInfo: { hasNextPage: false, endCursor: null } },
};
test("without read_metaobjects the adapter never asks for category attribute names", async () => {
  const { graphqlClient, queries } = recording([{ data: { product: plainProduct } }]);
  const adapter = shopifyAdapter(graphqlClient, { scopes: ["read_products", "write_products"] });
  assert.equal((await adapter.read(raw.id))?.title, "Pack");
  assert.ok(!queries[0].includes("categoryFields"));
});
test("an access-denied product query falls back to the basic fields instead of failing", async () => {
  const denied = {
    errors: [{ message: "Access denied for reference field.", extensions: { code: "ACCESS_DENIED" } }],
  };
  const { graphqlClient, queries } = recording([denied, { data: { product: plainProduct } }, { data: { product: plainProduct } }]);
  const adapter = shopifyAdapter(graphqlClient);
  assert.equal((await adapter.read(raw.id))?.title, "Pack");
  assert.ok(queries[0].includes("categoryFields"));
  assert.ok(!queries[1].includes("categoryFields"));
  // The adapter remembers, so later reads go straight to the basic query.
  await adapter.read(raw.id);
  assert.ok(!queries[2].includes("categoryFields"));
});
test("a denied write is a rejected write with a clear permission message", async () => {
  const adapter = shopifyAdapter(
    client([{ errors: [{ message: "Access denied", extensions: { code: "ACCESS_DENIED" } }] }]),
  );
  await assert.rejects(adapter.writeDescription(raw.id, "<p>x</p>"), (error: unknown) => {
    assert.ok(error instanceof AccessDeniedError);
    assert.ok(error instanceof WriteRejectedError);
    assert.match((error as Error).message, /approve the updated permissions/);
    return true;
  });
});
