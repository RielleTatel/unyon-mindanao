import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

const rootDirectory = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(rootDirectory, "src"),
      "server-only": path.resolve(rootDirectory, "tests/stubs/server-only.ts"),
      "#unyon-prisma-client": path.resolve(
        rootDirectory,
        "src/platform/database/generated-node/client.ts",
      ),
    },
  },
  test: {
    environment: "node",
    fileParallelism: false,
    include: ["tests/integration/**/*.test.ts"],
  },
});
