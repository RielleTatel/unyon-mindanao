import { createHash, randomUUID } from "node:crypto";

import { config } from "dotenv";
import { Client } from "pg";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

config({ path: ".env.local" });

const superAdminEmail = process.env.LOCAL_SUPER_ADMIN_EMAIL ?? "admin@unyon.local";
const invitationPassword = "invited-officer-password";

test.setTimeout(120_000);

test("University Admin publishes an event, a Representative views it, and turnover revokes access", async ({ page, request, browser }) => {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("DATABASE_URL is required for the event browser journey");

  const database = new Client({ connectionString: databaseUrl });
  await database.connect();

  const suffix = randomUUID();
  const universityId = randomUUID();
  const universityName = `Events Journey ${suffix}`;
  const adminEmail = `university-admin-${suffix}@unyon.local`;
  const representativeEmail = `representative-${suffix}@unyon.local`;
  const adminToken = invitationToken();
  const adminInvitationId = randomUUID();
  const adminTokenHash = createHash("sha256").update(adminToken).digest("hex");
  let eventId: string | null = null;
  let representativeInvitationId: string | null = null;
  let representativeToken: string | null = null;

  try {
    const inviterResult = await database.query<{ id: string }>(
      "SELECT id FROM portal_users WHERE email = $1 AND status = 'ACTIVE'",
      [superAdminEmail],
    );
    const inviterId = inviterResult.rows[0]?.id;
    if (!inviterId) throw new Error("Run the local Super Admin bootstrap before the browser journey");

    await database.query(
      `INSERT INTO member_universities (id, name, slug, updated_at)
       VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
      [universityId, universityName, `events-${suffix}`],
    );
    await database.query(
      `INSERT INTO invitations (id, token_hash, email, role, university_id, invited_by_portal_user_id, expires_at, updated_at)
       VALUES ($1, $2, $3, 'UNIVERSITY_ADMIN', $4, $5, CURRENT_TIMESTAMP + INTERVAL '7 days', CURRENT_TIMESTAMP)`,
      [adminInvitationId, adminTokenHash, adminEmail, universityId, inviterId],
    );

    await acceptInvitation(page, request, adminToken, adminEmail, "Journey University Admin", universityName, "University Admin");
    await expect(page.getByRole("link", { name: "Team" })).toBeVisible();

    await page.goto("/portal/events");
    const title = `Mindanao Leadership Forum ${suffix.slice(0, 8)}`;
    const form = page.locator("form").filter({ has: page.getByRole("button", { name: "Save event draft" }) });
    await form.getByLabel("Event title").fill(title);
    await form.getByLabel("Category").fill("Leadership forum");
    await form.getByLabel("Description").fill("A working prototype journey across the Unyon Mindanao network.");
    await form.getByLabel("Starts").fill(futureManilaTime(2, 10, 0));
    await form.getByLabel("Ends").fill(futureManilaTime(2, 12, 0));
    await form.getByLabel("Physical venue").fill("Davao City");
    await form.getByRole("button", { name: "Save event draft" }).click();

    const eventCard = page.locator("article").filter({ has: page.getByRole("heading", { name: title, exact: true }) });
    await expect(eventCard).toBeVisible();
    await expect(eventCard.getByText("draft", { exact: true })).toBeVisible();
    eventId = new URL(await eventCard.getByRole("link", { name: title }).getAttribute("href") ?? "", "http://localhost").pathname.split("/").at(-1) ?? null;
    await eventCard.getByRole("button", { name: "Publish event" }).click();
    await expect(eventCard.getByText("published", { exact: true })).toBeVisible();

    const adminResult = await database.query<{ id: string }>("SELECT id FROM portal_users WHERE email = $1", [adminEmail]);
    const adminUserId = adminResult.rows[0]?.id;
    if (!adminUserId) throw new Error("University Admin invitation did not create a Portal User");
    representativeToken = invitationToken();
    representativeInvitationId = randomUUID();
    await database.query(
      `INSERT INTO invitations (id, token_hash, email, role, university_id, invited_by_portal_user_id, expires_at, updated_at)
       VALUES ($1, $2, $3, 'REPRESENTATIVE', $4, $5, CURRENT_TIMESTAMP + INTERVAL '7 days', CURRENT_TIMESTAMP)`,
      [representativeInvitationId, createHash("sha256").update(representativeToken).digest("hex"), representativeEmail, universityId, adminUserId],
    );

    await acceptInvitation(page, request, representativeToken, representativeEmail, "Journey Representative", universityName, "Representative");
    await page.goto("/portal/events?view=calendar");
    await expect(page.getByRole("link", { name: title })).toBeVisible();
    await page.getByRole("link", { name: title }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("published", { exact: true })).toBeVisible();

    const adminPage = await browser.newPage({ viewport: page.viewportSize() });
    adminPage.setDefaultTimeout(10_000);
    try {
      await adminPage.goto("http://localhost:3000/sign-in");
      await adminPage.getByLabel("Email address", { exact: true }).fill(adminEmail);
      await adminPage.getByLabel("Password", { exact: true }).fill(invitationPassword);
      await adminPage.getByRole("button", { name: "Sign in securely", exact: true }).click();
      await expect(adminPage).toHaveURL(/\/portal$/u);
      await adminPage.goto("http://localhost:3000/portal/birthdays?month=2");
      await adminPage.getByLabel("Portal User", { exact: true }).selectOption({ label: "Journey Representative" });
      await adminPage.getByLabel("Confirm your password").fill(invitationPassword);
      await adminPage.getByRole("button", { name: "View full birth date" }).click();
      await expect(adminPage.getByLabel("Full birth date", { exact: true })).toBeVisible();
      await adminPage.getByLabel("Full birth date", { exact: true }).fill("2000-02-29");
      await adminPage.getByRole("button", { name: "Save birth date" }).click();
      await expect(adminPage.getByRole("status")).toContainText("Birth date saved");
      await page.goto("/portal/birthdays?month=2");
      await expect(page.getByRole("heading", { name: "Journey Representative", exact: true })).toBeVisible();
      await expect(page.getByText("February 29", { exact: true })).toBeVisible();
      await expect(page.getByRole("heading", { name: "Manage birth dates" })).toHaveCount(0);
      expect(await page.content()).not.toContain("2000-02-29");
      await adminPage.goto("http://localhost:3000/portal");
      await adminPage.getByRole("link", { name: "Team", exact: true }).click();
      const officer = adminPage.getByRole("listitem").filter({ has: adminPage.getByRole("heading", { name: "Journey Representative", exact: true }) });
      await expect(officer).toContainText("Active");
      await officer.getByLabel("Confirm your password").fill(invitationPassword);
      await officer.getByRole("button", { name: "End Appointment", exact: true }).click();
      await expect(officer).toContainText("Inactive");
      await expect(officer.getByRole("button", { name: "End Appointment" })).toHaveCount(0);
      await page.reload();
      await expect(page).toHaveURL(/\/sign-in/u);
    } finally {
      await adminPage.close();
    }
  } finally {
    await database.query("UPDATE invitations SET status = 'REVOKED', revoked_at = CURRENT_TIMESTAMP WHERE id = ANY($1::uuid[]) AND status = 'PENDING'", [[adminInvitationId, ...(representativeInvitationId ? [representativeInvitationId] : [])]]);
    if (eventId) {
      await database.query("UPDATE events SET status = 'ARCHIVED', archived_at = CURRENT_TIMESTAMP, version = version + 1 WHERE id = $1", [eventId]);
    }
    await database.query("UPDATE appointments SET ends_at = CURRENT_TIMESTAMP WHERE university_id = $1 AND ends_at IS NULL", [universityId]);
    await database.query("UPDATE member_universities SET status = 'ARCHIVED', updated_at = CURRENT_TIMESTAMP WHERE id = $1", [universityId]);
    await database.end();
  }
});

async function acceptInvitation(
  page: Page,
  request: APIRequestContext,
  token: string,
  email: string,
  fullName: string,
  universityName: string,
  role: "University Admin" | "Representative",
) {
  await page.goto(`/accept-invitation#${token}`);
  await expect(page.getByText(universityName)).toBeVisible();
  await expect(page.getByText(new RegExp(`as a ${role}`, "u"))).toBeVisible();
  await page.getByLabel("Full name").fill(fullName);
  await page.getByLabel("Password").fill(invitationPassword);
  await page.getByRole("button", { name: "Create account and verify email" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");

  const codesResponse = await request.get("http://127.0.0.1:9099/emulator/v1/projects/unyon-mindanao-local/oobCodes");
  const codes = (await codesResponse.json()) as { oobCodes: Array<{ email: string; oobLink: string; requestType: string }> };
  const verification = codes.oobCodes.toReversed().find((code) => code.email === email && code.requestType === "VERIFY_EMAIL");
  expect(verification).toBeDefined();
  expect((await request.get(verification!.oobLink)).ok()).toBe(true);

  await page.getByLabel("Password").fill(invitationPassword);
  await page.getByRole("button", { name: "Sign in and accept invitation" }).click();
  await expect(page).toHaveURL(/\/portal$/u);
}

function invitationToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function futureManilaTime(daysAhead: number, hour: number, minute: number) {
  const date = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit", month: "2-digit", timeZone: "Asia/Manila", year: "numeric",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
