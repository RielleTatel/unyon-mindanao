import { expect, test } from "@playwright/test";

const localEmail = process.env.LOCAL_SUPER_ADMIN_EMAIL ?? "admin@unyon.local";
const localPassword =
  process.env.LOCAL_SUPER_ADMIN_PASSWORD ?? "local-unyon-admin";

test("a bootstrapped Super Admin signs in, reaches the protected portal, and signs out", async ({
  page,
}) => {
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/sign-in$/u);

  await page.getByLabel("Email address").fill(localEmail);
  await page.getByLabel("Password").fill(localPassword);
  await page.getByRole("button", { name: "Sign in securely" }).click();

  await expect(page).toHaveURL(/\/portal$/u);
  await expect(
    page.getByRole("heading", {
      name: "Welcome to your Confederation workspace.",
    }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: "SUPER ADMIN" })).toBeVisible();
  await expect(page.getByText(localEmail)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/u);
  await page.goto("/portal");
  await expect(page).toHaveURL(/\/sign-in$/u);
});

test("a verified Firebase identity without an active appointment is denied", async ({
  page,
  request,
}, testInfo) => {
  const email = `unknown-${testInfo.project.name}-${crypto.randomUUID()}@unyon.local`;
  const password = "unknown-local-user";
  const signUp = await request.post(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=demo-api-key",
    { data: { email, password, returnSecureToken: true } },
  );
  expect(signUp.ok()).toBe(true);
  const account = (await signUp.json()) as { idToken: string };
  const sendVerification = await request.post(
    "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=demo-api-key",
    {
      data: {
        idToken: account.idToken,
        requestType: "VERIFY_EMAIL",
      },
    },
  );
  expect(sendVerification.ok()).toBe(true);

  const codesResponse = await request.get(
    "http://127.0.0.1:9099/emulator/v1/projects/unyon-mindanao-local/oobCodes",
  );
  const codes = (await codesResponse.json()) as {
    oobCodes: Array<{ email: string; oobLink: string; requestType: string }>;
  };
  const verification = codes.oobCodes
    .toReversed()
    .find(
      (code) =>
        code.email === email && code.requestType === "VERIFY_EMAIL",
    );

  expect(verification).toBeDefined();
  expect((await request.get(verification!.oobLink)).ok()).toBe(true);

  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in securely" }).click();

  await expect(page.getByText(/^Sign-in was not accepted/u)).toBeVisible();
  await expect(page).toHaveURL(/\/sign-in$/u);
});
