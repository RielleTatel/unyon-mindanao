import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { config } from "dotenv";
import {
  decryptD1BackupArchive,
  encryptD1BackupArchive,
} from "./lib/d1-migration-archive";
import {
  buildD1RestoreStatements,
  d1DataTableColumns,
  d1DataTables,
  getD1BackupExpectedCounts,
  serializeD1ImportStatements,
  type D1BackupSnapshot,
  type D1DataTable,
} from "./lib/postgres-to-d1";

config({ path: ".env.local", quiet: true });

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const archiveDirectory = path.join(repositoryRoot, ".local-backups", "d1");
const localConfig = path.join(repositoryRoot, "wrangler.d1.local.jsonc");
const localDatabaseName = "unyon-mindanao-local-d1";
const [command, ...rawArgs] = process.argv.slice(2);
const args = rawArgs.filter((argument) => argument !== "--");
const sourcePersistTo = optionValue(args, "--persist-to");

if (command === "backup") {
  await createLocalD1Backup(sourcePersistTo ? await resolveIsolatedPersistPath(sourcePersistTo) : undefined);
} else if (command === "verify") {
  const archiveName = args[0];
  if (!archiveName) throw new Error("Usage: backup-d1-local.ts verify <archive-name>");
  await verifyLocalD1Backup(archiveName);
} else {
  throw new Error("Usage: backup-d1-local.ts backup | verify <archive-name>");
}

async function createLocalD1Backup(persistTo?: string) {
  const snapshot = await readD1Snapshot(persistTo);
  const counts = getD1BackupExpectedCounts(snapshot);
  const archive = encryptD1BackupArchive(snapshot, backupKey());
  await mkdir(archiveDirectory, { recursive: true, mode: 0o700 });
  const filename = `d1-local-backup-${new Date().toISOString().replaceAll(":", "-")}.enc`;
  await writeFile(path.join(archiveDirectory, filename), archive, { flag: "wx", mode: 0o600 });
  console.log(`Encrypted local D1 backup saved as ${filename}; ${Object.values(counts).reduce((total, count) => total + count, 0)} rows across ${d1DataTables.length} tables.`);
}

async function verifyLocalD1Backup(archiveName: string) {
  if (path.basename(archiveName) !== archiveName || !/^[a-zA-Z0-9._-]+\.enc$/u.test(archiveName) || archiveName.includes("..")) {
    throw new Error("Use an encrypted backup filename from .local-backups/d1");
  }
  const snapshot = parseBackupSnapshot(decryptD1BackupArchive(
    await readFile(path.join(archiveDirectory, archiveName)),
    backupKey(),
  ));
  const expectedCounts = getD1BackupExpectedCounts(snapshot);
  const statements = buildD1RestoreStatements(snapshot);
  const temporaryDirectory = await createTemporaryDirectory("d1-restore-");
  const persistTo = path.join(temporaryDirectory, "persist");
  const sqlPath = path.join(temporaryDirectory, "restore.sql");
  try {
    await mkdir(persistTo, { recursive: true, mode: 0o700 });
    await applyLocalMigrations(persistTo);
    await assertSeedOnly(persistTo);
    if (statements.length > 0) {
      await writeFile(sqlPath, serializeD1ImportStatements(statements), { mode: 0o600 });
      runWrangler([
        "d1", "execute", localDatabaseName, "--local", "--yes", "--config", localConfig,
        "--persist-to", persistTo, "--file", sqlPath,
      ]);
    }
    const restored = await readD1Snapshot(persistTo);
    const restoredCounts = getD1BackupExpectedCounts(restored);
    const countDifferences = d1DataTables.filter((table) => restoredCounts[table] !== expectedCounts[table]);
    if (countDifferences.length > 0) {
      throw new Error(`D1 restore row counts do not match for: ${countDifferences.join(", ")}`);
    }
    const contentDifferences = d1DataTables.filter((table) => snapshotDigest(table, snapshot) !== snapshotDigest(table, restored));
    if (contentDifferences.length > 0) {
      throw new Error(`D1 restore content does not match for: ${contentDifferences.join(", ")}`);
    }
    console.log(`Restore verified in an isolated temporary local D1 database: all row counts and contents match across ${d1DataTables.length} tables.`);
  } finally {
    await removeTemporaryDirectory(temporaryDirectory);
  }
}

async function readD1Snapshot(persistTo?: string): Promise<D1BackupSnapshot> {
  const tables: D1BackupSnapshot["tables"] = {};
  for (const table of d1DataTables) {
    const columns = d1DataTableColumns[table].join(", ");
    const output = runWrangler([
      "d1", "execute", localDatabaseName, "--local", "--yes", "--config", localConfig,
      ...(persistTo ? ["--persist-to", persistTo] : []), "--json", "--command",
      `SELECT ${columns} FROM ${table} ORDER BY rowid`,
    ]);
    const results = parseWranglerJson(output);
    const rows = results[0]?.results;
    if (!Array.isArray(rows)) throw new Error(`Wrangler returned no row results for ${table}`);
    tables[table] = rows as D1BackupSnapshot["tables"][typeof table];
  }
  return { formatVersion: 1, createdAt: new Date().toISOString(), tables };
}

async function applyLocalMigrations(persistTo: string) {
  runWrangler([
    "d1", "migrations", "apply", localDatabaseName, "--local", "--config", localConfig,
    "--persist-to", persistTo,
  ]);
}

async function assertSeedOnly(persistTo: string) {
  const snapshot = await readD1Snapshot(persistTo);
  const counts = getD1BackupExpectedCounts(snapshot);
  const unexpected = d1DataTables.filter((table) => table === "evaluation_template_versions"
    ? counts[table] !== 1
    : counts[table] !== 0);
  if (unexpected.length > 0) {
    throw new Error("D1 restore target must be newly created and contain only its built-in Evaluation Template");
  }
}

function snapshotDigest(table: D1DataTable, snapshot: D1BackupSnapshot) {
  const columns = d1DataTableColumns[table] as readonly string[];
  const rows = (snapshot.tables[table] ?? []).map((row) => columns.map((column) => {
    if (table === "evaluation_template_versions" && row.id === "b0000000-0000-4000-8000-000000000001" && column === "created_at") {
      return null;
    }
    const value = row[column];
    if (value === null || value === undefined) return value ?? null;
    if ((table === "audit_logs" && column === "metadata") || (table === "evaluation_template_versions" && column === "questions")) {
      return JSON.stringify(typeof value === "string" ? JSON.parse(value) as unknown : value);
    }
    if (column === "birth_date" && typeof value === "string") return value.slice(0, 10);
    if (/(_at|_date)$/u.test(column) && typeof value === "string") {
      const date = new Date(value);
      if (Number.isFinite(date.getTime())) return date.toISOString();
    }
    return value;
  }));
  rows.sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
  return createHash("sha256").update(JSON.stringify(rows)).digest("hex");
}

function parseBackupSnapshot(value: unknown): D1BackupSnapshot {
  if (!value || typeof value !== "object") throw new Error("The encrypted archive is not a D1 backup snapshot");
  const snapshot = value as Partial<D1BackupSnapshot>;
  if (snapshot.formatVersion !== 1 || typeof snapshot.createdAt !== "string" || !snapshot.tables || typeof snapshot.tables !== "object") {
    throw new Error("The encrypted archive is not a supported D1 backup snapshot");
  }
  return snapshot as D1BackupSnapshot;
}

function parseWranglerJson(output: string) {
  const jsonStart = output.indexOf("[");
  if (jsonStart < 0) throw new Error("Wrangler returned no local D1 JSON results");
  try {
    return JSON.parse(output.slice(jsonStart)) as Array<{ results?: unknown[] }>;
  } catch {
    throw new Error("Wrangler returned invalid local D1 JSON results");
  }
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
    throw new Error("Local Wrangler D1 operation failed; no remote D1 database was addressed.");
  }
}

async function createTemporaryDirectory(prefix: string) {
  const temporaryRoot = path.join(repositoryRoot, ".wrangler", "tmp");
  await mkdir(temporaryRoot, { recursive: true, mode: 0o700 });
  return mkdtemp(path.join(temporaryRoot, prefix));
}

async function resolveIsolatedPersistPath(rawPath: string) {
  const wranglerDirectory = path.join(repositoryRoot, ".wrangler");
  const resolved = path.resolve(repositoryRoot, rawPath);
  if (!resolved.startsWith(wranglerDirectory + path.sep)) {
    throw new Error("--persist-to must point to an isolated directory beneath .wrangler/");
  }
  await mkdir(resolved, { recursive: true, mode: 0o700 });
  const [actualWranglerDirectory, actualPersistTo] = await Promise.all([realpath(wranglerDirectory), realpath(resolved)]);
  if (!actualPersistTo.startsWith(actualWranglerDirectory + path.sep)) {
    throw new Error("--persist-to must resolve to an isolated directory beneath .wrangler/");
  }
  return actualPersistTo;
}

function optionValue(options: string[], name: string) {
  const index = options.indexOf(name);
  return index >= 0 ? options[index + 1] : undefined;
}

async function removeTemporaryDirectory(directory: string) {
  const temporaryRoot = path.join(repositoryRoot, ".wrangler", "tmp");
  const [actualRoot, actualDirectory] = await Promise.all([realpath(temporaryRoot), realpath(directory)]);
  if (actualDirectory.startsWith(actualRoot + path.sep)) await rm(actualDirectory, { recursive: true, force: true });
}

function backupKey() {
  const encoded = process.env.D1_BACKUP_ENCRYPTION_KEY;
  if (!encoded) throw new Error("D1_BACKUP_ENCRYPTION_KEY must contain a base64-encoded 32-byte key");
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new Error("D1_BACKUP_ENCRYPTION_KEY must contain a base64-encoded 32-byte key");
  }
  return key;
}
