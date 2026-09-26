import { createHash, randomUUID } from "node:crypto";

import { config } from "dotenv";
import { expect, test } from "@playwright/test";
import { d1SqlString, executeLocalD1, queryLocalD1 } from "../fixtures/local-d1-cli";

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
  const inviters = queryLocalD1<{ id: string }>(
    `SELECT id FROM portal_users WHERE email = ${d1SqlString(localAdminEmail)} AND status = 'ACTIVE' LIMIT 1`,
  );
  const inviterId = inviters[0]?.id;

  if (!inviterId) {
    throw new Error("Run the local D1 Super Admin bootstrap before the browser journey");
  }

  const universityId = randomUUID();
  const invitationId = randomUUID();
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  executeLocalD1(`
    INSERT INTO member_universities (id, name, slug) VALUES (
      ${d1SqlString(universityId)}, ${d1SqlString(universityName)}, ${d1SqlString(`invitation-${randomUUID()}`)}
    );
    INSERT INTO invitations (
      id, token_hash, email, role, university_id, invited_by_portal_user_id, expires_at
    ) VALUES (
      ${d1SqlString(invitationId)}, ${d1SqlString(tokenHash)}, ${d1SqlString(email)},
      'UNIVERSITY_ADMIN', ${d1SqlString(universityId)}, ${d1SqlString(inviterId)}, ${d1SqlString(expiresAt)}
    );
  `);

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
