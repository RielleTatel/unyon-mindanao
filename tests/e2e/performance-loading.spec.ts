import { config } from "dotenv";
import { devices, expect, test } from "@playwright/test";

config({ path: ".env.local", quiet: true });

test("fresh authenticated Worker entry defers Firebase and supports pending, failed loading, and sign-out retry", async ({ page, context, browser }, testInfo) => {
  test.skip(process.env.E2E_PERSISTENCE_PROVIDER !== "d1", "Checks the production Worker chunk request graph.");
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(process.env.LOCAL_SUPER_ADMIN_EMAIL!);
  await page.getByLabel("Password").fill(process.env.LOCAL_SUPER_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL(/\/portal$/u);

  const fresh = await browser.newContext({
    ...devices[testInfo.project.name === "mobile-chromium" ? "Pixel 7" : "Desktop Chrome"],
    storageState: { cookies: await context.cookies(), origins: [] },
  });
  let releaseImport: (() => void) | undefined;
  const importGate = new Promise<void>((resolve) => { releaseImport = resolve; });
  try {
    const entry = await fresh.newPage();
    const scripts: string[] = [];
    entry.on("request", (request) => {
      if (request.resourceType() === "script") scripts.push(new URL(request.url()).pathname);
    });
    await entry.goto(`${testInfo.project.use.baseURL}/portal`);
    await expect(entry.getByRole("heading", { name: "Welcome to your Confederation workspace." })).toBeVisible();
    await entry.waitForLoadState("networkidle");
    expect(scripts.some((path) => /\/firebase-auth-[^/]+\.js$/u.test(path))).toBe(false);
    expect(scripts.some((path) => /\/event-workspace-[^/]+\.js$/u.test(path))).toBe(false);
    await testInfo.attach("initial-script-requests", { body: JSON.stringify(scripts), contentType: "application/json" });

    let importAttempts = 0;
    await entry.route(/\/firebase-auth-[^/]+\.js$/u, async (route) => {
      if (++importAttempts === 1) {
        await importGate;
        await route.abort();
      } else await route.continue();
    });
    const identityRequest = entry.waitForRequest(/\/firebase-auth-[^/]+\.js$/u);
    await entry.getByRole("button", { name: "Sign out", exact: true }).click();
    await identityRequest;
    await expect(entry.getByRole("button", { name: "Signing out…" })).toBeDisabled();
    await expect(entry).toHaveURL(/\/portal$/u);
    releaseImport!();
    await expect(entry.getByRole("alert")).toContainText("Please try again");
    await expect(entry.getByRole("button", { name: "Sign out", exact: true })).toBeEnabled();
    await entry.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(entry).toHaveURL(/\/sign-in$/u);
    await entry.goto(`${testInfo.project.use.baseURL}/portal`);
    await expect(entry).toHaveURL(/\/sign-in$/u);
  } finally {
    releaseImport?.();
    await fresh.close();
  }
});
