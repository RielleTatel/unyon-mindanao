import { execFileSync } from "node:child_process";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "dotenv";
import pg from "pg";

config({ path: ".env.local", quiet: true });
const source = new URL(process.env.DATABASE_URL ?? "");
if (process.env.APP_ENV !== "local" || !["127.0.0.1", "localhost"].includes(source.hostname) || source.pathname !== "/unyon" || source.username !== "unyon") throw new Error("This backup tool only supports the repository's local unyon database");
const directory = path.resolve(".local-backups");
await mkdir(directory, { recursive: true, mode: 0o700 });
const keyPath = path.join(directory, "local-backup.key");
let key: Buffer;
try { key = await readFile(keyPath); } catch (error) {
  if (!(error instanceof Error && "code" in error && error.code === "ENOENT")) throw error;
  key = randomBytes(32); await writeFile(keyPath, key, { flag: "wx", mode: 0o600 });
}
if (key.length !== 32) throw new Error("Invalid local backup key");
const docker = (args: string[], input?: Buffer) => execFileSync("docker", ["compose", "exec", "-T", "postgres", ...args], { input, maxBuffer: 128 * 1024 * 1024, stdio: ["pipe", "pipe", "pipe"] });
const admin = new pg.Client({ connectionString: source.toString() });
await admin.connect();
const snapshot = await admin.query<{ snapshot: string }>("BEGIN ISOLATION LEVEL REPEATABLE READ; SELECT pg_export_snapshot() AS snapshot").then((result) => Array.isArray(result) ? result[1].rows[0].snapshot : result.rows[0].snapshot);
const counts = async (client: pg.Client) => {
  const tables = await client.query<{ table_name: string }>("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name");
  const result: Record<string, number> = {};
  for (const { table_name: name } of tables.rows) {
    if (!/^[a-z_]+$/u.test(name)) throw new Error("Unexpected table name");
    const counted = await client.query<{ count: string }>(`SELECT COUNT(*) AS count FROM "${name}"`);
    result[name] = Number(counted.rows[0].count);
  }
  return result;
};
let restoreName: string | undefined;
try {
  const expected = await counts(admin);
  const dump = docker(["pg_dump", "-U", "unyon", "-d", "unyon", "--format=custom", "--no-owner", "--no-acl", `--snapshot=${snapshot}`]);
  await admin.query("COMMIT");
  const iv = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(dump), cipher.final()]);
  const archive = Buffer.concat([Buffer.from("UNYON01"), iv, cipher.getAuthTag(), encrypted]);
  const filename = `local-${new Date().toISOString().replaceAll(":", "-")}.dump.enc`;
  await writeFile(path.join(directory, filename), archive, { flag: "wx", mode: 0o600 });
  console.log(`Encrypted local backup created: .local-backups/${filename}`);
  if (process.argv.includes("--verify-restore")) {
    const saved = await readFile(path.join(directory, filename));
    const decipher = createDecipheriv("aes-256-gcm", key, saved.subarray(7, 19)); decipher.setAuthTag(saved.subarray(19, 35));
    const plaintext = Buffer.concat([decipher.update(saved.subarray(35)), decipher.final()]);
    restoreName = `unyon_${Buffer.from(randomBytes(6)).toString("hex")}_restore_test`;
    await admin.query(`CREATE DATABASE "${restoreName}"`);
    docker(["pg_restore", "-U", "unyon", "-d", restoreName, "--no-owner", "--no-acl", "--exit-on-error"], plaintext);
    const restoredUrl = new URL(source); restoredUrl.pathname = `/${restoreName}`;
    const restored = new pg.Client({ connectionString: restoredUrl.toString() }); await restored.connect();
    try {
      const actual = await counts(restored);
      if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error("Restored table counts differ from the consistent source snapshot");
      await restored.query("SELECT COUNT(*) FROM event_evaluation_windows w JOIN evaluation_template_versions t ON t.id = w.template_id");
      console.log(`Restore verified: ${Object.keys(actual).length} tables match the consistent source snapshot.`);
    } finally { await restored.end(); }
  }
} finally {
  await admin.query("ROLLBACK");
  if (restoreName && /^unyon_[a-f0-9]{12}_restore_test$/u.test(restoreName)) {
    await admin.query(`DROP DATABASE "${restoreName}" WITH (FORCE)`);
    console.log("Removed the temporary restore-test database; the encrypted backup remains recoverable with its local key.");
  }
  await admin.end();
}
