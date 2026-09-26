import { randomUUID } from "node:crypto";
import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { d1SqlString, executeLocalD1, queryLocalD1 } from "../fixtures/local-d1-cli";
config({ path: ".env.local", quiet: true });

test("submits, edits, discloses and closes an Event Evaluation", async ({ page }) => {
  test.skip(
    process.env.E2E_PERSISTENCE_PROVIDER !== "d1",
    "This journey seeds D1 directly and runs in the Worker E2E suite.",
  );

  const eventId = randomUUID();
  const title = `Evaluation journey ${randomUUID().slice(0, 8)}`;
  const users = queryLocalD1<{ id: string }>(
    `SELECT id FROM portal_users WHERE email = ${d1SqlString(process.env.LOCAL_SUPER_ADMIN_EMAIL!)} AND status = 'ACTIVE' LIMIT 1`,
  );
  const user = users[0];
  if (!user) throw new Error("Run the local D1 Super Admin bootstrap before the browser journey");
  const startsAt = new Date(Date.now() - 7_200_000).toISOString();
  const endsAt = new Date(Date.now() - 60_000).toISOString();
  const publishedAt = new Date(Date.now() - 86_400_000).toISOString();
  const now = new Date().toISOString();
  executeLocalD1(`
    INSERT INTO events (
      id, title, description, category, status, starts_at, ends_at, all_day,
      location, created_by_portal_user_id, published_at, created_at, updated_at
    ) VALUES (
      ${d1SqlString(eventId)}, ${d1SqlString(title)}, 'Completed local browser fixture',
      'Assembly', 'PUBLISHED', ${d1SqlString(startsAt)}, ${d1SqlString(endsAt)},
      0, 'Local', ${d1SqlString(user.id)}, ${d1SqlString(publishedAt)},
      ${d1SqlString(now)}, ${d1SqlString(now)}
    );
  `);
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
