import { execFileSync } from "node:child_process";

import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local" });
config({ path: ".env" });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required");
}

const parsed = new URL(testDatabaseUrl);
const databaseName = parsed.pathname.slice(1);

if (!/^[a-z0-9_]+_test$/u.test(databaseName)) {
  throw new Error("The integration database name must end in _test");
}

if (!["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)) {
  throw new Error("The disposable integration database must be local");
}

const adminUrl = new URL(testDatabaseUrl);
adminUrl.pathname = "/postgres";
adminUrl.search = "";

const client = new Client({ connectionString: adminUrl.toString() });
await client.connect();

try {
  await client.query(`DROP DATABASE IF EXISTS "${databaseName}" WITH (FORCE)`);
  await client.query(`CREATE DATABASE "${databaseName}"`);
} finally {
  await client.end();
}

execFileSync("pnpm", ["exec", "prisma", "migrate", "deploy"], {
  env: {
    ...process.env,
    DATABASE_URL: testDatabaseUrl,
    DIRECT_URL: testDatabaseUrl,
  },
  stdio: "inherit",
});
