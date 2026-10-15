import type { ProductData } from "../core/catalog";
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
}
export class WriteRejectedError extends Error {}
export const PRODUCT_FIELDS = `fragment CatalogFields on Product {
  id title descriptionHtml productType status updatedAt
  vendor onlineStoreUrl seo { title description }
  featuredMedia { preview { image { url altText } } }
  metafields(first: 20) { nodes { namespace key value type } pageInfo { hasNextPage endCursor } }
}`;
export const PAGE_QUERY = `query CatalogPage($cursor: String) {
  products(first: 10, after: $cursor, sortKey: ID) { nodes { ...CatalogFields } pageInfo { hasNextPage endCursor } }
} ${PRODUCT_FIELDS}`;
export const READ_QUERY = `query CatalogProduct($id: ID!) { product(id: $id) { ...CatalogFields } } ${PRODUCT_FIELDS}`;
export const META_QUERY = `query CatalogMetafields($id: ID!, $cursor: String) {
  product(id: $id) { metafields(first: 100, after: $cursor) { nodes { namespace key value type } pageInfo { hasNextPage endCursor } } }
}`;
export const WRITE_MUTATION = `mutation CatalogDescription($product: ProductUpdateInput!) {
  productUpdate(product: $product) { product { id } userErrors { field message } }
}`;
type RawProduct = Omit<ProductData, "image" | "metafields"> & {
  vendor: string;
  onlineStoreUrl: string | null;
  seo: { title: string | null; description: string | null };
  featuredMedia: { preview: { image: ProductData["image"] } | null } | null;
  metafields: {
    nodes: ProductData["metafields"];
    pageInfo: { hasNextPage: boolean; endCursor: string | null };
  };
};
async function graphql<T>(
  admin: GraphqlClient,
  query: string,
  variables: Record<string, unknown>,
) {
  const response = await admin.graphql(query, { variables });
  const json = (await response.json()) as {
    data?: T;
    errors?: { message: string }[];
  };
  if (!response.ok || json.errors?.length || !json.data)
    throw new Error(
      "Shopify could not complete this request. Please retry; no success has been assumed.",
    );
  return json.data;
}
export function shopifyAdapter(admin: GraphqlClient): CatalogAdapter {
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
    return {
      id: raw.id,
      title: raw.title,
      descriptionHtml: raw.descriptionHtml ?? "",
      productType: raw.productType,
      status: raw.status,
      updatedAt: raw.updatedAt,
      image: raw.featuredMedia?.preview?.image ?? null,
      metafields,
      discovery: {
        vendor: raw.vendor,
        onlineStoreUrl: raw.onlineStoreUrl,
        seoTitle: raw.seo.title,
        seoDescription: raw.seo.description,
      },
    };
  }
  return {
    async page(cursor) {
      const data = await graphql<{
        products: {
          nodes: RawProduct[];
          pageInfo: { hasNextPage: boolean; endCursor: string | null };
        };
      }>(admin, PAGE_QUERY, { cursor });
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
      const data = await graphql<{ product: RawProduct | null }>(
        admin,
        READ_QUERY,
        { id },
      );
      return data.product ? normalize(data.product) : null;
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
