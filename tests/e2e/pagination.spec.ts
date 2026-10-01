import { config } from "dotenv";
import { expect, test } from "@playwright/test";

config({ path: ".env.local", quiet: true });

test("Announcement pagination retains page size and supports a stable return to the first page", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(process.env.LOCAL_SUPER_ADMIN_EMAIL!);
  await page.getByLabel("Password").fill(process.env.LOCAL_SUPER_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL(/\/portal$/u);

  // Create two drafts through the same protected form users operate.
  await page.goto("/portal/announcements");
  await page.getByText("Create Announcement", { exact: true }).click();
  const editor = page.locator("details").filter({ has: page.getByText("Create Announcement", { exact: true }) });
  for (const title of ["Pagination fixture A", "Pagination fixture B"]) {
    await editor.getByLabel("Title", { exact: true }).fill(`${title} ${crypto.randomUUID()}`);
    await editor.getByLabel("Announcement text").fill("Synthetic navigation fixture.");
    const save = editor.getByRole("button", { name: "Save draft", exact: true });
    await save.click();
    await expect(editor.getByRole("status")).toContainText("Changes saved.");
    await expect(save).toBeEnabled();
  }
  await page.goto("/portal/announcements?pageSize=1");
  await expect(page.getByRole("article")).toHaveCount(1);
  const firstTitle = await page.getByRole("article").getByRole("heading").innerText();
  const navigation = page.getByRole("navigation", { name: "Pagination" });
  await navigation.getByRole("link", { name: "Next page" }).click();
  await expect(page).toHaveURL(/page=1&?[^#]*pageSize=1|pageSize=1&?[^#]*page=1/u);
  await expect(page.getByRole("article")).toHaveCount(1);
  await page.getByRole("navigation", { name: "Pagination" }).getByRole("link", { name: "Previous page" }).click();
  await expect(page.getByRole("article").getByRole("heading")).toHaveText(firstTitle);
});
