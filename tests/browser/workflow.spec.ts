import { test, expect } from "@playwright/test";
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
test("merchant can search, draft, approve, publish and restore", async ({
  page,
}) => {
  await page.goto("/app");
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await page.getByRole("link", { name: "Products", exact: true }).click();
  await page.getByRole("textbox", { name: "Search products" }).fill("Summit");
  await expect(
    page.getByRole("link", { name: /Trail 28 Backpack/ }),
  ).toHaveCount(0);
  await page.getByRole("link", { name: /Summit Shell Jacket/ }).click();
  await page.locator('input[name="dimensions"]').fill("Regular fit");
  await page.locator('input[name="use"]').fill("Day hiking");
  await page.locator('input[name="care"]').fill("Hand wash cold");
  await page.locator('input[name="confirmed"]').check();
  await page
    .getByRole("button", { name: /Create description draft|Replace draft/ })
    .click();
  await expect(page.locator(".notice.success")).toContainText("Draft created");
  await expect(
    page.getByRole("heading", { name: "Where these facts came from" }),
  ).toBeVisible();
  await expect(page).toHaveURL(/#draft$/);
  await expect(page.locator("#draft")).toBeFocused();
  await expect(
    page.getByRole("heading", { name: "Review description" }),
  ).toBeVisible();
  await expect(page.locator(".facts-details")).not.toHaveAttribute("open");
  await expect(page.locator(".sources")).toHaveCount(1);
  await page.screenshot({
    path: "test-results/draft-review-desktop.png",
    fullPage: true,
  });
  await page.locator('input[name="approved"]').check();
  await page.getByRole("button", { name: "Publish to demo catalog" }).click();
  await expect(page.locator(".notice.success")).toContainText(
    "published and verified",
  );
  await expect(
    page.getByText("100% information completeness", { exact: false }),
  ).toBeVisible();
  await page.getByRole("link", { name: "Change history", exact: true }).click();
  const latest = page.locator(".history-card").first();
  await latest.locator('input[name="confirmed"]').check();
  await latest
    .getByRole("button", { name: "Restore previous description" })
    .click();
  await expect(page.locator(".notice.success")).toContainText(
    "restored and verified",
  );
});
test("mobile navigation and settings remain usable", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app/settings");
  await expect(
    page.getByRole("heading", { name: "Outdoor gear checklist" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Scan catalog" }),
  ).toBeVisible();
});
test("demo rejects mutation requests from another origin", async ({
  request,
}) => {
  const response = await request.post("/app", {
    headers: { Origin: "https://untrusted.example" },
    form: { intent: "sync", restart: "true" },
  });
  // React Router may reject the request before our own origin guard executes.
  expect([400, 403]).toContain(response.status());
});
test("draft facts survive reload, can be revised, and rejection leaves the product untouched", async ({
  page,
}) => {
  await page.goto("/app/products");
  await page.getByRole("link", { name: /Ridge Fleece/ }).click();
  await page.locator('input[name="material"]').fill("Polyester");
  await page.locator('input[name="confirmed"]').check();
  await page.getByRole("button", { name: "Create description draft" }).click();
  await expect(page.locator(".notice.success")).toContainText("Draft created");
  await page.reload();
  await expect(page.locator('input[name="material"]')).toHaveValue("Polyester");
  await page.getByText("Edit product facts", { exact: true }).click();
  await page.locator('input[name="material"]').fill("Cotton fleece");
  await page.locator('input[name="confirmed"]').check();
  await page
    .getByRole("button", { name: "Replace draft with these facts" })
    .click();
  await expect(page.locator(".notice.success")).toContainText("Draft created");
  await expect(page.locator(".sources")).toHaveCount(1);
  await expect(page.locator(".sources")).toContainText("Cotton fleece");
  const id = await page
    .locator('.draft-actions input[name="suggestionId"]')
    .first()
    .inputValue();
  const blocked = await page.request.post(page.url(), {
    headers: { Origin: new URL(page.url()).origin },
    form: { intent: "publish", suggestionId: id },
  });
  expect(await blocked.text()).toContain(
    "Approve the proposed change before publishing",
  );
  expect(
    (await db.suggestion.findUniqueOrThrow({ where: { id } })).status,
  ).toBe("DRAFT");
  await page.getByRole("button", { name: "Reject draft" }).click();
  await expect(page.locator(".notice.success")).toContainText("Draft rejected");
  await expect(page.locator('input[name="material"]')).toHaveValue("");
  await expect(
    page.locator(".context-card .description-text"),
  ).not.toContainText("Cotton fleece");
});
test("scanning and catalog filters work without full page navigation", async ({
  page,
}) => {
  await page.goto("/app");
  await page.getByRole("button", { name: "Scan catalog" }).click();
  await expect(page.locator(".notice.success")).toContainText("Scan complete");
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(
    page.getByRole("link", { name: /Basecamp Two Tent/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Draft ready", exact: true }).click();
  await expect(page.locator(".empty")).toContainText("No matching products");
  await page.getByRole("button", { name: "All products", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
});

test("catalog search, reset and sorting help merchants find the next product", async ({
  page,
}) => {
  await page.goto("/app/products");
  await page
    .getByRole("combobox", { name: "Sort products" })
    .selectOption("title");
  const names = await page.locator(".product-name strong").allTextContents();
  expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  await page
    .getByRole("textbox", { name: "Search products" })
    .fill("no matching product");
  await expect(
    page.getByRole("heading", { name: "No matching products" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search and filters" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await expect(
    page.getByRole("link", { name: "Products", exact: true }),
  ).toHaveAttribute("aria-current", "page");
});

test("overview and product review fit narrow screens and link to the next action", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Overview", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Review next product" }).click();
  await expect(
    page.getByRole("heading", { name: "Product facts" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/product-review-mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/app");
  await page.screenshot({
    path: "test-results/overview-desktop.png",
    fullPage: true,
  });
});

test("slow form submissions show progress only on the action being performed", async ({
  page,
}) => {
  await page.goto("/app/products");
  await page.getByRole("link", { name: /Trail 28 Backpack/ }).click();
  await page.locator('input[name="care"]').fill("Spot clean");
  await page.locator('input[name="confirmed"]').check();
  await page.getByRole("button", { name: "Create description draft" }).click();
  await expect(page.locator(".notice.success")).toContainText("Draft created");
  await page.getByText("Edit product facts", { exact: true }).click();
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
    await expect(
      page.getByRole("button", { name: "Rejecting..." }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Publish to demo catalog" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Replace draft with these facts" }),
    ).toBeDisabled();
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  } finally {
    release();
  }
  await expect(page.locator(".notice.success")).toContainText("Draft rejected");
});

test("all workspace screens fit phone, tablet and desktop without font downloads or motion", async ({
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
    for (const path of [
      "/app",
      "/app/products",
      "/app/geo",
      "/app/history",
      "/app/settings",
    ]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${path} at ${width}px`,
      ).toBe(true);
      expect(await page.evaluate(() => document.getAnimations().length)).toBe(
        0,
      );
    }
  }
  expect(fontRequests).toEqual([]);
});

test("Overview and Products support page sizes, page boundaries and filtered results", async ({
  page,
}) => {
  await page.goto("/app/products");
  const source = await db.catalogProduct.findFirstOrThrow({
    where: { shop: DEMO_SHOP },
  });
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
    for (const path of ["/app", "/app/products"]) {
      await page.goto(path);
      const size = page.getByRole("combobox", { name: "Products per page" });
      const previous = page.getByRole("button", {
        name: "Previous",
        exact: true,
      });
      const next = page.getByRole("button", { name: "Next", exact: true });
      const range = page.locator(".table-footer [role=status]");
      await expect(size).toHaveValue("50");
      await expect(page.locator("tbody tr")).toHaveCount(50);
      await expect(previous).toBeDisabled();

      for (const count of [10, 25, 50, 100]) {
        await size.selectOption(String(count));
        await expect(page.locator("tbody tr")).toHaveCount(count);
        await expect(range).toHaveText(`1–${count} of ${total} products`);
        await next.click();
        await expect(range).toHaveText(
          `${count + 1}–${Math.min(count * 2, total)} of ${total} products`,
        );
        await previous.click();
        await expect(previous).toBeDisabled();
      }

      // Last page contains only the remaining rows; changing size resets it.
      await next.click();
      await expect(page.locator("tbody tr")).toHaveCount(total - 100);
      await expect(next).toBeDisabled();
      await size.selectOption("25");
      await expect(previous).toBeDisabled();
      await expect(page.locator("tbody tr")).toHaveCount(25);
      await next.click();
      await page
        .getByRole("combobox", { name: "Sort products" })
        .selectOption("title");
      await expect(previous).toBeDisabled();
      await next.click();
      await page
        .getByRole("button", { name: "Needs information", exact: true })
        .click();
      await expect(range).toContainText(/^1–/);
      await page
        .getByRole("button", { name: "All products", exact: true })
        .click();
      await next.click();

      const search = page.getByRole("textbox", { name: "Search products" });
      await search.fill("UX test 119");
      await expect(page.locator("tbody tr")).toHaveCount(1);
      await expect(range).toHaveText(`1–1 of 1 products (${total} imported)`);
      await expect(
        page.getByRole("navigation", { name: "Catalog pages" }),
      ).toHaveCount(0);
      await expect(
        page.getByRole("link", { name: /UX test 119/ }),
      ).toBeVisible();
      await search.fill("no matching catalog product");
      await expect(page.locator("tbody tr")).toHaveCount(0);
      await expect(range).toHaveText(`0 products (${total} imported)`);
      await expect(size).toHaveValue("25");
      await page
        .getByRole("button", { name: "Clear search and filters" })
        .click();
      await expect(previous).toBeDisabled();

      await page.setViewportSize({ width: 320, height: 740 });
      await size.selectOption("10");
      await expect(next).toBeVisible();
      await next.click();
      await expect(range).toHaveText(`11–20 of ${total} products`);
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
      await page.setViewportSize({ width: 1280, height: 800 });
    }
  } finally {
    await db.catalogProduct.deleteMany({
      where: { shop: DEMO_SHOP, gid: { in: products.map((p) => p.gid) } },
    });
  }
});

test("delayed navigation shows a quiet status and clears it after loading", async ({
  page,
}) => {
  await page.goto("/app");
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/app/settings.data*", async (route) => {
    await gate;
    await route.continue();
  });
  const navigation = page
    .getByRole("link", { name: "Settings", exact: true })
    .click();
  try {
    await expect(page.locator(".navigation-status")).toHaveText("Loading...");
    expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  } finally {
    release();
  }
  await navigation;
  await expect(
    page.getByRole("heading", { name: "Settings", exact: true }),
  ).toBeVisible();
  await expect(page.locator(".navigation-status")).toBeEmpty();
});

test("GEO checks prioritize imported products and distinguish stored facts from description answers", async ({
  page,
}) => {
  await page.goto("/app/geo");
  await expect(
    page.getByRole("heading", { name: "GEO checks", exact: true }),
  ).toBeVisible();
  await expect(page.locator("tbody tr")).toHaveCount(3);
  await page
    .getByRole("combobox", { name: "Products included in GEO checks" })
    .selectOption("all");
  await expect(page.locator("tbody tr")).toHaveCount(4);
  await page
    .getByRole("textbox", { name: "Search GEO products" })
    .fill("Summit");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await page
    .getByRole("link", { name: "Summit Shell Jacket", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Checks and next steps" }),
  ).toBeVisible();
  const material = page.locator(".geo-check").filter({
    has: page.getByRole("heading", { name: "What is it made from?" }),
  });
  await expect(material).toContainText("Stored fact only");
  await expect(material).toContainText("100% recycled nylon");
  const care = page.locator(".geo-check").filter({
    has: page.getByRole("heading", { name: "How should it be cared for?" }),
  });
  await expect(care).toContainText("No answer is generated");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "test-results/geo-product-mobile.png",
    fullPage: true,
  });
  await page
    .getByRole("link", { name: "Review product facts", exact: true })
    .first()
    .click();
  await expect(
    page.getByRole("heading", { name: "Product facts", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/app/geo");
  await page.screenshot({
    path: "test-results/geo-overview-desktop.png",
    fullPage: true,
  });
});

test("legacy GEO data is marked not checked until a catalog rescan collects it", async ({
  page,
}) => {
  const row = await db.catalogProduct.findFirstOrThrow({
    where: { shop: DEMO_SHOP, title: "Summit Shell Jacket" },
  });
  const product = JSON.parse(row.payload);
  delete product.discovery;
  await db.catalogProduct.update({
    where: { id: row.id },
    data: { payload: JSON.stringify(product) },
  });
  await page.goto(`/app/geo/${row.id}`);
  await expect(
    page.getByText(
      "This product was imported before discovery fields were added.",
      { exact: false },
    ),
  ).toBeVisible();
  await expect(page.getByText("Not checked", { exact: true })).toHaveCount(3);
  await page
    .getByRole("link", { name: "Back to GEO checks", exact: false })
    .click();
  await page.getByRole("button", { name: "Scan catalog" }).click();
  await expect(page.locator(".notice.success")).toContainText("Scan complete");
  await page
    .getByRole("link", { name: "Summit Shell Jacket", exact: true })
    .click();
  await expect(page.getByText("Not checked", { exact: true })).toHaveCount(0);
  await page.getByText("Passed data checks (7)", { exact: true }).click();
  await expect(
    page.getByText("Shopify vendor: Trail Supply.", { exact: true }),
  ).toBeVisible();
});
