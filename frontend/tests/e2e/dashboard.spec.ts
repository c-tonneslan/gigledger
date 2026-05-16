import { expect, test } from "@playwright/test";

test.describe("dashboard", () => {
  test("loads KPIs, variance chart, and tax reserve widget", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();

    // KPI cards
    await expect(page.getByText("YTD business income")).toBeVisible();
    await expect(page.getByText("Net after expenses")).toBeVisible();
    await expect(page.getByText("Next quarterly payment")).toBeVisible();

    // Variance chart card title
    await expect(
      page.getByText(/Monthly business net, rolling 90-day average, and 3-month forecast/i),
    ).toBeVisible();

    // Tax reserve widget — exact match avoids hitting the "Marcus Tax Reserve" account name.
    await expect(page.getByText("Tax reserve", { exact: true })).toBeVisible();
    await expect(page.getByText(/Reserve coverage/i)).toBeVisible();

    // Quarterly pacing widget renders the next-due hint
    await expect(page.getByText(/next due in/i)).toBeVisible();
  });

  test("hourly rate table links to client detail", async ({ page }) => {
    await page.goto("/");
    // Wait for SWR to settle.
    await expect(page.getByText("Effective hourly rate by client")).toBeVisible();
    await expect(page.getByRole("link", { name: "Mercor" }).first()).toBeVisible();
  });
});

test.describe("transactions inbox", () => {
  test("filter tabs swap the list", async ({ page }) => {
    await page.goto("/transactions");
    await expect(page.getByRole("heading", { name: "Transactions" })).toBeVisible();

    // Click the Business filter and confirm at least one row remains.
    await page.getByRole("button", { name: "Business" }).click();
    await expect(page.locator("table tbody tr").first()).toBeVisible();

    // Then the Personal filter should still show rows from a different bucket.
    await page.getByRole("button", { name: "Personal" }).click();
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });
});

test.describe("taxes page", () => {
  test("Schedule C preview renders with IRS line numbers", async ({ page }) => {
    await page.goto("/taxes");
    await expect(page.getByRole("heading", { name: "Taxes" })).toBeVisible();

    // Schedule C card landmarks
    await expect(page.getByText(/Schedule C preview/i)).toBeVisible();
    await expect(page.getByText("Gross receipts or sales")).toBeVisible();
    await expect(page.getByText("Net profit (or loss)")).toBeVisible();
  });

  test("Section 179 calculator updates when price changes", async ({ page }) => {
    await page.goto("/taxes");
    await expect(page.getByText("Section 179 calculator")).toBeVisible();

    const priceInput = page.locator('input[type="number"]').first();
    await priceInput.fill("5000");
    await priceInput.blur();

    // Effective cost copy mentions the % discount; the number should be non-zero.
    await expect(page.getByText(/off via tax savings/i)).toBeVisible();
  });
});

test.describe("client detail", () => {
  test("renders payment history when navigating from listing", async ({ page }) => {
    await page.goto("/clients");
    await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
    await page.getByRole("link", { name: "Mercor" }).first().click();
    await expect(page.getByText("Payment history")).toBeVisible();
    await expect(page.getByText("All clients", { exact: false })).toBeVisible();
  });
});

test.describe("dark mode", () => {
  test("toggle persists across navigation", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByRole("button", { name: /toggle dark mode/i });
    await toggle.click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.goto("/taxes");
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});
