import { expect, test } from "@playwright/test";

test("Portal User sees the private Confederation workspace", async ({ page }) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "One private space for Unyon Mindanao" }),
  ).toBeVisible();
  await expect(page.getByText("Private portal")).toHaveCount(1);
  await expect(page.getByText("Authorized access only")).toBeVisible();
  const signInLink = page.getByRole("link", { name: "Sign in" }).first();
  await expect(signInLink).toHaveAttribute("href", "/sign-in");
  await expect(signInLink).toHaveCSS("color", "rgb(255, 253, 242)");
  await expect(page.getByText("01")).toHaveCSS("color", "rgb(83, 98, 75)");
  await expect(page.getByText(/year 5/i)).toHaveCount(0);
  await expect(page.getByText(/anchored in the currents/i)).toHaveCount(0);
});
