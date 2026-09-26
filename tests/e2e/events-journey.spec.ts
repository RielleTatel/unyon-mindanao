import { createHash, randomUUID } from "node:crypto";

import { config } from "dotenv";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { d1SqlString, executeLocalD1, queryLocalD1 } from "../fixtures/local-d1-cli";

config({ path: ".env.local" });

const superAdminEmail = process.env.LOCAL_SUPER_ADMIN_EMAIL ?? "admin@unyon.local";
const invitationPassword = "invited-officer-password";
const appOrigin = process.env.E2E_BASE_URL ?? "http://localhost:3000";

test.setTimeout(120_000);

test("University Admin publishes an event, a Representative views it, and turnover revokes access", async ({ page, request, browser }) => {
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
  let adminInvitationIdSeeded = false;
  let universitySeeded = false;

  try {
    const inviterResult = queryLocalD1<{ id: string }>(
      `SELECT id FROM portal_users WHERE email = ${d1SqlString(superAdminEmail)} AND status = 'ACTIVE' LIMIT 1`,
    );
    const inviterId = inviterResult[0]?.id;
    if (!inviterId) throw new Error("Run the local Super Admin bootstrap before the browser journey");

    const adminExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    executeLocalD1(`
      INSERT INTO member_universities (id, name, slug)
      VALUES (${d1SqlString(universityId)}, ${d1SqlString(universityName)}, ${d1SqlString(`events-${suffix}`)});
      INSERT INTO invitations (id, token_hash, email, role, university_id, invited_by_portal_user_id, expires_at)
      VALUES (${d1SqlString(adminInvitationId)}, ${d1SqlString(adminTokenHash)}, ${d1SqlString(adminEmail)},
        'UNIVERSITY_ADMIN', ${d1SqlString(universityId)}, ${d1SqlString(inviterId)}, ${d1SqlString(adminExpiresAt)});
    `);
    universitySeeded = true;
    adminInvitationIdSeeded = true;

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

    const adminResult = queryLocalD1<{ id: string }>(
      `SELECT id FROM portal_users WHERE email = ${d1SqlString(adminEmail)} LIMIT 1`,
    );
    const adminUserId = adminResult[0]?.id;
    if (!adminUserId) throw new Error("University Admin invitation did not create a Portal User");
    representativeToken = invitationToken();
    representativeInvitationId = randomUUID();
    const representativeExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    executeLocalD1(`
      INSERT INTO invitations (id, token_hash, email, role, university_id, invited_by_portal_user_id, expires_at)
      VALUES (${d1SqlString(representativeInvitationId)},
        ${d1SqlString(createHash("sha256").update(representativeToken).digest("hex"))},
        ${d1SqlString(representativeEmail)}, 'REPRESENTATIVE', ${d1SqlString(universityId)},
        ${d1SqlString(adminUserId)}, ${d1SqlString(representativeExpiresAt)});
    `);

    await acceptInvitation(page, request, representativeToken, representativeEmail, "Journey Representative", universityName, "Representative");
    await page.goto("/portal/events?view=calendar");
    await expect(page.getByRole("link", { name: title })).toBeVisible();
    await page.getByRole("link", { name: title }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByText("published", { exact: true })).toBeVisible();

    const adminPage = await browser.newPage({ viewport: page.viewportSize() });
    adminPage.setDefaultTimeout(10_000);
    try {
      await adminPage.goto(new URL("/sign-in", appOrigin).toString());
      await adminPage.getByLabel("Email address", { exact: true }).fill(adminEmail);
      await adminPage.getByLabel("Password", { exact: true }).fill(invitationPassword);
      await adminPage.getByRole("button", { name: "Sign in securely", exact: true }).click();
      await expect(adminPage).toHaveURL(/\/portal$/u);
      await adminPage.goto(new URL("/portal/birthdays?month=2", appOrigin).toString());
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
      await adminPage.goto(new URL("/portal", appOrigin).toString());
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
    const cleanupTime = new Date().toISOString();
    const invitationIds = [
      ...(adminInvitationIdSeeded ? [adminInvitationId] : []),
      ...(representativeInvitationId ? [representativeInvitationId] : []),
    ];
    const cleanup: string[] = [];
    if (invitationIds.length > 0) {
      const ids = invitationIds.map(d1SqlString).join(", ");
      cleanup.push(`UPDATE invitations SET status = 'REVOKED', revoked_at = ${d1SqlString(cleanupTime)}, updated_at = ${d1SqlString(cleanupTime)} WHERE id IN (${ids}) AND status = 'PENDING';`);
    }
    if (eventId) {
      cleanup.push(`UPDATE events SET status = 'ARCHIVED', archived_at = ${d1SqlString(cleanupTime)}, version = version + 1, updated_at = ${d1SqlString(cleanupTime)} WHERE id = ${d1SqlString(eventId)} AND status <> 'ARCHIVED';`);
    }
    if (universitySeeded) {
      cleanup.push(`UPDATE appointments SET ends_at = ${d1SqlString(cleanupTime)} WHERE university_id = ${d1SqlString(universityId)} AND ends_at IS NULL;`);
      cleanup.push(`UPDATE member_universities SET status = 'ARCHIVED', updated_at = ${d1SqlString(cleanupTime)} WHERE id = ${d1SqlString(universityId)} AND status = 'ACTIVE';`);
    }
    if (cleanup.length > 0) executeLocalD1(cleanup.join("\n"));
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
