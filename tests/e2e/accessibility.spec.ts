import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

async function expectNoAccessibilityViolations(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22a", "wcag22aa"]).analyze();
  expect(violations.map(({ id, impact, nodes }) => ({ id, impact, count: nodes.length })), `WCAG violations at ${page.url()}`).toEqual([]);
}

test("public entry points support keyboard, reduced motion and WCAG checks", async ({ page }) => {
  await page.goto("/");
  await expectNoAccessibilityViolations(page);
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "UNYON MINDANAO" })).toBeFocused();
  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior)).toBe("auto");
  await page.goto("/sign-in");
  await expectNoAccessibilityViolations(page);
});

test("authenticated workspace passes WCAG checks", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(process.env.LOCAL_SUPER_ADMIN_EMAIL!);
  await page.getByLabel("Password").fill(process.env.LOCAL_SUPER_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL(/\/portal$/u);
  for (const path of ["/portal", "/portal/events", "/portal/announcements", "/portal/birthdays", "/portal/financial-reports", "/portal/evaluations", "/portal/shortcuts", "/portal/profile", "/portal/team", "/portal/universities", "/portal/accounts", "/portal/audit"]) {
    await page.goto(path);
    await expectNoAccessibilityViolations(page);
  }
});
