import { expect, test, type Page } from "@playwright/test";

const EMAIL = process.env.E2E_EMAIL ?? "admin@missiria.dev";
const PASSWORD = process.env.E2E_PASSWORD ?? "admin12345";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL("**/");
}

test.describe("Spider smoke", () => {
  test("redirects anonymous visitors to login and keeps the token out of JS", async ({
    page,
  }) => {
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
    await login(page);
    const cookies = await page.context().cookies();
    const session = cookies.find((c) => c.name === "spider_session");
    expect(session?.httpOnly).toBe(true);
    expect(
      await page.evaluate(() => document.cookie.includes("spider_session")),
    ).toBe(false);
    expect(
      await page.evaluate(() =>
        Object.keys(localStorage).some((k) => /token|session/i.test(k)),
      ),
    ).toBe(false);
  });

  test("overview shows the fleet table, sorts and filters", async ({
    page,
  }) => {
    await login(page);
    await expect(
      page.getByRole("heading", { name: "Fleet overview" }),
    ).toBeVisible();
    await expect(page.locator("table tbody tr").first()).toBeVisible();
    await page.getByLabel("Filter sites").fill("iptv");
    await expect(page.locator("table tbody tr").first()).toContainText("iptv");
    await page
      .getByTitle("Position vs previous period (green = improved)")
      .click();
    await expect(page.locator("th[aria-sort='ascending']")).toHaveCount(1);
  });

  test("property page: period picker, regex filter, breakdown tables", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/properties");
    await page.getByRole("link", { name: "iptv-shark.com" }).first().click();
    await expect(
      page.getByRole("heading", { name: "iptv-shark.com" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "7d" }).click();
    // 7 days ending today − 3 (GSC lag), computed so the test does not depend on the run date
    const end = new Date(Date.now() - 3 * 86_400_000);
    const start = new Date(end.getTime() - 6 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await expect(
      page.getByRole("heading", { name: new RegExp(`Top queries · ${start}`) }),
    ).toBeVisible();
    await page.getByLabel("Include regex").first().fill("^iptv (test|essai)");
    await page.getByRole("button", { name: "Apply" }).nth(1).click();
    await expect(page.getByText(/Server filter:/)).toBeVisible();
    // one filter state governs the page: KPI banner + other dimensions flagged, not silently unfiltered
    await expect(
      page.getByText(/KPIs, chart and comparison use these rows only/),
    ).toBeVisible();
    await expect(
      page
        .getByText(/Not available while a (page|query) filter is active/)
        .first(),
    ).toBeVisible();
    await page.getByRole("button", { name: "Clear filter" }).click();
    await expect(
      page.getByText(/KPIs, chart and comparison use these rows only/),
    ).toHaveCount(0);
    // country rows filter the page (28d: the latest dimension rows may still be syncing)
    await page.getByRole("button", { name: "28d" }).click();
    await page
      .getByTitle(/^Filter the page to /)
      .first()
      .click();
    await expect(page.getByText(/Filtered by/)).toContainText("country");
    await expect(
      page.getByRole("heading", { name: "Countries" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Devices" })).toBeVisible();
  });

  test("opportunities inbox lists findings and records a note", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/opportunities");
    await expect(
      page.getByRole("heading", { name: "Opportunities" }),
    ).toBeVisible();
    // the item counter renders after data + hydration; selecting earlier can lose the change event
    await expect(page.locator("span.ml-auto")).toContainText(/items?$/);
    await page
      .locator('select[aria-label="Rule"]')
      .selectOption("cannibalization");
    await expect(page.locator("span.ml-auto")).toContainText(/^16 items$/);
    const first = page.locator("a[href^='/opportunities/']").first();
    await expect(first).toContainText(/Possible cannibalization/);
    await first.click();
    await expect(page.getByRole("heading", { name: "Evidence" })).toBeVisible();
    await page.getByPlaceholder("Add a note…").fill("e2e note");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.locator("ol li").first()).toContainText("e2e note");
  });

  test("reports page creates a template and exposes PDF/CSV/JSON exports", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/reports");
    await expect(page.getByRole("heading", { name: "Reports" })).toBeVisible();
    await page.getByRole("button", { name: "New report" }).click();
    const name = `E2E fleet report ${Date.now()}`;
    await page.getByLabel("Name").fill(name);
    await page.getByRole("button", { name: "Create report" }).click();
    const card = page
      .locator("h2", { hasText: name })
      .locator("..")
      .locator("..");
    await expect(card).toBeVisible();
    await expect(card.getByRole("link", { name: /PDF/ })).toHaveAttribute(
      "href",
      /\/api\/reports\/\d+\/export\.pdf/,
    );
    const pdf = await page.request.get(
      (await card
        .getByRole("link", { name: /PDF/ })
        .getAttribute("href")) as string,
    );
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    page.once("dialog", (d) => d.accept());
    await card.getByRole("button", { name: "Delete" }).click();
    await expect(page.locator("h2", { hasText: name })).toHaveCount(0);
  });

  test("system page shows sync health; settings shows rules; sign out clears the session", async ({
    page,
  }) => {
    await login(page);
    await page.goto("/system");
    await expect(
      page.getByRole("heading", { name: "Sync health" }),
    ).toBeVisible();
    await page.goto("/settings");
    await expect(
      page.getByRole("heading", { name: "Opportunity rules" }),
    ).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Alerts", exact: true }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Webhooks" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Report branding" }),
    ).toBeVisible();
    await page.getByRole("button", { name: "Sign out" }).click();
    await expect(page).toHaveURL(/\/login$/);
    await page.goto("/");
    await expect(page).toHaveURL(/\/login$/);
  });
});
