import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { config } from "dotenv";
import { Client } from "pg";

config({ path: ".env.local", quiet: true });
const migration = "20260916233000_harden_access_invariants";
const checksum = createHash("sha256").update(readFileSync(`prisma/migrations/${migration}/migration.sql`)).digest("hex");
const urls = [process.env.DATABASE_URL, process.env.TEST_DATABASE_URL];
if (urls.some((url) => !url || !["localhost", "127.0.0.1"].includes(new URL(url).hostname))) throw new Error("Only local databases are allowed");
if (!new URL(urls[1]!).pathname.endsWith("_test") || urls[0] === urls[1]) throw new Error("A separate migrated test reference is required");
const clients = urls.map((connectionString) => new Client({ connectionString }));
await Promise.all(clients.map((client) => client.connect()));
try {
  const [local, reference] = await Promise.all(clients.map(schema));
  if (JSON.stringify(local) !== JSON.stringify(reference)) throw new Error("Local schema differs from the migrated reference; do not reconcile metadata");
  const expected = await clients[1].query("SELECT checksum FROM _prisma_migrations WHERE migration_name=$1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL", [migration]);
  if (expected.rows.length !== 1 || expected.rows[0].checksum !== checksum) throw new Error("Reference migration checksum does not match the source");
  const applied = await clients[0].query("SELECT id, checksum FROM _prisma_migrations WHERE migration_name=$1 AND finished_at IS NOT NULL AND rolled_back_at IS NULL", [migration]);
  if (applied.rows.length !== 1) throw new Error("Expected one successful local migration record");
  if (applied.rows[0].checksum === checksum) console.log("Local schema and migration checksum already match.");
  else if (!process.argv.includes("--apply")) console.log("Schema matches the migrated reference. The known checksum can be reconciled with --apply; no business data will change.");
  else {
    const result = await clients[0].query("UPDATE _prisma_migrations SET checksum=$1 WHERE id=$2 AND checksum=$3", [checksum, applied.rows[0].id, applied.rows[0].checksum]);
    if (result.rowCount !== 1) throw new Error("Migration metadata changed concurrently");
    console.log("Reconciled the known local migration checksum after schema verification. No business records changed.");
  }
} finally { await Promise.all(clients.map((client) => client.end())); }

async function schema(client: Client) {
  const queries = [
    "SELECT table_name, column_name, data_type, udt_name, is_nullable, column_default, character_maximum_length, datetime_precision FROM information_schema.columns WHERE table_schema='public' AND table_name <> '_prisma_migrations' ORDER BY table_name, ordinal_position",
    "SELECT c.relname, con.conname, pg_get_constraintdef(con.oid) AS definition FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relname <> '_prisma_migrations' ORDER BY c.relname, con.conname",
    "SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname='public' AND tablename <> '_prisma_migrations' ORDER BY tablename, indexname",
    "SELECT c.relname, t.tgname, pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal ORDER BY c.relname,t.tgname",
    "SELECT p.proname, pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.classid='pg_proc'::regclass AND d.objid=p.oid AND d.deptype='e') ORDER BY p.proname",
    "SELECT t.typname, e.enumlabel FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' ORDER BY t.typname,e.enumsortorder",
  ];
  const result = [];
  for (const query of queries) result.push((await client.query(query)).rows);
  return result;
}
