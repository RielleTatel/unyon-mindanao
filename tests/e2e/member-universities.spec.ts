import { expect, test } from "@playwright/test";

const localEmail = process.env.LOCAL_SUPER_ADMIN_EMAIL ?? "admin@unyon.local";
const localPassword =
  process.env.LOCAL_SUPER_ADMIN_PASSWORD ?? "local-unyon-admin";

test("Super Admin creates, edits, archives, and restores a Member University", async ({
  page,
}) => {
  await page.goto("/portal/universities");
  await expect(page).toHaveURL(/\/sign-in$/u);
  await page.getByLabel("Email address").fill(localEmail);
  await page.getByLabel("Password").fill(localPassword);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL(/\/portal$/u);
  await page.goto("/portal/universities");

  await expect(
    page.getByRole("heading", { name: "Member University directory" }),
  ).toBeVisible();

  const suffix = crypto.randomUUID();
  const name = `Mindanao University ${suffix}`;
  const slug = `mindanao-university-${suffix.toLowerCase()}`;
  const updatedName = `${name} Updated`;
  const createForm = page
    .locator("form")
    .filter({ has: page.getByRole("button", { name: "Create university" }) });
  await createForm.getByLabel("Member University name").fill(name);
  await createForm.getByRole("button", { name: "Create university" }).click();

  const card = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(card).toBeVisible();
  await expect(card.getByText(`/${slug}`, { exact: true })).toBeVisible();

  await card.getByLabel("Member University name").fill(updatedName);
  await card.getByRole("button", { name: "Save changes" }).click();
  const updatedCard = page
    .locator("article")
    .filter({ has: page.getByRole("heading", { name: updatedName, exact: true }) });
  await expect(updatedCard).toBeVisible();

  await updatedCard.getByRole("button", { name: "Archive" }).click();
  await expect(updatedCard.getByText("Archived", { exact: true })).toBeVisible();

  await updatedCard.getByRole("button", { name: "Restore" }).click();
  await expect(updatedCard.getByText("Active", { exact: true })).toBeVisible();
});
