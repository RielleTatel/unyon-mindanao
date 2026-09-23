import { cloudflare } from "@cloudflare/vite-plugin";
import path from "node:path";
import { defineConfig } from "vite";
import vinext from "vinext";

export default defineConfig({
  resolve: {
    alias: {
      "#unyon-object-store": path.resolve(process.cwd(), "src/platform/r2/worker-runtime.ts"),
      "#unyon-prisma-client": path.resolve(
        process.cwd(),
        "src/platform/database/generated/client.ts",
      ),
    },
  },
  plugins: [
    vinext(),
    cloudflare({
      viteEnvironment: {
        name: "rsc",
        childEnvironments: ["ssr"],
      },
    }),
  ],
});
