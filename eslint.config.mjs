import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const privilegedPackages = new Set([
  "server-only",
  "@prisma/client",
  "firebase-admin",
  "cloudflare:workers",
]);

function isPrivilegedPackage(source) {
  return [...privilegedPackages].some(
    (privilegedPackage) =>
      source === privilegedPackage || source.startsWith(`${privilegedPackage}/`),
  );
}

function isPlatformImport(source) {
  return (
    source === "@/platform" ||
    source.startsWith("@/platform/") ||
    (source.startsWith(".") &&
      /(?:^|\/)platform(?:\/|$)/u.test(
        source.replaceAll("../", "").replaceAll("./", ""),
      ))
  );
}

function isFeatureServerImport(source) {
  return (
    /^@\/features\/[^/]+\/server(?:\/|$)/u.test(source) ||
    (source.startsWith(".") &&
      /(?:^|\/)server(?:\/|$)/u.test(
        source.replaceAll("../", "").replaceAll("./", ""),
      ))
  );
}

const clientBoundaryRule = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      privilegedImport:
        "Only approved server modules can import privileged source '{{source}}'.",
    },
  },
  create(context) {
    const isClientModule = context.sourceCode.ast.body.some(
      (node) =>
        node.type === "ExpressionStatement" && node.directive === "use client",
    );
    const filename = context.filename.replaceAll("\\", "/");
    const isApprovedServerModule =
      filename.includes("/src/platform/") ||
      /\/src\/features\/[^/]+\/server\//u.test(filename);

    const isForbiddenImport = (source) =>
      ((isPrivilegedPackage(source) || isPlatformImport(source)) &&
        !isApprovedServerModule) ||
      (isFeatureServerImport(source) && isClientModule);

    const checkSource = (node) => {
      const source = node.source?.value;

      if (typeof source === "string" && isForbiddenImport(source)) {
        context.report({
          node,
          messageId: "privilegedImport",
          data: { source },
        });
      }
    };

    return {
      CallExpression(node) {
        if (
          node.callee.type === "Identifier" &&
          node.callee.name === "require" &&
          node.arguments[0]?.type === "Literal"
        ) {
          const source = node.arguments[0].value;

          if (typeof source === "string" && isForbiddenImport(source)) {
            context.report({
              node,
              messageId: "privilegedImport",
              data: { source },
            });
          }
        }
      },
      ExportAllDeclaration: checkSource,
      ExportNamedDeclaration: checkSource,
      ImportExpression: checkSource,
      ImportDeclaration: checkSource,
    };
  },
};

const serverOnlyMarkerRule = {
  meta: {
    type: "problem",
    schema: [],
    messages: {
      missingMarker:
        "Privileged modules must import 'server-only' so transitive browser imports fail closed.",
    },
  },
  create(context) {
    const hasServerOnlyMarker = context.sourceCode.ast.body.some(
      (node) =>
        node.type === "ImportDeclaration" && node.source.value === "server-only",
    );

    if (hasServerOnlyMarker) {
      return {};
    }

    return {
      Program(node) {
        context.report({ node, messageId: "missingMarker" });
      },
    };
  },
};

export default defineConfig([
  ...nextVitals,
  ...nextTypeScript,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      unyon: {
        rules: {
          "client-boundary": clientBoundaryRule,
          "server-only-marker": serverOnlyMarkerRule,
        },
      },
    },
    rules: {
      "unyon/client-boundary": "error",
    },
  },
  {
    files: [
      "src/platform/**/*.{ts,tsx}",
      "src/features/*/server/**/*.{ts,tsx}",
    ],
    rules: {
      "unyon/server-only-marker": "error",
    },
  },
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
              group: [
                "@/platform",
                "@/platform/**",
                "@/features/*/server/**",
                "@prisma/client/**",
                "firebase-admin/**",
                "cloudflare:workers/**",
                "**/platform/**",
                "**/server/**",
              ],
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
    "src/platform/database/generated/**",
    "src/platform/database/generated-node/**",
    "next-env.d.ts",
    "branding/**",
    ".obsidian/**",
    "docs/unyon/.obsidian/**",
  ]),
]);
