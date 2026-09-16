import { defineConfig } from "@playwright/test";

import baseConfig from "./playwright.config";

export default defineConfig({
  ...baseConfig,
  webServer: {
    command: "pnpm preview:worker",
    reuseExistingServer: false,
    url: "http://localhost:3000",
  },
});
