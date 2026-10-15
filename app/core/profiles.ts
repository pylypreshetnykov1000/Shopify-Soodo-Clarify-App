/**
 * Specification checklists by product family. Each profile lists the buyer
 * facts that matter most for that kind of product. Profiles are chosen from the
 * product's Shopify standard category, or fixed by the merchant in Settings.
 */
export type Rule = {
  key: string;
  label: string;
  question: string;
  aliases: readonly string[];
  hint: string;
};

const LIBRARY = {
  material: {
    label: "Material",
    question: "What is it made from?",
    aliases: ["material", "materials", "fabric", "fabric_type", "upper_material", "frame_material"],
    hint: "For example: 100% recycled nylon. Use the manufacturer's specification.",
  },
  weight: {
    label: "Weight",
    question: "How much does it weigh?",
    aliases: ["weight", "product_weight", "packed_weight", "net_weight", "item_weight"],
    hint: "Include a unit and specify the size or variant when relevant.",
  },
  dimensions: {
    label: "Dimensions / fit",
    question: "What are its dimensions or fit?",
    aliases: ["dimensions", "size_guide", "fit", "packed_size", "product_dimensions", "size_chart"],
    hint: "Include units, or a useful fit description for apparel.",
  },
  use: {
    label: "Intended use",
    question: "What is it designed for?",
    aliases: ["intended_use", "best_for", "use_case", "recommended_use", "activity", "suitable_for"],
    hint: "Describe the activity, person, or situation this product is designed for.",
  },
  care: {
    label: "Care instructions",
    question: "How should it be cared for?",
    aliases: ["care", "care_instructions", "care_guide", "washing_instructions"],
    hint: "Use verified washing, cleaning, or storage instructions.",
  },
  color: {
    label: "Color",
    question: "Which colors are available?",
    aliases: ["color", "colour", "color_pattern", "colors"],
    hint: "Name the actual color as a shopper would describe it.",
  },
  ingredients: {
    label: "Ingredients",
    question: "What does it contain?",
    aliases: ["ingredients", "ingredient_list", "key_ingredients", "inci"],
    hint: "Copy the ingredient list from the packaging or supplier sheet.",
  },
  how_to_use: {
    label: "How to use",
    question: "How is it used?",
    aliases: ["how_to_use", "directions", "usage", "instructions", "application"],
    hint: "Short, verified usage directions.",
  },
  volume: {
    label: "Size / volume",
    question: "How much is in it?",
    aliases: ["volume", "net_content", "net_volume", "capacity", "net_contents", "size"],
    hint: "Include a unit, for example 50 ml or 1.5 L.",
  },
  compatibility: {
    label: "Compatibility",
    question: "What does it work with?",
    aliases: ["compatibility", "compatible_with", "compatible_devices", "compatible_models"],
    hint: "List devices, models, or systems it is confirmed to work with.",
  },
  power: {
    label: "Power / battery",
    question: "How is it powered?",
    aliases: ["power", "power_source", "battery", "battery_life", "battery_type"],
    hint: "Power source and verified battery life, with test conditions if known.",
  },
  warranty: {
    label: "Warranty",
    question: "What warranty does it have?",
    aliases: ["warranty", "guarantee", "warranty_period"],
    hint: "Length and scope of the warranty.",
  },
  allergens: {
    label: "Allergens",
    question: "Which allergens does it contain?",
    aliases: ["allergens", "allergen_information", "contains"],
    hint: "Declared allergens from the label. Write 'None declared' only if verified.",
  },
  storage: {
    label: "Storage",
    question: "How should it be stored?",
    aliases: ["storage", "storage_instructions", "shelf_life"],
    hint: "Storage conditions and shelf life from the label.",
  },
} as const;

export type FactKey = keyof typeof LIBRARY;

export const PROFILES = {
  outdoor: {
    label: "Outdoor & sports gear",
    keys: ["material", "weight", "dimensions", "use", "care"],
  },
  apparel: {
    label: "Apparel & accessories",
    keys: ["material", "dimensions", "color", "care"],
  },
  beauty: {
    label: "Health & beauty",
    keys: ["ingredients", "how_to_use", "volume", "use"],
  },
  electronics: {
    label: "Electronics",
    keys: ["dimensions", "weight", "compatibility", "power", "warranty"],
  },
  home: {
    label: "Home & furniture",
    keys: ["material", "dimensions", "color", "care"],
  },
  food: {
    label: "Food & drink",
    keys: ["ingredients", "allergens", "weight", "storage"],
  },
  general: {
    label: "General products",
    keys: ["material", "dimensions", "weight", "use"],
  },
} as const satisfies Record<string, { label: string; keys: readonly FactKey[] }>;

export type ProfileKey = keyof typeof PROFILES;
export type ProfileSetting = ProfileKey | "auto";
export const PROFILE_KEYS = Object.keys(PROFILES) as ProfileKey[];

export function isProfileSetting(value: unknown): value is ProfileSetting {
  return value === "auto" || PROFILE_KEYS.includes(value as ProfileKey);
}

export function rulesFor(profile: ProfileKey): Rule[] {
  return PROFILES[profile].keys.map((key) => ({ key, ...LIBRARY[key] }));
}

/** Every rule, for recognizing facts that may belong to any profile. */
export const ALL_RULES: Rule[] = (Object.keys(LIBRARY) as FactKey[]).map(
  (key) => ({ key, ...LIBRARY[key] }),
);

// Ordered: the first matching category path segment wins.
const CATEGORY_MAP: [RegExp, ProfileKey][] = [
  [/camping|hiking|climbing|outdoor recreation|cycling|fishing|hunting|winter sports|water sports/i, "outdoor"],
  [/^sporting goods/i, "outdoor"],
  [/^luggage & bags/i, "outdoor"],
  [/^apparel & accessories/i, "apparel"],
  [/^health & beauty/i, "beauty"],
  [/^(electronics|cameras & optics)/i, "electronics"],
  [/^(home & garden|furniture)/i, "home"],
  [/^food, beverages/i, "food"],
];

export function profileForCategory(fullName?: string | null): ProfileKey | null {
  if (!fullName) return null;
  for (const [pattern, profile] of CATEGORY_MAP)
    if (pattern.test(fullName)) return profile;
  return null;
}

export function resolveProfile(
  category: { fullName: string } | null | undefined,
  setting: string,
): ProfileKey {
  if (isProfileSetting(setting) && setting !== "auto") return setting;
  return profileForCategory(category?.fullName) ?? "general";
}
