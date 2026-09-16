import { defineConfig } from "@playwright/test";

import baseConfig from "./playwright.config";

export default defineConfig({
  ...baseConfig,
  webServer: {
    command: "pnpm preview",
    reuseExistingServer: false,
    url: "http://localhost:3000",
  },
});
