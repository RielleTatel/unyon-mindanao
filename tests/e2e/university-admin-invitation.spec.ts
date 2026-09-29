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
  test.skip(
    process.env.E2E_PERSISTENCE_PROVIDER !== "d1",
    "This journey seeds D1 directly and runs in the Worker E2E suite.",
  );

  const email = `university-admin-${crypto.randomUUID()}@unyon.local`;
  const { token, universityName } = seedUniversityAdminInvitation(email);

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
  expect(verification!.oobLink).not.toContain(token);
  expect((await request.get(verification!.oobLink)).ok()).toBe(true);

  await page.goto("/accept-invitation");
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("reopen the original private invitation link");
  await page.goto(`/accept-invitation#${token}`);
  await expect(page.getByText(universityName)).toBeVisible();

  await page.getByRole("button", { name: "Already have an account? Sign in" }).click();
  await page.getByLabel("Full name").fill("Invited University Admin");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in and accept invitation" }).click();

  await expect(page).toHaveURL(/\/portal$/u);
  await expect(page.getByRole("heading", { name: "UNIVERSITY ADMIN" })).toBeVisible();
  await expect(page.getByText("Scoped to a Member University")).toBeVisible();

  await page.goto("/portal/team");
  const teamCard = page.locator("section").filter({
    has: page.getByRole("heading", { name: universityName, exact: true }),
  }).first();
  const representativeEmail = `representative-${crypto.randomUUID()}@unyon.local`;
  await teamCard.getByLabel("Representative email").fill(representativeEmail);
  await teamCard.getByRole("button", { name: "Create invitation link" }).click();
  const issuedRepresentative = teamCard.getByRole("region", { name: "New invitation link" });
  await expect(issuedRepresentative).toBeVisible();
  await expect(issuedRepresentative).toContainText(representativeEmail);
  await expect(issuedRepresentative).toContainText("Representative");
  const representativeUrl = await issuedRepresentative.getByLabel("Invitation link").inputValue();
  expect(representativeUrl).toContain("/accept-invitation#");
  await page.reload();
  await expect(page.getByRole("region", { name: "New invitation link" })).toHaveCount(0);
  await expect(page.getByText(representativeEmail)).toBeVisible();
});

test("an existing verified Firebase account signs in to accept a private invitation", async ({
  page,
  request,
}) => {
  test.skip(
    process.env.E2E_PERSISTENCE_PROVIDER !== "d1",
    "This journey seeds D1 directly and runs in the Worker E2E suite.",
  );

  const email = `existing-account-${crypto.randomUUID()}@unyon.local`;
  const password = "existing-invitee-password";
  const signup = await request.post(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake-api-key",
    { data: { email, password, returnSecureToken: true } },
  );
  expect(signup.ok()).toBe(true);
  const { idToken } = (await signup.json()) as { idToken: string };
  const verificationRequest = await request.post(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=fake-api-key",
    { data: { idToken, requestType: "VERIFY_EMAIL" } },
  );
  expect(verificationRequest.ok()).toBe(true);
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

  const { token, universityName } = seedUniversityAdminInvitation(email);
  await page.goto(`/accept-invitation#${token}`);
  await expect(page.getByText(universityName)).toBeVisible();
  await page.getByRole("button", { name: "Already have an account? Sign in" }).click();
  await page.getByLabel("Full name").fill("Existing Firebase User");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in and accept invitation" }).click();
  await expect(page).toHaveURL(/\/portal$/u);
  await expect(page.getByRole("heading", { name: "UNIVERSITY ADMIN" })).toBeVisible();
});

test("a Super Admin creates a copy-once University Admin link and can revoke it", async ({
  page,
}) => {
  test.skip(
    process.env.E2E_PERSISTENCE_PROVIDER !== "d1",
    "This journey runs in the Worker D1 suite.",
  );

  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(localAdminEmail);
  await page.getByLabel("Password").fill(process.env.LOCAL_SUPER_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL(/\/portal$/u);
  await page.goto("/portal/universities");

  const universityName = `Copy Link University ${crypto.randomUUID()}`;
  const createForm = page.locator("form").filter({
    has: page.getByRole("button", { name: "Create university" }),
  });
  await createForm.getByLabel("Member University name").fill(universityName);
  await createForm.getByRole("button", { name: "Create university" }).click();

  const card = page.locator("article").filter({
    has: page.getByRole("heading", { name: universityName, exact: true }),
  });
  await expect(card).toBeVisible();
  const invitedEmail = `new-admin-${crypto.randomUUID()}@unyon.local`;
  await card.getByLabel("Email address").fill(invitedEmail);
  await card.getByRole("button", { name: "Create invitation link" }).click();

  const issued = card.getByRole("region", { name: "New invitation link" });
  await expect(issued).toBeVisible();
  await expect(issued).toContainText("Copy this link now; it will not be shown again");
  await expect(issued).toContainText(invitedEmail);
  await expect(issued).toContainText("University Admin");
  const invitationUrl = await issued.getByLabel("Invitation link").inputValue();
  expect(invitationUrl).toContain("/accept-invitation#");
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await issued.getByRole("button", { name: "Copy link" }).click();
  await expect(issued.getByRole("status")).toContainText("copied");
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(invitationUrl);

  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: async () => { throw new Error("Clipboard denied"); } },
    });
  });
  await issued.getByRole("button", { name: "Copy link" }).click();
  await expect(issued.getByRole("status")).toContainText("Select and copy the link above");
  const selectedLink = await issued.getByLabel("Invitation link").evaluate((element) => {
    const input = element as HTMLInputElement;
    return input.value.slice(input.selectionStart ?? 0, input.selectionEnd ?? 0);
  });
  expect(selectedLink).toBe(invitationUrl);

  await page.reload();
  await expect(page.getByRole("region", { name: "New invitation link" })).toHaveCount(0);
  const refreshedCard = page.locator("article").filter({
    has: page.getByRole("heading", { name: universityName, exact: true }),
  });
  await expect(refreshedCard.getByText(invitedEmail)).toBeVisible();
  await expect(refreshedCard).not.toContainText(invitationUrl);
  await refreshedCard.getByRole("button", { name: "Revoke" }).click();
  await expect(refreshedCard.getByText(invitedEmail)).toHaveCount(0);

  const revokedPreview = await page.request.post("/api/invitations/preview", {
    data: { token: new URL(invitationUrl).hash.slice(1) },
  });
  expect(revokedPreview.ok()).toBe(false);

  await refreshedCard.getByLabel("Email address").fill(invitedEmail);
  await refreshedCard.getByRole("button", { name: "Create invitation link" }).click();
  const replacementUrl = await refreshedCard.getByRole("region", { name: "New invitation link" })
    .getByLabel("Invitation link").inputValue();
  expect(replacementUrl).not.toBe(invitationUrl);
});

function seedUniversityAdminInvitation(email: string) {
  const token = randomToken();
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

  return { token, universityName };
}

function randomToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");

  return btoa(binary)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
