import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import pg from "pg";
import {
  decryptMigrationArchive,
  encryptMigrationArchive,
} from "./lib/d1-migration-archive";
import {
  buildD1ImportStatements,
  getD1MigrationExpectedCounts,
  postgresMigrationTables,
  readPostgresMigrationSnapshot,
  serializeD1ImportStatements,
  type PostgresToD1MigrationSnapshot,
} from "./lib/postgres-to-d1";
import { createSecurePostgresConnectionOptions } from "./lib/postgres-connection";

config({ path: ".env.local", quiet: true });

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archiveDirectory = path.join(repositoryRoot, ".local-backups", "postgres-to-d1");
const localConfig = path.join(repositoryRoot, "wrangler.d1.local.jsonc");
const localDatabaseName = "unyon-mindanao-local-d1";
const dataTables = [...postgresMigrationTables, "portal_sessions"] as const;

const [command, ...rawArgs] = process.argv.slice(2);
const args = rawArgs.filter((argument) => argument !== "--");

if (command === "export") {
  await exportPostgresSnapshot();
} else if (command === "import-local") {
  const archiveName = args[0];
  const persistTo = optionValue(args, "--persist-to");
  if (!archiveName || !persistTo) {
    throw new Error("Usage: postgres-to-d1.ts import-local <archive-name> --persist-to .wrangler/<isolated-directory>");
  }
  await importSnapshotToIsolatedLocalD1(archiveName, persistTo);
} else {
  throw new Error("Usage: postgres-to-d1.ts export | import-local <archive-name> --persist-to .wrangler/<isolated-directory>");
}

async function exportPostgresSnapshot() {
  const sourceUrl = process.env.SOURCE_DATABASE_URL;
  if (!sourceUrl) throw new Error("SOURCE_DATABASE_URL is required for PostgreSQL export");
  const key = migrationKey();
  const secureOptions = createSecurePostgresConnectionOptions(sourceUrl);
  const certificatePath = process.env.SOURCE_DATABASE_SSL_CA_PATH ?? secureOptions.certificatePath;
  let certificate: string | undefined;
  if (certificatePath) {
    try {
      certificate = await readFile(certificatePath, "utf8");
    } catch {
      throw new Error("The configured PostgreSQL TLS CA certificate could not be read");
    }
  }

  const client = new pg.Client({
    connectionString: secureOptions.connectionString,
    ssl: { ...secureOptions.ssl, ...(certificate ? { ca: certificate } : {}) },
  });
  let connected = false;
  let transactionOpen = false;
  try {
    await client.connect();
    connected = true;
    await client.query("BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY");
    transactionOpen = true;
    const snapshot = await readPostgresMigrationSnapshot(async (sql) => {
      const result = await client.query(sql);
      return { rows: result.rows as Record<string, unknown>[] };
    });
    await client.query("COMMIT");
    transactionOpen = false;

    const archive = encryptMigrationArchive(snapshot, key);
    await mkdir(archiveDirectory, { recursive: true, mode: 0o700 });
    const filename = `postgres-to-d1-${new Date().toISOString().replaceAll(":", "-")}.enc`;
    await writeFile(path.join(archiveDirectory, filename), archive, { flag: "wx", mode: 0o600 });
    const rowCount = Object.values(snapshot.tables).reduce((sum, rows) => sum + (rows?.length ?? 0), 0);
    console.log(`Encrypted migration snapshot saved as ${filename} (${rowCount} business rows; ${snapshot.excludedPortalSessions} sessions intentionally omitted).`);
  } catch {
    if (connected && transactionOpen) await client.query("ROLLBACK").catch(() => undefined);
    throw new Error("PostgreSQL export failed. No database rows were changed; source query details were suppressed.");
  } finally {
    if (connected) await client.end().catch(() => undefined);
  }
}

async function importSnapshotToIsolatedLocalD1(archiveName: string, rawPersistTo: string) {
  if (path.basename(archiveName) !== archiveName || !/^[a-zA-Z0-9._-]+\.enc$/u.test(archiveName) || archiveName.includes("..")) {
    throw new Error("Use an encrypted archive filename from .local-backups/postgres-to-d1");
  }
  const persistTo = await resolveIsolatedPersistPath(rawPersistTo);
  const decrypted = decryptMigrationArchive(
    await readFile(path.join(archiveDirectory, archiveName)),
    migrationKey(),
  );
  if (!isMigrationSnapshot(decrypted)) throw new Error("The archive is not a supported PostgreSQL-to-D1 snapshot");

  const statements = buildD1ImportStatements(decrypted);
  const expectedCounts = getD1MigrationExpectedCounts(decrypted);
  await mkdir(persistTo, { recursive: true, mode: 0o700 });
  if ((await readdir(persistTo)).length > 0) {
    throw new Error("Local D1 import target must be a fresh, empty .wrangler/ directory; choose another isolated path.");
  }
  await applyLocalMigrations(persistTo);
  await assertEmptyImportTarget(persistTo);

  const temporaryRoot = path.join(repositoryRoot, ".wrangler", "tmp");
  await mkdir(temporaryRoot, { recursive: true, mode: 0o700 });
  const temporaryDirectory = await mkdtemp(path.join(temporaryRoot, "d1-import-"));
  const sqlPath = path.join(temporaryDirectory, "migration.sql");
  try {
    await writeFile(sqlPath, serializeD1ImportStatements(statements), { mode: 0o600 });
    if (statements.length > 0) {
      runWrangler([
        "d1", "execute", localDatabaseName, "--local", "--yes", "--config", localConfig,
        "--persist-to", persistTo, "--file", sqlPath,
      ]);
    }
    await assertExpectedCounts(persistTo, expectedCounts);
    console.log(`Local D1 import verified in ${path.relative(repositoryRoot, persistTo)}. ${decrypted.excludedPortalSessions} active/expired login sessions were not migrated.`);
  } finally {
    if (temporaryDirectory.startsWith(path.join(repositoryRoot, ".wrangler", "tmp") + path.sep)) {
      await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

async function applyLocalMigrations(persistTo: string) {
  runWrangler([
    "d1", "migrations", "apply", localDatabaseName, "--local", "--config", localConfig,
    "--persist-to", persistTo,
  ]);
}

async function assertEmptyImportTarget(persistTo: string) {
  const counts = await readD1Counts(persistTo);
  const nonEmpty = Object.entries(counts).filter(([table, count]) =>
    table === "evaluation_template_versions" ? count !== 1 : count !== 0,
  );
  if (nonEmpty.length > 0) {
    throw new Error("Local D1 import target is not empty (it may contain the built-in Evaluation Template only); choose a new .wrangler/ persistence directory.");
  }
}

async function assertExpectedCounts(
  persistTo: string,
  expected: Record<(typeof dataTables)[number], number>,
) {
  const actual = await readD1Counts(persistTo);
  const differences = dataTables.filter((table) => actual[table] !== expected[table]);
  if (differences.length > 0) {
    throw new Error(`Local D1 import count reconciliation failed for: ${differences.join(", ")}`);
  }
}

async function readD1Counts(persistTo: string) {
  const sql = dataTables
    .map((table) => `SELECT COUNT(*) AS count FROM ${table}`)
    .join(";\n");
  const output = runWrangler([
    "d1", "execute", localDatabaseName, "--local", "--yes", "--config", localConfig,
    "--persist-to", persistTo, "--json", "--command", sql,
  ]);
  const jsonStart = output.indexOf("[");
  if (jsonStart < 0) throw new Error("Wrangler returned no local D1 count results");
  const result = JSON.parse(output.slice(jsonStart)) as Array<{ results?: Array<{ table_name: string; count: number | string }> }>;
  const counts = Object.fromEntries(dataTables.map((table, index) => [
    table,
    Number(result[index]?.results?.[0]?.count),
  ]));
  if (dataTables.some((table) => !Number.isSafeInteger(counts[table]) || counts[table] < 0)) {
    throw new Error("Wrangler returned incomplete local D1 count results");
  }
  return counts as Record<(typeof dataTables)[number], number>;
}

function runWrangler(args: string[]) {
  try {
    return execFileSync("./node_modules/.bin/wrangler", args, {
      cwd: repositoryRoot,
      encoding: "utf8",
      env: { ...process.env, WRANGLER_LOG_PATH: ".wrangler/logs" },
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    throw new Error("Local Wrangler D1 operation failed; only the specified isolated local database was addressed.");
  }
}

async function resolveIsolatedPersistPath(rawPath: string) {
  const wranglerDirectory = path.join(repositoryRoot, ".wrangler");
  const resolved = path.resolve(repositoryRoot, rawPath);
  if (!resolved.startsWith(wranglerDirectory + path.sep)) {
    throw new Error("--persist-to must point to an isolated directory beneath .wrangler/");
  }
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  const [actualWranglerDirectory, actualPersistTo] = await Promise.all([
    realpath(wranglerDirectory),
    realpath(resolved),
  ]);
  if (!actualPersistTo.startsWith(actualWranglerDirectory + path.sep)) {
    throw new Error("--persist-to must resolve to an isolated directory beneath .wrangler/");
  }
  return actualPersistTo;
}

function optionValue(args: string[], option: string) {
  const index = args.indexOf(option);
  return index >= 0 ? args[index + 1] : undefined;
}

function migrationKey() {
  const encoded = process.env.D1_MIGRATION_ENCRYPTION_KEY;
  if (!encoded) throw new Error("D1_MIGRATION_ENCRYPTION_KEY must contain a base64-encoded 32-byte key");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new Error("D1_MIGRATION_ENCRYPTION_KEY must contain a base64-encoded 32-byte key");
  }
  return key;
}

function isMigrationSnapshot(value: unknown): value is PostgresToD1MigrationSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Partial<PostgresToD1MigrationSnapshot>;
  return snapshot.formatVersion === 1 &&
    typeof snapshot.createdAt === "string" &&
    Number.isSafeInteger(snapshot.excludedPortalSessions) &&
    Boolean(snapshot.tables && typeof snapshot.tables === "object");
}
