import { config } from "dotenv";
import { expect, test } from "@playwright/test";
config({ path: ".env.local", quiet: true });
test("uploads a private profile image and shows Appointment history", async ({ page }) => {
  await page.goto("/sign-in"); await page.getByLabel("Email address").fill(process.env.LOCAL_SUPER_ADMIN_EMAIL!); await page.getByLabel("Password").fill(process.env.LOCAL_SUPER_ADMIN_PASSWORD!); await page.getByRole("button", { name: "Sign in securely" }).click();
  await expect(page).toHaveURL(/\/portal$/u); await page.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Appointment history" })).toBeVisible();
  await page.getByLabel("Image (JPEG, PNG or WebP, up to 5 MB)").setInputFiles({ name: "local-pixel.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2XcAAAAASUVORK5CYII=", "base64") });
  await page.getByRole("button", { name: "Upload file" }).click(); await expect(page.getByText("File saved.", { exact: true })).toBeVisible();
  const photo = page.getByRole("img", { name: "Your profile photograph" }); await expect(photo).toBeVisible();
  await expect.poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
});
