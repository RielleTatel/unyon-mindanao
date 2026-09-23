import { createHash, randomUUID } from "node:crypto";

import { config } from "dotenv";
import { Client } from "pg";
import { expect, test } from "@playwright/test";

config({ path: ".env.local" });

const localAdminEmail = process.env.LOCAL_SUPER_ADMIN_EMAIL ?? "admin@unyon.local";

test.use({ trace: "off" });

test("a verified invited admin accepts a one-time invitation and enters its scoped portal", async ({
  page,
  request,
}) => {
  const token = randomToken();
  const email = `university-admin-${crypto.randomUUID()}@unyon.local`;
  const universityName = `Invitation Journey ${crypto.randomUUID()}`;
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for the invitation browser journey");
  }

  const database = new Client({ connectionString: databaseUrl });
  await database.connect();
  const inviter = await database.query<{ id: string }>(
    `SELECT id FROM portal_users WHERE email = $1 AND status = 'ACTIVE'`,
    [localAdminEmail],
  );
  const inviterId = inviter.rows[0]?.id;

  if (!inviterId) {
    await database.end();
    throw new Error("Run the local Super Admin bootstrap before the browser journey");
  }

  const universityId = randomUUID();
  const invitationId = randomUUID();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await database.query(
    `INSERT INTO member_universities (id, name, slug, updated_at)
     VALUES ($1, $2, $3, CURRENT_TIMESTAMP)`,
    [universityId, universityName, `invitation-${randomUUID()}`],
  );
  await database.query(
    `INSERT INTO invitations (
       id, token_hash, email, role, university_id, invited_by_portal_user_id,
       expires_at, updated_at
     ) VALUES ($1, $2, $3, 'UNIVERSITY_ADMIN', $4, $5, $6, CURRENT_TIMESTAMP)`,
    [invitationId, tokenHash, email, universityId, inviterId, expiresAt],
  );
  await database.end();

  const password = "invited-admin-password";
  await page.goto(`/accept-invitation#${token}`);
  await expect(page.getByText(universityName)).toBeVisible();
  await page.getByLabel("Full name").fill("Invited University Admin");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Create account and verify email" }).click();
  await expect(page.getByRole("status")).toContainText("Check your email");

  const codesResponse = await request.get(
    "http://127.0.0.1:9099/emulator/v1/projects/unyon-mindanao-local/oobCodes",
  );
  const codes = (await codesResponse.json()) as {
    oobCodes: Array<{ email: string; oobLink: string; requestType: string }>;
  };
  const verification = codes.oobCodes
    .toReversed()
    .find((code) => code.email === email && code.requestType === "VERIFY_EMAIL");

  expect(verification).toBeDefined();
  expect((await request.get(verification!.oobLink)).ok()).toBe(true);

  await page.getByLabel("Full name").fill("Invited University Admin");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in and accept invitation" }).click();

  await expect(page).toHaveURL(/\/portal$/u);
  await expect(page.getByRole("heading", { name: "UNIVERSITY ADMIN" })).toBeVisible();
  await expect(page.getByText("Scoped to a Member University")).toBeVisible();
});

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
