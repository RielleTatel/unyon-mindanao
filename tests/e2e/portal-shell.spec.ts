import { expect, test } from "@playwright/test";

test("Portal User sees the private Confederation workspace", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "One private space for Unyon Mindanao" }),
  ).toBeVisible();
  await expect(page.getByText("Authorized access only")).toBeVisible();
  const signInLink = page.getByRole("link", { name: "Sign in" }).first();
  await expect(signInLink).toHaveAttribute("href", "/sign-in");
  await expect(page.locator("main article")).toHaveCount(3);
  await expect(page.locator("main [class*='shadow-']")).toHaveCount(0);
  await expect(page.locator("main article[class*='rounded-']")).toHaveCount(0);
  await expect(page.getByText(/year 5/i)).toHaveCount(0);
  await expect(page.getByText(/anchored in the currents/i)).toHaveCount(0);
});
