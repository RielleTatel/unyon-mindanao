import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypeScript from "eslint-config-next/typescript";

const privilegedClientImports = new Set([
  "server-only",
  "@prisma/client",
  "firebase-admin",
  "cloudflare:workers",
]);

function isPrivilegedClientImport(source) {
  return (
    [...privilegedClientImports].some(
      (privilegedImport) =>
        source === privilegedImport || source.startsWith(`${privilegedImport}/`),
    ) ||
    source === "@/platform" ||
    source.startsWith("@/platform/") ||
    /^@\/features\/[^/]+\/server(?:\/|$)/u.test(source) ||
    (source.startsWith(".") &&
      /(?:^|\/)(?:platform|server)(?:\/|$)/u.test(
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
        "Client modules cannot import privileged server source '{{source}}'.",
    },
  },
  create(context) {
    const isClientModule = context.sourceCode.ast.body.some(
      (node) =>
        node.type === "ExpressionStatement" && node.directive === "use client",
    );

    if (!isClientModule) {
      return {};
    }

    const checkSource = (node) => {
      const source = node.source?.value;

      if (typeof source === "string" && isPrivilegedClientImport(source)) {
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

          if (typeof source === "string" && isPrivilegedClientImport(source)) {
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
    "next-env.d.ts",
    "branding/**",
    ".obsidian/**",
    "docs/unyon/.obsidian/**",
  ]),
]);
