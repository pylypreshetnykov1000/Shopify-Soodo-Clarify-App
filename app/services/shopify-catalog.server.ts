import type { ProductData, Variant } from "../core/catalog";
import type { StoreProfile } from "../core/geo";
export interface GraphqlClient {
  graphql(
    query: string,
    options?: { variables?: Record<string, unknown> },
  ): Promise<Response>;
}
export interface CatalogAdapter {
  read(id: string): Promise<ProductData | null>;
  writeDescription(id: string, html: string): Promise<void>;
  page(
    cursor: string | null,
  ): Promise<{ products: ProductData[]; cursor: string | null }>;
  /** Store details. Optional so simple test adapters need not implement it. */
  store?(): Promise<StoreProfile | null>;
  /** Total products in Shopify, for scan progress. */
  count?(): Promise<number | null>;
}
export class WriteRejectedError extends Error {}
/**
 * Shopify refused a field or operation for lack of an access scope. A denied
 * write did not happen, so it is also a rejected write.
 */
export class AccessDeniedError extends WriteRejectedError {}

/** Products per scan request. Keeps the requested query cost well below 1,000. */
export const PAGE_SIZE = 5;
const REFERENCE = `... on Metaobject { displayName } ... on TaxonomyValue { name }`;
// Resolving category attribute values needs read_metaobjects. Without it the
// scan still works; attributes are counted but their names are not read.
const CATEGORY_REFERENCES = `categoryFields: metafields(first: 10, namespace: "shopify") { nodes { key reference { ${REFERENCE} } references(first: 5) { nodes { ${REFERENCE} } } } }`;
const productFields = (references: boolean) => `fragment CatalogFields on Product {
  id title descriptionHtml productType status updatedAt
  vendor onlineStoreUrl seo { title description }
  category { id name fullName }
  featuredMedia { preview { image { url altText } } }
  mediaCount { count }
  variantsCount { count }
  variants(first: 10) { nodes { id title sku price compareAtPrice availableForSale barcodes(first: 1) { nodes { value } } } }
  ${references ? CATEGORY_REFERENCES : ""}
  metafields(first: 20) { nodes { namespace key value type } pageInfo { hasNextPage endCursor } }
}`;
const pageQuery = (references: boolean) => `query CatalogPage($cursor: String) {
  products(first: ${PAGE_SIZE}, after: $cursor, sortKey: ID) { nodes { ...CatalogFields } pageInfo { hasNextPage endCursor } }
} ${productFields(references)}`;
const readQuery = (references: boolean) =>
  `query CatalogProduct($id: ID!) { product(id: $id) { ...CatalogFields } } ${productFields(references)}`;
export const META_QUERY = `query CatalogMetafields($id: ID!, $cursor: String) {
  product(id: $id) { metafields(first: 100, after: $cursor) { nodes { namespace key value type } pageInfo { hasNextPage endCursor } } }
}`;
export const COUNT_QUERY = `query CatalogCount { productsCount(limit: null) { count } }`;
export const SHOP_QUERY = `query StoreProfile { shop { name contactEmail primaryDomain { url } } }`;
export const POLICIES_QUERY = `query StorePolicies { shop { shopPolicies { type title url body } } }`;
export const WRITE_MUTATION = `mutation CatalogDescription($product: ProductUpdateInput!) {
  productUpdate(product: $product) { product { id } userErrors { field message } }
}`;
type Reference = { displayName?: string; name?: string } | null;
type RawProduct = Omit<ProductData, "image" | "metafields" | "commerce"> & {
  vendor: string;
  onlineStoreUrl: string | null;
  seo: { title: string | null; description: string | null };
  category: { id: string; name: string; fullName: string } | null;
  featuredMedia: { preview: { image: ProductData["image"] } | null } | null;
  mediaCount: { count: number } | null;
  variantsCount: { count: number } | null;
  variants: {
    nodes: (Omit<Variant, "barcodes"> & {
      barcodes: { nodes: { value: string }[] };
    })[];
  };
  categoryFields: {
    nodes: { key: string; reference: Reference; references: { nodes: Reference[] } | null }[];
  };
  metafields: {
    nodes: ProductData["metafields"];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};
type GraphqlError = {
  message: string;
  extensions?: {
    code?: string;
    cost?: {
      requestedQueryCost?: number;
      throttleStatus?: { currentlyAvailable?: number; restoreRate?: number };
    };
  };
};
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function graphql<T>(
  admin: GraphqlClient,
  query: string,
  variables: Record<string, unknown>,
  attempt = 0,
): Promise<T> {
  const response = await admin.graphql(query, { variables });
  const json = (await response.json()) as {
    data?: T;
    errors?: GraphqlError[];
    extensions?: GraphqlError["extensions"];
  };
  const throttled = json.errors?.some((e) => e.extensions?.code === "THROTTLED");
  const denied = json.errors?.find(
    (e) => e.extensions?.code === "ACCESS_DENIED" || /access denied/i.test(e.message),
  );
  if (denied)
    throw new AccessDeniedError(
      "Shopify has not granted Soodo the permission this needs. Open Soodo from your Shopify admin and approve the updated permissions, then try again.",
    );
  if (throttled && attempt < 3) {
    // Wait for enough of the cost bucket to refill, bounded to keep requests short.
    const cost = json.extensions?.cost;
    const needed =
      (cost?.requestedQueryCost ?? 500) -
      (cost?.throttleStatus?.currentlyAvailable ?? 0);
    const rate = cost?.throttleStatus?.restoreRate || 50;
    await wait(Math.min(8_000, Math.max(1_000, (needed / rate) * 1_000)));
    return graphql(admin, query, variables, attempt + 1);
  }
  if (!response.ok || json.errors?.length || !json.data)
    throw new Error(
      throttled
        ? "Shopify is busy. Wait a few seconds and continue; nothing was changed."
        : "Shopify could not complete this request. Please retry; no success has been assumed.",
    );
  return json.data;
}
const referenceName = (ref: Reference) =>
  ref?.displayName?.trim() || ref?.name?.trim() || null;
export function shopifyAdapter(
  admin: GraphqlClient,
  options: { scopes?: string[] } = {},
): CatalogAdapter {
  // Ask for category attribute names only when the scope is granted, and
  // fall back if Shopify still refuses (for example, before re-approval).
  let references = options.scopes ? options.scopes.includes("read_metaobjects") : true;
  async function withFallback<T>(run: (references: boolean) => Promise<T>) {
    try {
      return await run(references);
    } catch (error) {
      if (!(error instanceof AccessDeniedError) || !references) throw error;
      references = false;
      return run(false);
    }
  }
  async function normalize(raw: RawProduct): Promise<ProductData> {
    const metafields = [...raw.metafields.nodes];
    const seen = new Set<string>();
    let info = raw.metafields.pageInfo;
    while (info.hasNextPage) {
      if (!info.endCursor || seen.has(info.endCursor))
        throw new Error("Shopify returned an invalid pagination cursor.");
      seen.add(info.endCursor);
      const extra = await graphql<{
        product: { metafields: RawProduct["metafields"] } | null;
      }>(admin, META_QUERY, { id: raw.id, cursor: info.endCursor });
      if (!extra.product)
        throw new Error(
          "Product was deleted during synchronization. Retry the scan.",
        );
      metafields.push(...extra.product.metafields.nodes);
      info = extra.product.metafields.pageInfo;
    }
    const displays = new Map(
      (raw.categoryFields?.nodes ?? []).map((field) => {
        const names = [
          referenceName(field.reference),
          ...(field.references?.nodes ?? []).map(referenceName),
        ].filter((n): n is string => !!n);
        return [field.key, names.length ? [...new Set(names)].join(", ") : null];
      }),
    );
    return {
      id: raw.id,
      title: raw.title,
      descriptionHtml: raw.descriptionHtml ?? "",
      productType: raw.productType,
      status: raw.status,
      updatedAt: raw.updatedAt,
      image: raw.featuredMedia?.preview?.image ?? null,
      metafields: metafields.map((field) =>
        field.namespace === "shopify" && displays.has(field.key)
          ? { ...field, display: displays.get(field.key) }
          : field,
      ),
      discovery: {
        vendor: raw.vendor,
        onlineStoreUrl: raw.onlineStoreUrl,
        seoTitle: raw.seo.title,
        seoDescription: raw.seo.description,
      },
      commerce: {
        category: raw.category ?? null,
        variants: (raw.variants?.nodes ?? []).map(({ barcodes, ...variant }) => ({
          ...variant,
          barcodes: barcodes.nodes.map((b) => b.value).filter((v) => v.trim()),
        })),
        variantsCount: raw.variantsCount?.count ?? raw.variants?.nodes.length ?? 0,
        mediaCount: raw.mediaCount?.count ?? (raw.featuredMedia ? 1 : 0),
      },
    };
  }
  return {
    async page(cursor) {
      const data = await withFallback((refs) =>
        graphql<{
          products: {
            nodes: RawProduct[];
            pageInfo: { hasNextPage: boolean; endCursor: string | null };
          };
        }>(admin, pageQuery(refs), { cursor }),
      );
      const products: ProductData[] = [];
      for (const raw of data.products.nodes)
        products.push(await normalize(raw));
      if (
        data.products.pageInfo.hasNextPage &&
        (!data.products.pageInfo.endCursor ||
          data.products.pageInfo.endCursor === cursor)
      )
        throw new Error("Shopify returned an invalid pagination cursor.");
      return {
        products,
        cursor: data.products.pageInfo.hasNextPage
          ? data.products.pageInfo.endCursor
          : null,
      };
    },
    async read(id) {
      const data = await withFallback((refs) =>
        graphql<{ product: RawProduct | null }>(admin, readQuery(refs), { id }),
      );
      return data.product ? normalize(data.product) : null;
    },
    async count() {
      try {
        const data = await graphql<{ productsCount: { count: number } | null }>(
          admin,
          COUNT_QUERY,
          {},
        );
        return data.productsCount?.count ?? null;
      } catch {
        return null;
      }
    },
    async store() {
      let shop;
      try {
        shop = (
          await graphql<{
            shop: {
              name: string;
              contactEmail: string | null;
              primaryDomain: { url: string } | null;
            };
          }>(admin, SHOP_QUERY, {})
        ).shop;
      } catch {
        return null;
      }
      let policies: StoreProfile["policies"] = null;
      try {
        const data = await graphql<{
          shop: {
            shopPolicies: { type: string; title: string; url: string; body: string }[];
          };
        }>(admin, POLICIES_QUERY, {});
        policies = data.shop.shopPolicies.map((p) => ({
          type: p.type,
          title: p.title,
          url: p.url,
          filled: !!p.body.replace(/<[^>]*>/g, "").trim(),
        }));
      } catch {
        // Typically read_legal_policies is not granted yet: report "unknown".
      }
      return {
        name: shop.name,
        contactEmail: shop.contactEmail || null,
        primaryDomain: shop.primaryDomain?.url ?? null,
        policies,
      };
    },
    async writeDescription(id, html) {
      const data = await graphql<{
        productUpdate: {
          product: { id: string } | null;
          userErrors: { message: string }[];
        };
      }>(admin, WRITE_MUTATION, { product: { id, descriptionHtml: html } });
      if (data.productUpdate.userErrors.length)
        throw new WriteRejectedError(
          data.productUpdate.userErrors.map((e) => e.message).join("; "),
        );
      if (!data.productUpdate.product)
        throw new Error("Shopify did not confirm a product update.");
    },
  };
}
