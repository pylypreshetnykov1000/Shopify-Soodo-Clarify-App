import { plainText, type Fact, type ProductData } from "./catalog";

/**
 * Search listing (Google title and meta description) suggestions, built only
 * from the product's own data. Nothing is invented: the merchant edits the
 * suggestion before approving it.
 */
export const LISTING_LIMITS = { title: 70, description: 320, idealDescription: 160 } as const;
export type Listing = { title: string; description: string };

export const currentListing = (product: ProductData): Listing => ({
  title: product.discovery?.seoTitle?.trim() ?? "",
  description: product.discovery?.seoDescription?.trim() ?? "",
});

/** Cut at a word boundary so text never ends mid-word. */
export function fitWords(text: string, max: number) {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max + 1);
  const space = cut.lastIndexOf(" ");
  return (space > max * 0.6 ? cut.slice(0, space) : clean.slice(0, max)).replace(/[\s,;:–-]+$/, "");
}

/** Sentences of the description, without Soodo's specifications block. */
function descriptionSentences(product: ProductData) {
  const text = plainText(product.descriptionHtml.replace(/<div[^>]*data-soodo-specs[\s\S]*$/i, ""));
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !/^[^:]{1,40}:\s/.test(line))
    .join(" ")
    .split(/(?<=[.!?])\s+/)
    .filter(Boolean);
}

export function suggestListing(product: ProductData, facts: Fact[]): Listing {
  const title = product.title.trim();
  const brand = product.discovery?.vendor?.trim() ?? "";
  const category = product.commerce?.category?.name?.trim() ?? "";
  const lower = title.toLowerCase();
  const withBrand = brand && !lower.includes(brand.toLowerCase()) ? ` | ${brand}` : "";
  const withCategory = category && !lower.includes(category.toLowerCase()) ? ` – ${category}` : "";
  const candidates = [`${title}${withCategory}${withBrand}`, `${title}${withBrand}`, title];
  const seoTitle =
    candidates.find((c) => c.length <= LISTING_LIMITS.title) ?? fitWords(title, LISTING_LIMITS.title);

  let description = "";
  for (const sentence of descriptionSentences(product)) {
    const next = description ? `${description} ${sentence}` : sentence;
    if (next.length > LISTING_LIMITS.idealDescription) break;
    description = next;
  }
  // Short or missing descriptions are completed with verified facts.
  for (const fact of facts) {
    const addition = `${fact.label}: ${fact.value}.`;
    const next = description ? `${description} ${addition}` : addition;
    if (next.length > LISTING_LIMITS.idealDescription) break;
    description = next;
  }
  if (!description) description = brand ? `${title} by ${brand}.` : `${title}.`;
  return { title: seoTitle, description: fitWords(description, LISTING_LIMITS.idealDescription) };
}

export function validateListing(listing: Listing): Listing {
  const title = listing.title.replace(/\s+/g, " ").trim();
  const description = listing.description.replace(/\s+/g, " ").trim();
  if (!title) throw new Error("Add a title for the search listing.");
  if (title.length > LISTING_LIMITS.title)
    throw new Error(`Keep the title to ${LISTING_LIMITS.title} characters or fewer so it isn’t cut off.`);
  if (!description) throw new Error("Add a description for the search listing.");
  if (description.length > LISTING_LIMITS.description)
    throw new Error(`Keep the description to ${LISTING_LIMITS.description} characters or fewer.`);
  if ([...title + description].some((c) => c.charCodeAt(0) < 32))
    throw new Error("The listing must be plain text.");
  return { title, description };
}

export const sameListing = (a: Listing, b: Listing) =>
  a.title.replace(/\s+/g, " ").trim() === b.title.replace(/\s+/g, " ").trim() &&
  a.description.replace(/\s+/g, " ").trim() === b.description.replace(/\s+/g, " ").trim();
