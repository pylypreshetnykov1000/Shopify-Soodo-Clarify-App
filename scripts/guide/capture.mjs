// Captures the annotated screenshots used by the in-app help and the guide.
// Run against a local demo:  GUIDE_URL=http://127.0.0.1:3000 GUIDE_DB=path/to/demo.sqlite npm run guide:capture
// The demo store is reset first, so the walkthrough always starts the same way.
import { mkdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { chromium } from "@playwright/test";

const base = process.env.GUIDE_URL ?? "http://127.0.0.1:3000";
const dbFile = process.env.GUIDE_DB;
const out = new URL("../../public/guide/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
if (!dbFile) throw new Error("Set GUIDE_DB to the demo's SQLite file.");
mkdirSync(out, { recursive: true });

const sql = (statement) => {
  const db = new DatabaseSync(dbFile);
  db.exec(`PRAGMA foreign_keys = ON; ${statement}`);
  db.close();
};
sql("DELETE FROM Store WHERE shop = 'demo.soodo.local';");
for (let i = 0; i < 90; i++) {
  try {
    if ((await fetch(base + "/app")).ok) break;
  } catch {}
  await new Promise((r) => setTimeout(r, 1000));
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1.5, reducedMotion: "reduce" });
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const settle = () => page.waitForTimeout(500);
const hideToasts = (hidden) =>
  page.evaluate((hidden) => {
    const region = document.getElementById("toast-region");
    if (region) region.style.visibility = hidden ? "hidden" : "";
  }, hidden);

/** Draw numbered callouts around elements: [selector, number, nth?]. */
async function annotate(items) {
  await page.evaluate((items) => {
    document.querySelectorAll(".guide-callout-box").forEach((n) => n.remove());
    for (const [selector, number, nth = 0] of items) {
      const el = document.querySelectorAll(selector)[nth];
      if (!el) throw new Error(`No element for ${selector}`);
      const r = el.getBoundingClientRect();
      const box = document.createElement("div");
      box.className = "guide-callout-box";
      Object.assign(box.style, {
        position: "absolute", left: `${r.left + scrollX - 4}px`, top: `${r.top + scrollY - 4}px`,
        width: `${r.width + 8}px`, height: `${r.height + 8}px`, border: "2px solid #ea6a1f",
        borderRadius: "4px", zIndex: 9999, pointerEvents: "none", boxShadow: "0 0 0 3px rgba(234,106,31,.15)",
      });
      const badge = document.createElement("span");
      badge.textContent = String(number);
      Object.assign(badge.style, {
        position: "absolute", left: "-13px", top: "-13px", width: "24px", height: "24px", borderRadius: "50%",
        background: "#ea6a1f", color: "#fff", font: "700 12px/24px system-ui, sans-serif", textAlign: "center",
        boxShadow: "0 1px 3px rgba(0,0,0,.3)",
      });
      box.appendChild(badge);
      document.body.appendChild(box);
    }
  }, items);
}
const clear = () => page.evaluate(() => document.querySelectorAll(".guide-callout-box").forEach((n) => n.remove()));

/** Screenshot the main column between two elements. */
async function shot(name, from, to, { pad = 20, left = 224 } = {}) {
  const box = await page.evaluate(([a, b]) => {
    const top = document.querySelector(a).getBoundingClientRect().top + scrollY;
    const bottom = document.querySelector(b).getBoundingClientRect().bottom + scrollY;
    return { top, bottom };
  }, [from, to]);
  const width = page.viewportSize().width;
  await page.screenshot({
    path: `${out}${name}.jpg`, type: "jpeg", quality: 84, fullPage: true,
    clip: { x: left, y: Math.max(0, box.top - pad), width: width - left, height: box.bottom - box.top + pad * 2 },
  });
  console.log("saved", name);
}
async function setView(view) {
  await page.goto(base + "/app");
  const button = page.getByRole("group", { name: "Overview view" }).getByRole("button", { name: view });
  if ((await button.getAttribute("aria-pressed")) !== "true") {
    await button.click();
    await page.waitForTimeout(600);
  }
  await settle();
}

// First visit: an empty catalog shows "Get started".
await page.goto(base + "/app");
await settle();
sql("DELETE FROM CatalogProduct WHERE shop = 'demo.soodo.local';");
await page.goto(base + "/app");
await settle();
await annotate([[".brand-hero.onboarding .hero-action .button", 1]]);
await shot("21-get-started", ".page-heading", ".brand-hero.onboarding");
await clear();

// Get started: import, then live checks (slowed so progress is visible).
await page.route("**/app/live*", async (route) => {
  await new Promise((r) => setTimeout(r, 2500));
  await route.continue().catch(() => {});
});
await page.getByRole("button", { name: "Get started" }).click();
await page.getByText("Checking live product pages").waitFor({ timeout: 30000 });
await hideToasts(true);
await annotate([[".scan-panel .scan-panel-text", 1], [".scan-panel .button", 2]]);
await shot("02-live-progress", ".page-heading", ".scan-panel");
await clear();
await hideToasts(false);
await page.unroute("**/app/live*");
await page.getByText("Live page checks complete").waitFor({ timeout: 30000 });
await settle();
await page.waitForTimeout(1500);

// AI visibility: run a test (the demo assistant answers from a script).
await page.goto(base + "/app/visibility");
await settle();
await page.getByRole("button", { name: "Run first test" }).click();
await page.locator(".visibility-summary").waitFor({ timeout: 60000 });
await settle();
await page.locator(".question-list summary").nth(1).click();
await settle();
await hideToasts(true);
await annotate([
  [".summary-score", 1],
  [".summary-stat", 2, 1],
  [".visibility-questions", 3],
  ['section[aria-labelledby="competitors"]', 4],
  ['section[aria-labelledby="sources"]', 5],
  [".page-heading .page-actions .button", 6],
]);
await shot("22-visibility", ".page-heading", ".visibility-columns");
await clear();
await hideToasts(false);

// Simple Overview (default) and AI sales.
await page.goto(base + "/app");
await page.locator(".sales-value").first().waitFor();
await settle();
await annotate([
  [".summary-score", 1],
  [".summary-card .summary-stat", 2, 0],
  [".next-steps", 3],
  [".ai-sales", 4],
  [".view-switch", 5],
  [".help-button", 6],
]);
await shot("17-simple-overview", ".page-heading", ".simple-columns");
await clear();
await annotate([
  [".sales-figures > div", 1, 0],
  [".sales-figures > div", 2, 1],
  [".assistant-bars", 3],
  [".recent-orders", 4],
  [".ai-sales .panel-head .button", 5],
]);
await shot("18-ai-sales", ".ai-sales", ".ai-sales");
await clear();

// Detailed Overview.
await setView("Detailed");
await annotate([
  [".hero-figure", 1],
  [".hero-next", 2],
  [".steps-card", 3],
  [".area-grid", 4],
  [".page-heading .page-actions", 5],
]);
await shot("01-overview", ".page-heading", ".area-grid");
await clear();
await annotate([
  [".overview-column:nth-child(1) .panel", 1, 0],
  [".overview-column:nth-child(2) .panel", 2, 0],
  [".overview-column:nth-child(1) .panel", 3, 1],
  [".overview-column:nth-child(2) .panel", 4, 1],
  [".overview-column:nth-child(1) .panel", 5, 2],
  [".overview-column:nth-child(2) .panel", 6, 2],
]);
await shot("04-overview-panels", ".overview-columns", ".overview-columns");
await clear();
const trend = page.locator(".trend svg");
const tb = await trend.boundingBox();
await page.mouse.move(tb.x + tb.width * 0.62, tb.y + 70);
await settle();
await annotate([[".chart-tooltip", 1]]);
await shot("05-trend-tooltip", ".overview-column:nth-child(1) .panel", ".overview-column:nth-child(1) .panel");
await clear();
await page.mouse.move(5, 5);
await setView("Simple");

// Products.
await page.goto(base + "/app/products");
await settle();
await annotate([
  [".segmented", 1], [".search-box", 2], ['select[aria-label="Sort products"]', 3], ["th[aria-sort]", 4, 1],
  ["td.issue-col", 5], ["td.live-col", 6], ["tbody tr", 7, 1],
]);
await shot("06-products", ".page-heading", ".card-foot");
await clear();

// Product workspace: checks.
await page.getByRole("link", { name: /Summit Shell Jacket/ }).first().click();
await page.getByRole("heading", { name: "Checks and next steps" }).waitFor();
await settle();
await annotate([
  [".head-score .dial", 1], [".tabs", 2], [".check-item", 3, 0], [".columns aside .card", 4, 0], [".columns aside .card", 5, 1],
]);
await shot("07-product-checks", ".product-head", ".passed-toggle");
await clear();

// Specifications, filled in.
await page.getByRole("tab", { name: /Specifications/ }).click();
await settle();
await page.locator('input[name="dimensions"]').fill("Regular fit, true to size");
await page.locator('input[name="use"]').fill("Hiking and everyday rain");
await page.locator('input[name="care"]').fill("Machine wash cold, hang dry");
await page.locator('input[name="confirmed"]').check();
await annotate([[".flow-head", 1], [".field", 2, 0], [".field", 3, 2], [".form-options", 4], [".form-foot .button.primary", 5]]);
await shot("08-specifications", ".tabs", ".form-foot");
await clear();
await annotate([[".columns > div > .card:nth-child(2)", 1]]);
await shot("09-buyer-questions", ".columns > div > .card:nth-child(2)", ".columns > div > .card:nth-child(2)");
await clear();

// Draft review and publish.
await page.getByRole("button", { name: "Create description draft" }).click();
await page.locator("#draft").waitFor();
await settle();
await page.evaluate(() => scrollTo(0, 0));
await hideToasts(true);
await annotate([
  [".draft-columns > div", 1, 0], [".draft-columns > div", 2, 1], [".sources", 3],
  [".draft-actions .checkbox", 4], [".draft-actions .button.primary", 5], [".draft-actions form:last-child .button", 6],
]);
await shot("10-draft-review", "#draft", "#draft");
await clear();
await hideToasts(false);
await page.locator('input[name="approved"]').check();
await page.getByRole("button", { name: "Publish to demo catalog" }).click();
await page.locator("#toast-region .toast").waitFor();
await settle();
await page.getByRole("tab", { name: /Specifications/ }).click();
await settle();
await annotate([["#toast-region .toast", 1], [".tabs button", 2, 1]]);
await page.screenshot({ path: `${out}11-published.jpg`, type: "jpeg", quality: 84 });
await clear();
console.log("saved 11-published");

// Search listing.
await page.goto(base + "/app/products");
await page.getByRole("link", { name: /Trail 28 Backpack/ }).first().click();
await page.getByRole("tab", { name: /Search listing/ }).click();
await settle();
await annotate([
  [".listing-field", 1, 0], [".listing-field", 2, 1], [".listing-form .serp", 3],
  [".listing-form .form-foot .button.quiet", 4], [".listing-form .form-foot .button.primary", 5], [".columns aside .card", 6],
]);
await shot("19-search-listing", ".tabs", ".columns");
await clear();
await page.getByRole("button", { name: "Create listing draft" }).click();
await page.getByRole("heading", { name: "Review search listing" }).waitFor();
await settle();
await hideToasts(true);
await annotate([[".draft-columns", 1], [".draft-actions form:first-child", 2]]);
await shot("20-listing-review", ".tabs", ".draft-card");
await clear();
await hideToasts(false);
await page.getByRole("button", { name: "Reject draft" }).click();
await settle();

// Live page (the tent carries duplicate product markup in the demo).
await page.goto(base + "/app/products");
await page.getByRole("link", { name: /Basecamp Two Tent/ }).first().click();
await page.getByRole("tab", { name: /Live page/ }).click();
await settle();
await page.getByRole("button", { name: /Training crawlers/ }).click();
await settle();
await annotate([
  [".live-list", 1], [".live-list > div", 2, 3], ['[aria-label="Crawler access from robots.txt"]', 3],
  ["#training-crawlers", 4], [".columns .card-heading .page-actions", 5],
]);
await shot("12-live-page", ".tabs", ".columns");
await clear();

// Fix plan.
await page.goto(base + "/app/fixes");
await settle();
await page.locator(".fix-trigger").first().click();
await settle();
await annotate([
  [".store-fixes", 1], ['[aria-label="Filter by area"]', 2], [".priority-filter", 3],
  [".fix-trigger .impact", 4, 0], [".fix-how", 5], [".affected", 6],
]);
await shot("13-fix-plan", ".page-heading", ".fix:nth-child(2)");
await clear();

// History.
await page.goto(base + "/app/history");
await settle();
await page.getByRole("button", { name: "View saved descriptions" }).first().click();
await settle();
await annotate([
  [".timeline > li time", 1, 0], [".history-body .badge", 2, 1], [".history-body .draft-columns", 3, 0], [".history-actions", 4, 0],
]);
await shot("14-history", ".page-heading", ".timeline > li:first-child");
await clear();

// Settings.
await page.goto(base + "/app/settings");
await settle();
await annotate([
  [".choice-list", 1], [".settings-row form .button", 2],
  [".settings-row:nth-of-type(2) .definition", 3], [".settings-row:nth-of-type(3) .definition", 4],
]);
await shot("15-settings", ".page-heading", ".settings-row:nth-of-type(3)");
await clear();

// Phone layout (no callouts).
const phone = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, reducedMotion: "reduce" });
await phone.goto(base + "/app");
await phone.locator(".sales-value").first().waitFor();
await phone.waitForTimeout(800);
await phone.screenshot({ path: `${out}16-phone.jpg`, type: "jpeg", quality: 82, clip: { x: 0, y: 0, width: 390, height: 1150 }, fullPage: true });
console.log("saved 16-phone");

await browser.close();
if (errors.length) throw new Error("Page errors:\n" + errors.join("\n"));
console.log("done");
