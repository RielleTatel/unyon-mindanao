import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/platform/database/generated-node/client";
config({ path: ".env.local", quiet: true });

test("submits, edits, discloses and closes an Event Evaluation", async ({ page }) => {
  if (process.env.APP_ENV !== "local" || !["localhost", "127.0.0.1"].includes(new URL(process.env.DATABASE_URL!).hostname)) throw new Error("Local fixture database required");
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  const title = `Evaluation journey ${randomUUID().slice(0, 8)}`;
  try {
    const user = await prisma.portalUser.findUniqueOrThrow({ where: { email: process.env.LOCAL_SUPER_ADMIN_EMAIL! } });
    await prisma.event.create({ data: { title, description: "Completed local browser fixture", category: "Assembly", startsAt: new Date(Date.now() - 7200000), endsAt: new Date(Date.now() - 60000), location: "Local", status: "PUBLISHED", publishedAt: new Date(Date.now() - 86400000), createdByPortalUserId: user.id } });
  } finally { await prisma.$disconnect(); }
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(process.env.LOCAL_SUPER_ADMIN_EMAIL!);
  await page.getByLabel("Password").fill(process.env.LOCAL_SUPER_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL(/\/portal$/u);
  await page.getByRole("link", { name: "Evaluations", exact: true }).click();
  const article = page.getByRole("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
  await expect(article.getByRole("combobox").first()).toBeVisible();
  for (const select of await article.getByRole("combobox").all()) await select.selectOption("4");
  await article.getByRole("button", { name: "Submit evaluation", exact: true }).click();
  await expect(article.getByRole("button", { name: "Update response", exact: true })).toBeVisible();
  for (const select of await article.getByRole("combobox").all()) await select.selectOption("5");
  await article.getByRole("button", { name: "Update response", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Evaluation changes saved.");
  await article.getByRole("link", { name: "View results" }).click();
  await expect(page.getByText("1 responses · Attributable — Super Admin only")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Individual responses" })).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Export CSV" }).click();
  expect((await download).suggestedFilename()).toBe("evaluation-results.csv");
  await page.getByRole("link", { name: "← Evaluations" }).click();
  await article.getByText("Manage evaluation window", { exact: true }).click();
  await article.getByLabel("Closed by administrator", { exact: true }).check();
  await article.getByRole("button", { name: "Save window" }).click();
  await expect(article.getByText("Your response is saved. Editing is closed.")).toBeVisible();
});
