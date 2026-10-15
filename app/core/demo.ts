import type { ProductData, Variant } from "./catalog";
import type { StoreProfile } from "./geo";
export const DEMO_SHOP = "demo.soodo.local";
export const DEMO_ORIGIN = "https://trail-supply.example";

// Flat product illustrations, so the demo has thumbnails without network access.
const art = (background: string, shape: string) =>
  `data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 80 80"><rect width="80" height="80" fill="${background}"/>${shape}</svg>`,
  )}`;
const variant = (
  id: string,
  title: string,
  price: string,
  sku: string | null,
  barcode: string | null,
  availableForSale = true,
): Variant => ({
  id: `gid://shopify/ProductVariant/${id}`,
  title,
  sku,
  barcodes: barcode ? [barcode] : [],
  price,
  compareAtPrice: null,
  availableForSale,
});

export const demoProducts: ProductData[] = [
  {
    id: "gid://shopify/Product/demo-1",
    title: "Summit Shell Jacket",
    productType: "Jacket",
    descriptionHtml: "<p>A versatile shell for your next adventure.</p>",
    status: "ACTIVE",
    updatedAt: "2026-10-13T00:00:00Z",
    image: {
      url: art("#d9dfd6", '<path d="M28 20h24l10 12-6 4v24H24V36l-6-4z" fill="#3f5a4a"/>'),
      altText: null,
    },
    metafields: [
      {
        namespace: "custom",
        key: "material",
        value: "100% recycled nylon",
        type: "single_line_text_field",
      },
      {
        namespace: "custom",
        key: "weight",
        value: "320 g (size M)",
        type: "single_line_text_field",
      },
    ],
    commerce: {
      category: null,
      variants: [
        variant("101", "S", "189.00", "SSJ-S", "0840123400011"),
        variant("102", "M", "189.00", "SSJ-M", null),
        variant("103", "L", "189.00", "SSJ-L", null),
      ],
      variantsCount: 3,
      mediaCount: 1,
    },
  },
  {
    id: "gid://shopify/Product/demo-2",
    title: "Trail 28 Backpack",
    productType: "Backpack",
    descriptionHtml:
      "<p>A daypack with room for the essentials.</p><p>Material: Ripstop nylon</p><p>Weight: 780 g</p><p>Dimensions / fit: 52 × 28 × 20 cm</p><p>Intended use: Day hikes</p>",
    status: "ACTIVE",
    updatedAt: "2026-10-13T00:00:00Z",
    image: {
      url: art("#e4ddd0", '<rect x="24" y="18" width="32" height="44" rx="2" fill="#8a5a33"/><rect x="30" y="38" width="20" height="14" fill="#6d4526"/>'),
      altText: "Brown Trail 28 daypack, front view",
    },
    metafields: [],
    commerce: {
      category: {
        id: "gid://shopify/TaxonomyCategory/lb-1",
        name: "Backpacks",
        fullName: "Luggage & Bags > Backpacks",
      },
      variants: [variant("201", "Default Title", "129.00", "T28-BRN", "0840123400028")],
      variantsCount: 1,
      mediaCount: 4,
    },
  },
  {
    id: "gid://shopify/Product/demo-3",
    title: "Basecamp Two Tent",
    productType: "Tent",
    descriptionHtml:
      "<p>A two-person, three-season tent that pitches in minutes and stays taut in wind. The fly and inner pitch together, so the sleeping area stays dry when you set up in rain.</p><p>Material: Polyester flysheet</p><p>Weight: 2.4 kg</p><p>Dimensions / fit: Floor 210 × 130 cm</p><p>Intended use: Three-season camping</p><p>Care instructions: Dry completely before storage</p>",
    status: "ACTIVE",
    updatedAt: "2026-10-13T00:00:00Z",
    image: {
      url: art("#dde3e6", '<path d="M14 60 40 20l26 40z" fill="#4c6b5c"/><path d="M34 60l6-14 6 14z" fill="#24382e"/>'),
      altText: "Green two-person dome tent pitched on grass",
    },
    metafields: [
      {
        namespace: "shopify",
        key: "color-pattern",
        value: '["gid://shopify/Metaobject/1"]',
        type: "list.metaobject_reference",
        display: "Green",
      },
      {
        namespace: "reviews",
        key: "rating",
        value: '{"value":"4.7","scale_min":"1.0","scale_max":"5.0"}',
        type: "rating",
      },
      {
        namespace: "reviews",
        key: "rating_count",
        value: "38",
        type: "number_integer",
      },
    ],
    commerce: {
      category: {
        id: "gid://shopify/TaxonomyCategory/sg-1",
        name: "Tents",
        fullName: "Sporting Goods > Outdoor Recreation > Camping & Hiking > Tents",
      },
      variants: [variant("301", "Default Title", "349.00", "BC2-GRN", "0840123400035")],
      variantsCount: 1,
      mediaCount: 6,
    },
  },
  {
    id: "gid://shopify/Product/demo-4",
    title: "Ridge Fleece",
    productType: "Fleece",
    descriptionHtml: "<p>A comfortable layer for cool mornings.</p>",
    status: "DRAFT",
    updatedAt: "2026-10-13T00:00:00Z",
    image: null,
    metafields: [],
    commerce: {
      category: {
        id: "gid://shopify/TaxonomyCategory/aa-1",
        name: "Fleece Jackets",
        fullName: "Apparel & Accessories > Clothing > Outerwear > Coats & Jackets > Fleece Jackets",
      },
      variants: [variant("401", "M", "79.00", null, null, false)],
      variantsCount: 1,
      mediaCount: 0,
    },
  },
];
for (const product of demoProducts) {
  product.discovery = {
    vendor: "Trail Supply",
    onlineStoreUrl:
      product.status === "ACTIVE"
        ? `${DEMO_ORIGIN}/products/${product.title.toLowerCase().replace(/\s+/g, "-")}`
        : null,
    seoTitle: null,
    seoDescription: null,
  };
}

export const demoStore: StoreProfile = {
  name: "Trail Supply",
  contactEmail: "help@trail-supply.example",
  primaryDomain: DEMO_ORIGIN,
  policies: [
    { type: "REFUND_POLICY", title: "Refund policy", url: `${DEMO_ORIGIN}/policies/refund-policy`, filled: true },
    { type: "PRIVACY_POLICY", title: "Privacy policy", url: `${DEMO_ORIGIN}/policies/privacy-policy`, filled: true },
  ],
};

/** A Shopify-like robots.txt that opts out of one training crawler. */
export const demoRobots = `User-agent: *
Disallow: /admin
Disallow: /cart
Disallow: /checkout
Disallow: /search
Sitemap: ${DEMO_ORIGIN}/sitemap.xml

User-agent: GPTBot
Disallow: /
`;
