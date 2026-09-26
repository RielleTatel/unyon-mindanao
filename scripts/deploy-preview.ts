import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { config, parse } from "dotenv";

const { parsed: previewEnvironment = {} } = config({
  path: ".env.preview.local",
  override: true,
  quiet: true,
});
const dotenvFilesUsedByBuild = [
  ".env.production.local",
  ".env.local",
  ".env.production",
  ".env",
];

for (const file of dotenvFilesUsedByBuild) {
  if (!existsSync(file)) continue;

  for (const key of Object.keys(parse(readFileSync(file)))) {
    if (
      Object.hasOwn(previewEnvironment, key) ||
      /^(CLOUDFLARE|WRANGLER)_/u.test(key)
    ) {
      continue;
    }

    process.env[key] = "";
  }
}

const forwardedArguments = process.argv
  .slice(2)
  .filter((argument) => argument !== "--");
const buildOnly = forwardedArguments.includes("--build-only");
const commandArguments = buildOnly
  ? ["build:worker"]
  : ["exec", "vinext-cloudflare", "deploy", "--preview", ...forwardedArguments];

const result = spawnSync(
  "pnpm",
  commandArguments,
  {
    env: {
      ...process.env,
      CLOUDFLARE_ENV: "preview",
      WRANGLER_LOG_PATH: ".wrangler/logs",
    },
    stdio: "inherit",
  },
);

if (result.error) {
  throw result.error;
}

process.exitCode = result.status ?? 1;
