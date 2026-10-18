import { expect, test } from "@playwright/test";

// MISS-0116: public account pages. Runs signed out against web 3010 + API 8012.
test.describe("auth pages", () => {
  test.use({ permissions: ["clipboard-read", "clipboard-write"] });

  test("password field shows, hides and copies the value", async ({ page }) => {
    await page.goto("/login");
    const input = page.getByLabel("Password", { exact: true });
    await input.fill("Secret-pass-42");
    await expect(input).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Show password" }).click();
    await expect(input).toHaveAttribute("type", "text");
    await page.getByRole("button", { name: "Hide password" }).click();
    await expect(input).toHaveAttribute("type", "password");
    await page.getByRole("button", { name: "Copy password" }).click();
    await expect(
      page.getByRole("button", { name: "Password copied" }),
    ).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "Secret-pass-42",
    );
  });

  test("?next never leaves the site", async ({ page }) => {
    for (const next of [
      "/\\evil.example",
      "//evil.example",
      "/.//evil.example",
      "https://evil.example/x",
    ]) {
      await page.goto(`/login?next=${encodeURIComponent(next)}`, {
        waitUntil: "networkidle",
      });
      await page
        .getByLabel("Email")
        .fill(process.env.E2E_EMAIL ?? "admin@missiria.dev");
      await page
        .getByLabel("Password", { exact: true })
        .fill(process.env.E2E_PASSWORD ?? "admin12345");
      await page.getByRole("button", { name: "Sign in" }).click();
      await expect(page).toHaveURL("http://127.0.0.1:3010/");
      await page.context().clearCookies();
    }
  });

  test("tabs switch between sign in and create account, keeping ?next", async ({
    page,
  }) => {
    await page.goto("/login?next=/reports");
    await page.getByRole("link", { name: "Create account" }).click();
    await expect(page).toHaveURL(/\/register\?next=%2Freports$/);
    await expect(
      page.getByRole("heading", { name: "Create your account" }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Sign in" }).click();
    await expect(
      page.getByRole("heading", { name: "Welcome back" }),
    ).toBeVisible();
  });

  test("register asks to confirm the email; that account cannot sign in yet", async ({
    page,
  }) => {
    const email = `pw-${Date.now()}@example.com`;
    await page.goto("/register", { waitUntil: "networkidle" });
    await page.getByLabel("Full name").fill("Playwright Person");
    await page.getByLabel("Work email").fill(email);
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByRole("button", { name: "Request access" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "at least 10 characters" }),
    ).toBeVisible();
    await page
      .getByLabel("Password", { exact: true })
      .fill("Playwright-pass-1");
    await page.getByRole("button", { name: "Request access" }).click();
    await expect(
      page.getByRole("heading", { name: "Confirm your email" }),
    ).toBeVisible();

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page
      .getByLabel("Password", { exact: true })
      .fill("Playwright-pass-1");
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(
      page.getByRole("status").filter({ hasText: "Confirm your email first" }),
    ).toBeVisible();
  });

  test("forgot password answers the same for any email; reset without token explains", async ({
    page,
  }) => {
    await page.goto("/login");
    await page.getByRole("link", { name: "Forgot password?" }).click();
    await expect(page).toHaveURL(/\/forgot-password$/);
    // dev server compiles the route on first visit: submit only once it is interactive
    await page.waitForLoadState("networkidle");
    await page.getByLabel("Email").fill("nobody@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();
    await expect(
      page.getByRole("heading", { name: "Check your inbox" }),
    ).toBeVisible();
    await page.goto("/verify-email?token=not-a-real-token-but-long-enough", {
      waitUntil: "networkidle",
    });
    await page.getByLabel("Password", { exact: true }).fill("Whatever-pass-1");
    await page.getByRole("button", { name: "Confirm email" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "invalid or has expired" }),
    ).toBeVisible();
    await page.goto("/reset-password");
    await expect(
      page.getByRole("heading", { name: "This link is incomplete" }),
    ).toBeVisible();
    await page.goto("/reset-password?token=not-a-real-token-but-long-enough", {
      waitUntil: "networkidle",
    });
    const fields = page.locator("input[autocomplete=new-password]");
    await fields.nth(0).fill("Brand-new-pass-1");
    await fields.nth(1).fill("Brand-new-pass-1");
    await page.getByRole("button", { name: "Save new password" }).click();
    await expect(
      page.getByRole("alert").filter({ hasText: "invalid or has expired" }),
    ).toBeVisible();
  });
});
