/**
 * The Soodo GEO user guide as data, shared by the in-app Help panel and the
 * Help page. Screenshots live in public/guide (captured from the demo store).
 * Keep the wording in step with docs/guide when screens change.
 */
export type GuideLegend = { title: string; text: string };
export type GuidePlate = {
  image: string;
  alt: string;
  caption: string;
  width: number;
  height: number;
  legend: GuideLegend[];
};
export type GuideChapter = {
  id: GuideTopic;
  number: string;
  kicker: string;
  title: string;
  why: string;
  plates: GuidePlate[];
  notes?: { kind: "tip" | "warning"; title: string; text: string }[];
};
export type GuideTopic =
  | "overview"
  | "sales"
  | "visibility"
  | "listing"
  | "scan"
  | "products"
  | "product"
  | "specs"
  | "publish"
  | "live"
  | "fixes"
  | "history"
  | "settings"
  | "content"
  | "performance";

export const GUIDE_PDF = "/guide/Soodo-GEO-User-Guide.pdf";
const img = (name: string) => `/guide/${name}.jpg`;

export const WORKFLOW = [
  { title: "Scan catalog", text: "Imports products, variants, categories and store policies. Read-only." },
  { title: "Check live pages", text: "Opens each published product page and robots.txt, the way a crawler does." },
  {
    title: "Fix issues",
    text: "Work through the action plan. Most fixes are made in Shopify; missing specifications are added through Soodo.",
  },
  { title: "Review and publish", text: "Approve the proposed description. Soodo publishes it and checks the result." },
];

export const CHAPTERS: GuideChapter[] = [
  {
    id: "overview",
    number: "01",
    kicker: "Home screen",
    title: "Dashboard",
    why: "The Dashboard answers three questions: how ready are my products, does AI recommend me, and what should I do next?",
    plates: [
      {
        image: img("17-simple-overview"),
        alt: "Dashboard: AI readiness score, AI visibility, products ready, things to fix, next steps, who AI recommends and sales from AI assistants",
        caption: "Dashboard",
        width: 1584,
        height: 1368,
        legend: [
          { title: "AI readiness score", text: "One score from 0 to 100 with a plain label: Needs work below 50, Getting there from 50, Good from 80 (the mark on the bar)." },
          { title: "AI visibility", text: "How often Gemini named or cited your store in the last visibility test. Next to it: how many active products have nothing left to fix, and how many fixes are open." },
          { title: "Your next steps", text: "The three most useful things to do now, in plain words. Start at the top; each button takes you there or starts the job." },
          { title: "Who AI recommends", text: "From the last visibility test: how often you appeared, and the brands Gemini suggested most instead." },
          { title: "Sales from AI assistants", text: "Orders and revenue from ChatGPT, Perplexity, Gemini and others in the last 30 days. The breakdown is on Performance." },
          { title: "Help", text: "Opens this guide for the screen you’re on. You can also press ?." },
        ],
      },
    ],
  },

  {
    id: "visibility",
    number: "02",
    kicker: "Results",
    title: "AI visibility",
    why: "Shoppers increasingly ask AI assistants what to buy. This test shows whether Gemini recommends your store, who it recommends instead, and which websites it trusts.",
    plates: [
      {
        image: img("22-visibility"),
        alt: "AI visibility: score, questions where the store was recommended, competitors and cited websites",
        caption: "AI visibility, after a test",
        width: 1584,
        height: 2136,
        legend: [
          { title: "AI visibility score", text: "The share of shopper questions where Gemini recommended your store or a product by name, or cited your website. 50 or more is strong; below 20 is low." },
          { title: "Recommended most instead", text: "The brand or store Gemini suggested most often in place of you." },
          { title: "Shopper questions", text: "Each question Soodo asked, whether you appeared, and who was suggested. Open one to read Gemini's full answer and the sites it used." },
          { title: "Recommended instead of you", text: "Brands and stores named across all answers. “You sell this brand” marks brands in your own catalog." },
          { title: "Websites Gemini relies on", text: "Review sites, forums and stores it read. Appearing on these sites makes you more likely to be recommended." },
          { title: "Run test again", text: "Asks a fresh set of questions. Run it weekly and compare the score over time." },
        ],
      },
    ],
    notes: [
      {
        kind: "tip",
        title: "Why answers change",
        text: "AI assistants don't give the same answer twice, and they search the web as they answer. Read the score as a trend across weekly tests, not as an exact figure for one day.",
      },
      {
        kind: "tip",
        title: "What Soodo sends to Gemini",
        text: "Your product types, example product names and price ranges, to write the questions. The questions themselves never name your store. No customer or order data is sent.",
      },
    ],
  },
  {
    id: "fixes",
    number: "03",
    kicker: "Step 3 · across products",
    title: "Action plan",
    why: "Every open fix across your active products, ranked by impact. Fix the same issue on several products in one pass.",
    plates: [
      {
        image: img("13-fix-plan"),
        alt: "Action plan with store-wide issue, area and priority filters, and an expanded fix",
        caption: "Action plan with one fix opened",
        width: 1584,
        height: 1179,
        legend: [
          { title: "Store-wide", text: "One change in Shopify settings helps every product." },
          { title: "Area filter", text: "Show fixes for one area only." },
          { title: "Priority filter", text: "Click High, Medium or Low; click again to clear." },
          { title: "Impact", text: "How many active products the fix affects." },
          {
            title: "How and where",
            text: "What to do, and whether it’s done in Soodo, the Shopify product editor or your theme.",
          },
          { title: "Affected products", text: "Open takes you to the right tab of that product." },
        ],
      },
    ],
  },
  {
    id: "content",
    number: "04",
    kicker: "Writing",
    title: "Content",
    why: "Everything Soodo writes for your products, in one place: drafts waiting for you, products whose text needs work, and what you have published.",
    plates: [
      {
        image: img("23-content"),
        alt: "Content: drafts waiting for review, products that need better content, and recently published changes",
        caption: "Content",
        width: 1584,
        height: 858,
        legend: [
          { title: "At a glance", text: "Drafts waiting for you, products whose description, facts or search listing need work, and changes published from Soodo." },
          { title: "Waiting for your review", text: "Descriptions and search listings drafted but not yet published. Review opens the draft on the product." },
          { title: "Products that need better content", text: "Most issues first. Description opens the product's specifications to draft a description; Listing opens its search listing." },
          { title: "Recently published", text: "The latest changes. Every one is saved and can be restored from History." },
        ],
      },
    ],
  },
  {
    id: "performance",
    number: "05",
    kicker: "Results",
    title: "Performance",
    why: "Whether the work is paying off: readiness by area and over time, AI visibility test by test, and sales from AI assistants.",
    plates: [
      {
        image: img("24-performance"),
        alt: "Performance: readiness by area, sales from AI assistants, AI visibility over time, readiness over time and products by readiness",
        caption: "Performance",
        width: 1584,
        height: 1579,
        legend: [
          { title: "Readiness by area", text: "Share of products that pass each area. “Run live checks to measure” means that area waits on the live page check. Click a tile to see its fixes." },
          { title: "Sales from AI assistants", text: "Orders and revenue from AI assistants, by assistant, with the latest orders." },
          { title: "AI visibility over time", text: "The score of each visibility test. Run a test weekly to build the trend." },
          { title: "Readiness over time", text: "One reading per day, saved after scans, live checks and published changes." },
          { title: "Products by readiness", text: "How many products are Strong, Good, Fair or Weak, so a good average can’t hide weak products." },
        ],
      },
      {
        image: img("05-trend-tooltip"),
        alt: "Readiness chart with a tooltip showing date, readiness and open fixes",
        caption: "Hover the chart, or focus it and use the arrow keys",
        width: 1584,
        height: 495,
        legend: [
          {
            title: "Daily detail",
            text: "The date, the readiness score, how many products were fully ready and how many fixes were open that day.",
          },
        ],
      },
    ],
  },
  {
    id: "sales",
    number: "06",
    kicker: "Results",
    title: "Sales from AI assistants",
    why: "The clearest sign your work is paying off: orders from shoppers who found you through an AI assistant.",
    plates: [
      {
        image: img("18-ai-sales"),
        alt: "Sales from AI assistants: orders, revenue, revenue by assistant and recent orders",
        caption: "Sales from AI assistants, last 30 days",
        width: 1584,
        height: 1033,
        legend: [
          { title: "Orders", text: "Orders in the last 30 days whose visit came from an AI assistant, out of all your orders." },
          { title: "Revenue", text: "What those orders were worth, and their share of all your sales." },
          { title: "By assistant", text: "Which assistants sent the most revenue." },
          { title: "Recent orders", text: "The latest AI-referred orders and the product page they landed on." },
          { title: "Refresh", text: "Updates the figures. Soodo also refreshes them automatically when you open the Dashboard or Performance." },
        ],
      },
    ],
    notes: [
      {
        kind: "tip",
        title: "How it’s counted",
        text: "Shopify records the website each visit came from. Soodo counts orders whose first or last visit came from chatgpt.com, perplexity.ai, gemini.google.com, Copilot, Claude and similar. Some assistants don’t pass this on, so the real number can be higher. Soodo never reads who placed an order.",
      },
    ],
  },
  {
    id: "scan",
    number: "07",
    kicker: "Steps 1 and 2",
    title: "Scan and live checks",
    why: "Both jobs run in small batches with a progress bar, so large catalogs never time out. You can pause and continue later; finished work is kept.",
    plates: [
      {
        image: img("21-get-started"),
        alt: "First visit: Get started runs the import and the page check in one go",
        caption: "Your first visit",
        width: 1584,
        height: 662,
        legend: [
          { title: "Get started", text: "Imports your products, then checks your pages, in one click. It changes nothing in your store." },
        ],
      },
      {
        image: img("02-live-progress"),
        alt: "Live page check in progress with a progress bar and a Pause button",
        caption: "A live check in progress",
        width: 1584,
        height: 291,
        legend: [
          { title: "Progress", text: "What is running and how much is left." },
          {
            title: "Pause",
            text: "Stops after the current batch. Press Continue scan or Check live pages to carry on.",
          },
        ],
      },
    ],
    notes: [
      {
        kind: "tip",
        title: "Good to know",
        text: "Only products on the Online Store sales channel have a public page, so only those get a live check.",
      },
    ],
  },
  {
    id: "products",
    number: "08",
    kicker: "Catalog",
    title: "Products",
    why: "Every product with its score, its next fix and its live page status. Click anywhere on a row to open the product.",
    plates: [
      {
        image: img("06-products"),
        alt: "Products table with filters, search, sorting, readiness, next fix and live page columns",
        caption: "Products",
        width: 1584,
        height: 764,
        legend: [
          { title: "Filters", text: "All, Needs fixes, Draft ready and Ready, with counts." },
          { title: "Search", text: "By product name, type or category." },
          { title: "Sort", text: "Needs attention first is the default. You can also click a column header." },
          { title: "Readiness", text: "The product’s score out of 100. Red under 50, amber under 80, green from 80." },
          { title: "Next fix", text: "The most important open fix, with its priority and how many more there are." },
          {
            title: "Live page",
            text: "Passing, Issues, Not checked, or No page if the product isn’t on the Online Store.",
          },
          { title: "Open a product", text: "The whole row is clickable." },
        ],
      },
    ],
  },
  {
    id: "product",
    number: "09",
    kicker: "Product page",
    title: "A product’s checks",
    why: "Each product has three tabs: Checks, Specifications and Live page. Checks lists what to fix, grouped by area, with the most important one already open.",
    plates: [
      {
        image: img("07-product-checks"),
        alt: "Product page with readiness dial, tabs, an open check with advice, the by-area summary and the live page summary",
        caption: "Summit Shell Jacket, Checks tab",
        width: 1584,
        height: 1373,
        legend: [
          { title: "Product readiness", text: "This product’s score out of 100." },
          {
            title: "Tabs",
            text: "The number on Checks is how many fixes are open. Specifications shows how many key facts were found.",
          },
          {
            title: "A check",
            text: "The problem in one line. Click it to see what to do and the button that takes you there. One check is open at a time.",
          },
          { title: "By area", text: "How many checks passed in each area." },
          { title: "Live page summary", text: "The result of the last live check, with a link to the details." },
        ],
      },
    ],
    notes: [
      {
        kind: "tip",
        title: "Colour key",
        text: "Red square: high priority. Amber: medium. Grey-blue: low. Green: passed. Hollow square: not checked yet.",
      },
    ],
  },
  {
    id: "specs",
    number: "10",
    kicker: "Step 3 · in Soodo",
    title: "Adding specifications",
    why: "Assistants answer buyers’ questions from what is written on the page. Soodo finds the key facts for each type of product and helps you write the missing ones into the description.",
    plates: [
      {
        image: img("08-specifications"),
        alt: "Specifications tab with step tracker, found and missing facts, confirmation and Create description draft button",
        caption: "Specifications tab, three missing facts filled in",
        width: 1584,
        height: 1102,
        legend: [
          { title: "Where you are", text: "Add verified facts, review the draft, publish." },
          {
            title: "Found",
            text: "Already known from your product data. The source is shown underneath. These fields are locked; change them in Shopify.",
          },
          { title: "Missing", text: "Type the value only if you have verified it. Leave anything you don’t know empty." },
          { title: "Options", text: "Add a short buyer Q&A built from these facts (on by default), and tick to confirm the values are accurate." },
          { title: "Create description draft", text: "Makes a draft. Nothing changes in your store yet." },
        ],
      },
      {
        image: img("09-buyer-questions"),
        alt: "Buyer questions with status badges",
        caption: "Buyer questions on the same tab",
        width: 1584,
        height: 820,
        legend: [
          {
            title: "Buyer questions",
            text: "What an assistant could answer from your facts. “Stored fact only” means the fact exists in Shopify but may not show on the page, so add it to the description. Soodo never guesses an answer.",
          },
        ],
      },
    ],
  },
  {
    id: "listing",
    number: "11",
    kicker: "Product page",
    title: "Search listing",
    why: "The title and short description people see on Google, and that AI answers often quote. Soodo suggests one from your product data; you edit and approve it.",
    plates: [
      {
        image: img("19-search-listing"),
        alt: "Search listing tab with title and description fields, character counters, a live Google-style preview and the current listing",
        caption: "Search listing tab",
        width: 1584,
        height: 1062,
        legend: [
          { title: "Title", text: "Up to 70 characters, so Google doesn’t cut it off. The counter turns red if it’s too long." },
          { title: "Description", text: "One or two factual sentences. Google usually shows about 160 characters." },
          { title: "Preview", text: "How the listing will look in search results, updated as you type." },
          { title: "Use suggestion", text: "Puts back the suggestion built from your product’s title, brand, category, description and verified facts." },
          { title: "Create listing draft", text: "Makes a draft to review. Nothing changes in your store yet." },
          { title: "On Google now", text: "Your current listing. Without a custom listing, Google uses the product title and description." },
        ],
      },
      {
        image: img("20-listing-review"),
        alt: "Search listing review: now versus proposed, approval and publish",
        caption: "Reviewing a listing draft",
        width: 1584,
        height: 668,
        legend: [
          { title: "Now and proposed", text: "Side by side, as they would appear on Google." },
          { title: "Approve and publish", text: "Tick to approve, then publish. Soodo checks the result, and Change history keeps the previous listing so you can restore it." },
        ],
      },
    ],
  },
  {
    id: "publish",
    number: "12",
    kicker: "Step 4",
    title: "Review and publish",
    why: "You always see the exact wording before anything is published. Soodo keeps your existing text and adds one clear specifications list at the end.",
    plates: [
      {
        image: img("10-draft-review"),
        alt: "Draft review comparing current and proposed descriptions, with sources, approval checkbox, Publish and Reject buttons",
        caption: "Draft review",
        width: 1584,
        height: 1412,
        legend: [
          { title: "Current", text: "The description in your store today." },
          { title: "Proposed", text: "Your text, plus the specifications list." },
          { title: "Sources", text: "Where each value came from: your product data, or you." },
          { title: "Approve", text: "Required before publishing." },
          {
            title: "Publish",
            text: "Soodo re-reads the product, publishes, then reads it back to confirm the change landed.",
          },
          { title: "Reject draft", text: "Discards the draft. Your product is not changed." },
        ],
      },
    ],
    notes: [
      {
        kind: "warning",
        title: "If the product changed",
        text: "If someone edits the product in Shopify after the draft was made, Soodo stops and asks you to create a fresh draft. It never overwrites newer edits.",
      },
    ],
  },
  {
    id: "live",
    number: "13",
    kicker: "Product page",
    title: "Live page",
    why: "What search engines and AI assistants actually see when they open the product page.",
    plates: [
      {
        image: img("12-live-page"),
        alt: "Live page results and crawler access list",
        caption: "Basecamp Two Tent, Live page tab",
        width: 1584,
        height: 1201,
        legend: [
          {
            title: "Page results",
            text: "Is the page reachable and indexable, and does its product data match Shopify?",
          },
          {
            title: "A problem found",
            text: "Here the page has two product markup blocks, usually left by an old app or theme edit. Search engines may ignore conflicting markup.",
          },
          {
            title: "Search and assistant crawlers",
            text: "Allowed or blocked by your robots.txt. These should be allowed.",
          },
          {
            title: "Training crawlers",
            text: "Used to train AI models. Blocking them is your choice and doesn’t affect search results.",
          },
          { title: "Check again", text: "Re-runs the check after you fix something." },
        ],
      },
    ],
  },

  {
    id: "history",
    number: "14",
    kicker: "Undo",
    title: "Change history",
    why: "Every description Soodo published, with the version it replaced.",
    plates: [
      {
        image: img("14-history"),
        alt: "Change history entry with status, saved descriptions and restore controls",
        caption: "Change history",
        width: 1584,
        height: 1053,
        legend: [
          { title: "When", text: "Date and time of the change (UTC)." },
          { title: "Status", text: "Published, restored, or a state that needs checking." },
          { title: "Saved descriptions", text: "The version before and the version published, side by side." },
          {
            title: "Restore",
            text: "Tick and press Restore to put the previous description back. Restore is blocked if the product was edited afterwards, so newer work is never lost.",
          },
        ],
      },
    ],
    notes: [
      {
        kind: "warning",
        title: "“Verify saved result”",
        text: "If the connection drops while publishing, Soodo can’t be sure the change landed. It blocks further changes to that product and shows Verify saved result. Press it; Soodo reads the product and settles the status.",
      },
    ],
  },
  {
    id: "settings",
    number: "15",
    kicker: "Setup",
    title: "Settings and permissions",
    why: "Choose which specification checklist applies, and see which Shopify permissions Soodo has.",
    plates: [
      {
        image: img("15-settings"),
        alt: "Settings: checklist choices, save button, permissions and publishing rules",
        caption: "Settings",
        width: 1584,
        height: 1959,
        legend: [
          {
            title: "Specification checklist",
            text: "Automatic picks the right facts for each product from its Shopify category. Choose a fixed list if your whole catalog is one type.",
          },
          { title: "Save checklist", text: "Applies immediately to every product." },
          {
            title: "Permissions",
            text: "What Soodo can read and write. A permission marked “Not approved yet” means some checks show as not checked until you approve it.",
          },
          {
            title: "Publishing rules",
            text: "Approval is always required, your text is kept, and every change can be undone.",
          },
        ],
      },
    ],
  },
];

export const FAQ: { question: string; answer: string[]; topics: GuideTopic[] }[] = [
  {
    question: "Publishing shows an error",
    topics: ["publish", "specs", "settings"],
    answer: [
      "Before publishing, Soodo re-reads the product from Shopify to make sure nothing changed. If Shopify refuses that read, the publish stops and nothing is changed.",
      "The most common cause is a permission that hasn’t been approved yet. Open Soodo from your Shopify admin and accept the permission request, then try again. Settings shows whether each permission is approved.",
      "If it still fails, send a screenshot of the error message itself to your Soodo contact.",
    ],
  },
  {
    question: "“Shopify did not return a public Online Store URL”",
    topics: ["product", "live", "products"],
    answer: [
      "The product isn’t available on the Online Store sales channel, so it has no public page. Search engines and assistants can’t see it, and Soodo can’t live-check it. If the product should be for sale, open it in Shopify and make it available on the Online Store channel.",
    ],
  },
  {
    question: "Some checks say “Not checked yet”",
    topics: ["product", "overview", "live"],
    answer: [
      "They depend on a step that hasn’t run. Visibility checks need a live check; category, barcode and price checks need a scan from the current version. Run Scan catalog, then Check live pages.",
    ],
  },
  {
    question: "The scan stopped part way (“Partly imported”)",
    topics: ["overview", "scan"],
    answer: [
      "Press Continue scan; finished batches are kept. If it stops with an error, read the message. A permission message means you need to approve the updated permissions first.",
    ],
  },
  {
    question: "An area tile shows “—”",
    topics: ["overview"],
    answer: [
      "No product has had all of that area’s checks run yet. Soodo won’t claim a pass it hasn’t measured. The note under the tile says which step to run.",
    ],
  },
  {
    question: "History says “Stopped: product changed”",
    topics: ["history", "publish"],
    answer: [
      "The description in Shopify changed while Soodo was publishing. Your current content was kept. Review the product and create a fresh draft.",
    ],
  },
  {
    question: "Does a score of 100 guarantee I’ll appear in AI answers?",
    topics: ["overview", "fixes"],
    answer: [
      "No. Readiness measures what Soodo can verify: that pages are reachable, data is complete and consistent, and facts are written clearly. Those make products easier to find and recommend, but no tool can guarantee a ranking.",
    ],
  },
];

FAQ.push(
  {
    question: "Sales from AI assistants shows “Approve order access”",
    topics: ["sales", "overview", "settings"],
    answer: [
      "Soodo needs permission to read orders to see where they came from. Open Soodo from your Shopify admin and approve the order permission. Soodo reads only the order number, amount and the website the visit came from, never customer details.",
    ],
  },
  {
    question: "Why are AI sales lower than I expected?",
    topics: ["sales"],
    answer: [
      "Some assistants open links without saying where the visit came from, so those orders look like direct visits. The figure shows orders Soodo can confirm, so the real number can be higher.",
    ],
  },
);

export const GLOSSARY: [term: string, meaning: string][] = [
  [
    "Readiness",
    "A score from 0 to 100. High-priority checks count three times, medium twice, low once. Checks that couldn’t run are left out.",
  ],
  ["Active product", "A product with status Active in Shopify. Draft and archived products are left out of the action plan."],
  [
    "Shopify product category",
    "The standard category from Shopify’s product taxonomy, such as Apparel › Coats. Different from the free-text product type.",
  ],
  ["Category attributes", "Fields like color, fabric or size that belong to a category. Filled in on the product in Shopify."],
  ["GTIN / barcode", "The manufacturer’s barcode number (UPC, EAN). Lets search engines match the exact item."],
  [
    "Structured data",
    "Hidden product markup in the page that machines read for price, stock and identifiers. Your theme usually adds it.",
  ],
  ["robots.txt", "A file on your store that tells crawlers which pages they may read. Edited in your theme as robots.txt.liquid."],
  [
    "Crawler",
    "A program that reads web pages for a search engine or assistant, such as Googlebot or OAI-SearchBot for ChatGPT search.",
  ],
  ["noindex", "A tag asking search engines not to list the page."],
  ["Canonical link", "Tells search engines which address is the main one for a page."],
  ["Metafield", "An extra field stored on a product in Shopify. Your theme may or may not show it."],
  ["Draft", "A proposed description waiting for your approval. Nothing changes until you publish it."],
];

/** Chapters that usually come next after reading one. */
export const RELATED: Record<GuideTopic, GuideTopic[]> = {
  overview: ["visibility", "fixes", "performance"],
  sales: ["performance", "visibility", "overview"],
  visibility: ["overview", "fixes", "product"],
  listing: ["publish", "product", "history"],
  scan: ["overview", "live", "settings"],
  products: ["product", "fixes"],
  product: ["specs", "listing", "live"],
  specs: ["publish", "product"],
  publish: ["history", "specs", "listing"],
  live: ["product", "fixes"],
  fixes: ["product", "specs", "live"],
  history: ["content", "publish"],
  content: ["publish", "listing", "history"],
  performance: ["sales", "visibility", "overview"],
  settings: ["scan", "specs"],
};

export const chapter = (id: GuideTopic) => CHAPTERS.find((c) => c.id === id)!;
