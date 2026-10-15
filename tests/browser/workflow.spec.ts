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
  await expect(
    page.getByRole("heading", { name: "Your next step to clearer products" }),
  ).toBeVisible();
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
  await page.getByRole("link", { name: "Review draft", exact: true }).click();
  await expect(page).toHaveURL(/#draft$/);
  await expect(
    page.getByRole("heading", { name: "2. Review the description" }),
  ).toBeVisible();
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
  await page.locator('input[name="material"]').fill("Cotton fleece");
  await page.locator('input[name="confirmed"]').check();
  await page
    .getByRole("button", { name: "Replace draft with these facts" })
    .click();
  await expect(page.locator(".notice.success")).toContainText("Draft created");
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
  await expect(page.getByRole("list", { name: "How it works" })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("link", { name: "Improve a product" }).click();
  await expect(
    page.getByRole("heading", { name: "1. Check the product facts" }),
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
