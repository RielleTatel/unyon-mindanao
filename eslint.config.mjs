import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: [
      "src/**/*.client.{ts,tsx}",
      "src/**/client/**/*.{ts,tsx}",
      "src/features/*/ui/**/*.{ts,tsx}",
      "src/shared/ui/**/*.{ts,tsx}",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message: "Browser modules cannot import server-only code.",
            },
            {
              name: "@prisma/client",
              message: "Database access belongs behind server feature interfaces.",
            },
            {
              name: "firebase-admin",
              message: "Firebase administration is server-only.",
            },
            {
              name: "cloudflare:workers",
              message: "Cloudflare bindings are server-only.",
            },
          ],
          patterns: [
            {
              group: ["@/platform/**", "@/features/*/server/**"],
              message:
                "Browser modules must use client-safe feature interfaces instead of privileged adapters.",
            },
          ],
        },
      ],
    },
  },
  globalIgnores([
    ".next/**",
    ".vinext/**",
    "dist/**",
    "out/**",
    "coverage/**",
    "playwright-report/**",
    "test-results/**",
    "next-env.d.ts",
    "branding/**",
    ".obsidian/**",
    "docs/unyon/.obsidian/**",
  ]),
]);
