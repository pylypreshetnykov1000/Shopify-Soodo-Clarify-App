import { test, expect, type Page } from "@playwright/test";
import db from "../../app/db.server";
import { DEMO_SHOP } from "../../app/core/demo";
test.beforeAll(async () => {
  if (process.env.SOODO_TEST_DATABASE !== "true")
    throw new Error(
      "Browser tests must run through npm run test:e2e with an isolated test database.",
    );
  await db.store.deleteMany({ where: { shop: DEMO_SHOP } });
});
test.afterAll(async () => {
  await db.$disconnect();
});
test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => {
    throw error;
  });
});
const fits = (page: Page) =>
  page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test("merchant can search, draft, approve, publish and restore", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.getByRole("link", { name: "Products", exact: true }).click();
  await page.getByRole("textbox", { name: "Search products" }).fill("Summit");
  await expect(page.getByRole("link", { name: /Trail 28 Backpack/ })).toHaveCount(0);
  await page.getByRole("link", { name: /Summit Shell Jacket/ }).first().click();
  await expect(page.getByRole("heading", { name: "Checks and next steps" })).toBeVisible();
  await page.getByRole("tab", { name: /Specifications/ }).click();
  await expect(page.getByRole("heading", { name: "Specifications", exact: true })).toBeVisible();
  await page.locator('input[name="dimensions"]').fill("Regular fit");
  await page.locator('input[name="use"]').fill("Day hiking");
  await page.locator('input[name="care"]').fill("Hand wash cold");
  await page.locator('input[name="confirmed"]').check();
  await page.getByRole("button", { name: "Create description draft" }).click();
  await expect(page.locator(".notice.success")).toContainText("Draft created");
  await expect(page.getByRole("heading", { name: "Where these facts came from" })).toBeVisible();
  await expect(page).toHaveURL(/#draft$/);
  await expect(page.locator("#draft")).toBeFocused();
  await expect(page.getByRole("heading", { name: "Review description" })).toBeVisible();
  await expect(page.locator(".sources")).toHaveCount(1);
  await page.screenshot({ path: "test-results/draft-review-desktop.png", fullPage: true });
  await page.locator('input[name="approved"]').check();
  await page.getByRole("button", { name: "Publish to demo catalog" }).click();
  await expect(page.locator(".notice.success")).toContainText("published and verified");
  await expect(page.getByText("5 / 5 found", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Change history", exact: true }).click();
  const latest = page.locator(".history-card").first();
  await latest.locator('input[name="confirmed"]').check();
  await latest.getByRole("button", { name: "Restore previous description" }).click();
  await expect(page.locator(".notice.success")).toContainText("restored and verified");
});

test("mobile navigation and settings remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/settings");
  await expect(page.getByRole("heading", { name: "Specification checklist" })).toBeVisible();
  expect(await fits(page)).toBe(true);
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByRole("button", { name: /Scan catalog|Continue scan/ })).toBeVisible();
});

test("demo rejects mutation requests from another origin", async ({ request }) => {
  for (const path of ["/app/scan", "/app/live", "/app/settings"]) {
    const response = await request.post(path, {
      headers: { Origin: "https://untrusted.example" },
      form: { restart: "true", profile: "auto" },
    });
    // React Router may reject the request before our own origin guard executes.
    expect([400, 403]).toContain(response.status());
  }
});

test("draft facts survive reload, can be revised, and rejection leaves the product untouched", async ({
  page,
}) => {
  await page.goto("/app/products");
  await page.getByRole("link", { name: /Ridge Fleece/ }).first().click();
  await page.getByRole("tab", { name: /Specifications/ }).click();
  await page.locator('input[name="material"]').fill("Polyester");
  await page.locator('input[name="confirmed"]').check();
  await page.getByRole("button", { name: "Create description draft" }).click();
  await expect(page.locator(".notice.success")).toContainText("Draft created");
  await page.reload();
  await page.getByRole("tab", { name: /Specifications/ }).click();
  await expect(page.locator('input[name="material"]')).toHaveValue("Polyester");
  await page.locator('input[name="material"]').fill("Cotton fleece");
  await page.locator('input[name="confirmed"]').check();
  await page.getByRole("button", { name: "Replace draft with these facts" }).click();
  await expect(page.locator(".notice.success")).toContainText("Draft created");
  await expect(page.locator(".sources")).toHaveCount(1);
  await expect(page.locator(".sources")).toContainText("Cotton fleece");
  const id = await page.locator('.draft-actions input[name="suggestionId"]').first().inputValue();
  const blocked = await page.request.post(page.url(), {
    headers: { Origin: new URL(page.url()).origin },
    form: { intent: "publish", suggestionId: id },
  });
  expect(await blocked.text()).toContain("Approve the proposed change before publishing");
  expect((await db.suggestion.findUniqueOrThrow({ where: { id } })).status).toBe("DRAFT");
  await page.getByRole("button", { name: "Reject draft" }).click();
  await expect(page.locator(".notice.success")).toContainText("Draft rejected");
  await expect(page.locator('input[name="material"]')).toHaveValue("");
  await expect(page.locator(".scroll-text")).not.toContainText("Cotton fleece");
});

test("one click scans the whole catalog and filters work without navigation", async ({
  page,
}) => {
  await page.goto("/app");
  await page.getByRole("button", { name: /Scan catalog|Continue scan/ }).click();
  await expect(page.locator(".notice.success")).toContainText("Scan complete. 4 products up to date.");
  await page.getByRole("link", { name: "Products", exact: true }).click();
  await page.getByRole("button", { name: "Draft ready", exact: true }).click();
  await expect(page.locator(".empty")).toContainText("No matching products");
  await page.getByRole("button", { name: "All products", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  // The tent passes every data check; its live checks have not run yet.
  await page.getByRole("button", { name: "Needs fixes", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(3);
});

test("catalog search, reset and sorting help merchants find the next product", async ({
  page,
}) => {
  await page.goto("/app/products");
  await page.getByRole("combobox", { name: "Sort products" }).selectOption("title");
  const names = await page.locator(".product-name strong").allTextContents();
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  await page.getByRole("combobox", { name: "Sort products" }).selectOption("readiness");
  const scores = (await page.locator(".score strong").allTextContents()).map(Number);
  expect(scores).toEqual([...scores].sort((a, b) => a - b));
  await page.getByRole("textbox", { name: "Search products" }).fill("no matching product");
  await expect(page.getByRole("heading", { name: "No matching products" })).toBeVisible();
  await page.getByRole("button", { name: "Clear search and filters" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await expect(page.getByRole("link", { name: "Products", exact: true })).toHaveAttribute(
    "aria-current",
    "page",
  );
});

test("live page checks surface visibility fixes in the plan and on the product", async ({
  page,
}) => {
  await page.goto("/app/fixes");
  await expect(page.getByRole("heading", { name: "Fix plan", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Check live pages" }).click();
  await expect(page.locator(".notice.success")).toContainText("Live page checks complete");
  // The demo tent page carries a duplicate Product block from an old app.
  const structured = page.locator(".fix").filter({ hasText: "Product structured data" });
  await structured.locator(".fix-trigger").click();
  await expect(structured.locator(".fix-trigger")).toHaveAttribute("aria-expanded", "true");
  await expect(structured).toContainText("Basecamp Two Tent");
  await expect(structured).toContainText("2 separate Product blocks");
  await structured.getByRole("link", { name: "Open Basecamp Two Tent" }).click();
  // The link opens the product on its Live page tab.
  await expect(page.getByRole("tab", { name: /Live page/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".live-list")).toContainText("2 blocks");
  await expect(page.getByLabel("Crawler access from robots.txt")).toContainText("OAI-SearchBot");
  await page.getByRole("button", { name: /Training crawlers \(1 blocked\)/ }).click();
  await expect(page.locator("#training-crawlers li").filter({ hasText: "GPTBot" })).toContainText("Blocked");
  await page.getByRole("button", { name: "Check again" }).click();
  await expect(page.locator(".notice.success")).toContainText(/moment ago|Live check/);
  await page.goto("/app");
  await expect(page.getByRole("region", { name: "Readiness by area" }).locator(".area-tile")).toHaveCount(4);
  await expect(page.getByRole("list", { name: "Setup progress" }).locator("li").nth(1)).toHaveClass(/done/);
  await expect(page.getByRole("heading", { name: "Store-wide signals" })).toBeVisible();
  await expect(page.locator(".signal").filter({ hasText: "Shipping policy" })).toContainText("Not set up");
});

test("overview and product workspace fit narrow screens and link to the next fix", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
  expect(await fits(page)).toBe(true);
  await page.locator(".panel-rows").getByRole("link").first().click();
  await expect(page.locator("h1")).toBeVisible();
  expect(await fits(page)).toBe(true);
  await page.goto("/app/products");
  await page.getByRole("link", { name: /Summit Shell Jacket/ }).first().click();
  await expect(page.getByRole("heading", { name: "Checks and next steps" })).toBeVisible();
  expect(await fits(page)).toBe(true);
  await page.screenshot({ path: "test-results/product-workspace-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/app");
  await page.screenshot({ path: "test-results/overview-desktop.png", fullPage: true });
});

test("slow form submissions show progress only on the action being performed", async ({
  page,
}) => {
  await page.goto("/app/products");
  await page.getByRole("link", { name: /Trail 28 Backpack/ }).first().click();
  await page.getByRole("tab", { name: /Specifications/ }).click();
  await page.locator('input[name="care"]').fill("Spot clean");
  await page.locator('input[name="confirmed"]').check();
  await page.getByRole("button", { name: "Create description draft" }).click();
  await expect(page.locator(".notice.success")).toContainText("Draft created");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/*.data*", async (route) => {
    if (route.request().method() === "POST") await gate;
    await route.continue();
  });
  try {
    await page.getByRole("button", { name: "Reject draft" }).click();
    await expect(page.getByRole("button", { name: "Rejecting..." })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Publish to demo catalog" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Replace draft with these facts" })).toBeDisabled();
  } finally {
    release();
  }
  await expect(page.locator(".notice.success")).toContainText("Draft rejected");
});

test("all workspace screens fit phone, tablet and desktop without font downloads, and honour reduced motion", async ({
  page,
}) => {
  const fontRequests: string[] = [];
  page.on("request", (request) => {
    if (/fonts\.(googleapis|gstatic)|static\/fonts/.test(request.url()))
      fontRequests.push(request.url());
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const path of ["/app", "/app/products", "/app/fixes", "/app/history", "/app/settings", "/app/help"]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      expect(await fits(page), `${path} at ${width}px`).toBe(true);
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
    }
  }
  expect(fontRequests).toEqual([]);
});

test("Products supports page sizes, page boundaries and filtered results", async ({ page }) => {
  await page.goto("/app/products");
  const source = await db.catalogProduct.findFirstOrThrow({ where: { shop: DEMO_SHOP } });
  const products = Array.from({ length: 120 }, (_, index) => ({
    shop: DEMO_SHOP,
    gid: `ux-test-${index}`,
    title: `UX test ${String(index).padStart(3, "0")}`,
    payload: JSON.stringify({
      ...JSON.parse(source.payload),
      id: `ux-test-${index}`,
      title: `UX test ${String(index).padStart(3, "0")}`,
    }),
  }));
  try {
    await db.catalogProduct.createMany({ data: products });
    const total = await db.catalogProduct.count({ where: { shop: DEMO_SHOP } });
    await page.goto("/app/products");
    const size = page.getByRole("combobox", { name: "Products per page" });
    const previous = page.getByRole("button", { name: "Previous", exact: true });
    const next = page.getByRole("button", { name: "Next", exact: true });
    const range = page.locator(".card-foot [role=status]");
    await expect(size).toHaveValue("50");
    await expect(page.locator("tbody tr")).toHaveCount(50);
    await expect(previous).toBeDisabled();
    for (const count of [10, 25, 50, 100]) {
      await size.selectOption(String(count));
      await expect(page.locator("tbody tr")).toHaveCount(count);
      await expect(range).toHaveText(`1–${count} of ${total} products`);
      await next.click();
      await expect(range).toHaveText(`${count + 1}–${Math.min(count * 2, total)} of ${total} products`);
      await previous.click();
      await expect(previous).toBeDisabled();
    }
    // Last page contains only the remaining rows; changing size resets it.
    await next.click();
    await expect(page.locator("tbody tr")).toHaveCount(total - 100);
    await expect(next).toBeDisabled();
    await size.selectOption("25");
    await expect(previous).toBeDisabled();
    await next.click();
    await page.getByRole("combobox", { name: "Sort products" }).selectOption("title");
    await expect(previous).toBeDisabled();
    await next.click();
    await page.getByRole("button", { name: "Needs fixes", exact: true }).click();
    await expect(range).toContainText(/^1–/);
    await page.getByRole("button", { name: "All products", exact: true }).click();
    const search = page.getByRole("textbox", { name: "Search products" });
    await search.fill("UX test 119");
    await expect(page.locator("tbody tr")).toHaveCount(1);
    await expect(range).toHaveText(`1–1 of 1 products (${total} imported)`);
    await expect(page.getByRole("navigation", { name: "Catalog pages" })).toHaveCount(0);
    await search.fill("no matching catalog product");
    await expect(page.locator("tbody tr")).toHaveCount(0);
    await expect(range).toHaveText(`0 products (${total} imported)`);
    await page.getByRole("button", { name: "Clear search and filters" }).click();
    await expect(previous).toBeDisabled();
    await page.setViewportSize({ width: 320, height: 740 });
    await size.selectOption("10");
    await next.click();
    await expect(range).toHaveText(`11–20 of ${total} products`);
    expect(await fits(page)).toBe(true);
  } finally {
    await db.catalogProduct.deleteMany({
      where: { shop: DEMO_SHOP, gid: { in: products.map((p) => p.gid) } },
    });
  }
});

test("delayed navigation shows a quiet status and clears it after loading", async ({ page }) => {
  await page.goto("/app");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/app/settings.data*", async (route) => {
    await gate;
    await route.continue();
  });
  const navigation = page.getByRole("link", { name: "Settings", exact: true }).click();
  try {
    await expect(page.locator(".navigation-status")).toHaveText("Loading...");
    await expect(page.locator(".nav-progress")).toHaveCount(1);
  } finally {
    release();
  }
  await navigation;
  await expect(page.getByRole("heading", { name: "Settings", exact: true })).toBeVisible();
  await expect(page.locator(".navigation-status")).toBeEmpty();
  await expect(page.locator(".nav-progress")).toHaveCount(0);
});

test("the checklist setting switches products between fixed and automatic profiles", async ({ page }) => {
  await page.goto("/app/settings");
  await page.getByRole("radio", { name: "Automatic" }).check();
  await page.getByRole("button", { name: "Save checklist" }).click();
  await expect(page.locator(".notice.success")).toContainText("Shopify category");
  await page.goto("/app/products");
  await page.getByRole("link", { name: /Ridge Fleece/ }).first().click();
  await expect(page.locator(".meta-line")).toContainText("Apparel & accessories checklist");
  await page.getByRole("tab", { name: /Specifications/ }).click();
  await expect(page.locator('input[name="color"]')).toBeVisible();
  await page.goto("/app/settings");
  await page.getByRole("radio", { name: "Outdoor & sports gear" }).check();
  await page.getByRole("button", { name: "Save checklist" }).click();
  await expect(page.locator(".notice.success")).toContainText("outdoor & sports gear");
});

test("legacy data is marked not checked until a scan collects it, and old GEO links redirect", async ({
  page,
}) => {
  const row = await db.catalogProduct.findFirstOrThrow({
    where: { shop: DEMO_SHOP, title: "Summit Shell Jacket" },
  });
  const product = JSON.parse(row.payload);
  delete product.discovery;
  delete product.commerce;
  await db.catalogProduct.update({ where: { id: row.id }, data: { payload: JSON.stringify(product) } });
  await page.goto(`/app/geo/${row.id}`);
  await expect(page).toHaveURL(new RegExp(`/app/products/${row.id}`));
  await expect(page.getByText("imported before some checks existed", { exact: false })).toBeVisible();
  await expect(page.getByRole("img", { name: "Not checked" }).first()).toBeVisible();
  await page.goto("/app/geo");
  await expect(page).toHaveURL(/\/app\/fixes/);
  await page.getByRole("button", { name: /Scan catalog|Continue scan/ }).click();
  await expect(page.locator(".notice.success")).toContainText("Scan complete");
  await page.goto(`/app/products/${row.id}`);
  await expect(page.getByText("imported before some checks existed", { exact: false })).toHaveCount(0);
  await page.getByRole("button", { name: /Passed checks \(\d+\)/ }).click();
  await expect(page.getByText("Vendor: Trail Supply", { exact: true })).toBeVisible();
});

test("the overview guides the next step and tabs support the keyboard", async ({ page }) => {
  await page.goto("/app");
  const next = page.locator(".brand-hero");
  await expect(next.getByText("Next step", { exact: true })).toBeVisible();
  const progress = page.getByRole("list", { name: "Setup progress" });
  await expect(progress.locator("li")).toHaveCount(3);
  await expect(progress.locator("li").first()).toHaveClass(/done/);
  await page.goto("/app/products");
  await page.getByRole("link", { name: /Summit Shell Jacket/ }).first().click();
  const checks = page.getByRole("tab", { name: /Checks/ });
  await checks.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: /Specifications/ })).toHaveAttribute("aria-selected", "true");
  await expect(page.getByRole("tab", { name: /Specifications/ })).toBeFocused();
  await page.keyboard.press("End");
  await expect(page.getByRole("tab", { name: /Live page/ })).toHaveAttribute("aria-selected", "true");
  await page.keyboard.press("Home");
  await expect(checks).toHaveAttribute("aria-selected", "true");
  // Exactly one check opens at a time; closed details cannot be focused.
  const triggers = page.locator(".check-trigger");
  const open = page.locator('.check-trigger[aria-expanded="true"]');
  await expect(open).toHaveCount(1);
  // The default is an actionable fix, never a "not checked" row.
  await expect(open).not.toContainText("Not checked");
  const opened = (await open.getAttribute("aria-controls"))!;
  const other = triggers.and(page.locator(`:not([aria-controls="${opened}"])`)).first();
  await other.click();
  await expect(other).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator(`[aria-controls="${opened}"]`)).toHaveAttribute("aria-expanded", "false");
  await expect(open).toHaveCount(1);
  expect(await page.locator(".collapse:not(.open)").first().evaluate((el) => (el as HTMLElement).inert)).toBe(true);
});

test("overview, products and fix plan connect through filters, sorting and whole-row links", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Needs attention" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent changes" })).toBeVisible();
  // Area tiles open the fix plan filtered to that area.
  await page.getByRole("link", { name: /^Content:/ }).click();
  await expect(page).toHaveURL(/\/app\/fixes\?area=content/);
  const areaFilter = page.getByRole("group", { name: "Filter by area" });
  await expect(areaFilter.getByRole("button", { name: /Content/ })).toHaveAttribute("aria-pressed", "true");
  const rows = page.locator(".fix");
  const contentCount = await rows.count();
  expect(contentCount).toBeGreaterThan(0);
  for (const area of await rows.locator(".fix-area").allTextContents()) expect(area).toBe("Content");
  // Priority chips narrow the list further and toggle off again.
  const low = page.getByRole("group", { name: "Filter by priority" }).getByRole("button", { name: /Low/ });
  await low.click();
  await expect(low).toHaveAttribute("aria-pressed", "true");
  expect(await rows.count()).toBeLessThan(contentCount);
  await low.click();
  await expect(rows).toHaveCount(contentCount);
  // Each fix explains why it matters.
  await expect(rows.first().locator(".row-main small")).not.toBeEmpty();

  await page.goto("/app/products");
  const readiness = page.getByRole("columnheader", { name: "Readiness" });
  await readiness.getByRole("button").click();
  await expect(readiness).toHaveAttribute("aria-sort", "ascending");
  await readiness.getByRole("button").click();
  await expect(readiness).toHaveAttribute("aria-sort", "descending");
  const scores = (await page.locator(".score strong").allTextContents()).map(Number);
  expect(scores).toEqual([...scores].sort((a, b) => b - a));
  await expect(page.getByRole("combobox", { name: "Sort products" })).toHaveValue("readiness-desc");
  // Clicking anywhere on a row opens the product.
  // The stretched link covers the cell, so the click lands on the link.
  await page.locator("tbody tr").first().locator(".live-col").click({ force: true });
  await expect(page.getByRole("heading", { name: "Checks and next steps" })).toBeVisible();
});

test("the overview hero and charts show readiness, its trend and its spread", async ({ page }) => {
  await page.goto("/app");
  const hero = page.locator(".brand-hero");
  await expect(hero.locator(".hero-number")).toHaveText(/^\d+%$/);
  // The demo carries a few weeks of history, so the hero reports the change.
  await expect(hero.locator(".delta")).toContainText("pts");
  const trend = page.getByRole("img", { name: /^Catalog readiness over time:/ });
  await expect(trend).toBeVisible();
  // Every reading is also available as a table for assistive technology.
  expect(await page.locator(".trend .sr-only table tbody tr").count()).toBeGreaterThanOrEqual(10);
  // Keyboard users get the same tooltip as pointer users.
  await trend.focus();
  await expect(page.locator(".chart-tooltip")).toContainText("Readiness");
  await page.keyboard.press("Home");
  await expect(page.locator(".chart-tooltip")).toContainText("Readiness 58");
  await trend.blur();
  await expect(page.locator(".chart-tooltip")).toHaveCount(0);
  // The distribution covers every active product exactly once.
  const bands = page.getByRole("list", { name: "Active products by readiness band" }).locator("li");
  await expect(bands).toHaveCount(4);
  const total = (await bands.locator(".band-value").allTextContents()).reduce((sum, v) => sum + Number(v), 0);
  expect(total).toBe(3);
  // The favicon carries the brand mark.
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", /^data:image\/svg\+xml/);
});

test("help opens the right chapter for each screen and links to the full guide", async ({ page }) => {
  const expectations: [string, string][] = [
    ["/app", "Overview"],
    ["/app/products", "Products"],
    ["/app/fixes", "Fix plan"],
    ["/app/history", "Change history"],
    ["/app/settings", "Settings and permissions"],
  ];
  for (const [path, title] of expectations) {
    await page.goto(path);
    await page.getByRole("button", { name: "Help", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByRole("heading", { name: title, exact: true })).toBeVisible();
    // Every chapter shows at least one annotated screenshot that loaded.
    const image = dialog.locator(".guide-shot img").first();
    await expect(image).toBeVisible();
    expect(await image.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();
  }
  // On a product, help follows the open tab.
  await page.goto("/app/products");
  await page.getByRole("link", { name: /Trail 28 Backpack/ }).first().click();
  await page.getByRole("tab", { name: /Live page/ }).click();
  await page.getByRole("button", { name: "Help", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Live page", exact: true })).toBeVisible();
  // Related topics switch the panel in place.
  await page.getByRole("dialog").getByRole("button", { name: /Fix plan/ }).click();
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Fix plan", exact: true })).toBeVisible();
  await page.getByRole("dialog").getByRole("link", { name: "Open full guide" }).click();
  await expect(page).toHaveURL(/\/app\/help#fixes$/);
  await expect(page.getByRole("dialog")).toBeHidden();
  await expect(page.getByRole("heading", { name: "Help and guide" })).toBeVisible();
  // Introduction, ten chapters, troubleshooting and glossary.
  await expect(page.locator(".guide-section")).toHaveCount(13);
  await expect(page.getByRole("link", { name: "Help", exact: true })).toHaveAttribute("aria-current", "page");
});

test("pressing ? opens help for the current screen, but not while typing", async ({ page }) => {
  await page.goto("/app/products");
  await page.getByRole("textbox", { name: "Search products" }).fill("Pack?");
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.getByRole("heading", { name: "Products", exact: true }).click();
  await page.keyboard.press("?");
  await expect(page.getByRole("dialog").getByRole("heading", { name: "Products", exact: true })).toBeVisible();
  // Focus moves into the panel, and the close button returns to the page.
  await page.getByRole("button", { name: "Close help" }).click();
  await expect(page.getByRole("dialog")).toBeHidden();
});
