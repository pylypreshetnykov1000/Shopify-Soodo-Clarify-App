import type { ProductData } from "./catalog";
export const DEMO_SHOP = "demo.soodo.local";
export const demoProducts: ProductData[] = [
  {
    id: "gid://shopify/Product/demo-1",
    title: "Summit Shell Jacket",
    productType: "Jacket",
    descriptionHtml: "<p>A versatile shell for your next adventure.</p>",
    status: "ACTIVE",
    updatedAt: "2026-10-13T00:00:00Z",
    image: null,
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
  },
  {
    id: "gid://shopify/Product/demo-2",
    title: "Trail 28 Backpack",
    productType: "Backpack",
    descriptionHtml:
      "<p>A daypack with room for the essentials.</p><p>Material: Ripstop nylon</p><p>Weight: 780 g</p><p>Dimensions / fit: 52 × 28 × 20 cm</p><p>Intended use: Day hikes</p>",
    status: "ACTIVE",
    updatedAt: "2026-10-13T00:00:00Z",
    image: null,
    metafields: [],
  },
  {
    id: "gid://shopify/Product/demo-3",
    title: "Basecamp Two Tent",
    productType: "Tent",
    descriptionHtml:
      "<p>Material: Polyester flysheet</p><p>Weight: 2.4 kg</p><p>Dimensions / fit: Floor 210 × 130 cm</p><p>Intended use: Three-season camping</p><p>Care instructions: Dry completely before storage</p>",
    status: "ACTIVE",
    updatedAt: "2026-10-13T00:00:00Z",
    image: null,
    metafields: [],
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
  },
];
for (const product of demoProducts) {
  product.discovery = {
    vendor: "Trail Supply",
    onlineStoreUrl:
      product.status === "ACTIVE"
        ? `https://trail-supply.example/products/${product.title.toLowerCase().replace(/\s+/g, "-")}`
        : null,
    seoTitle: null,
    seoDescription: null,
  };
}
