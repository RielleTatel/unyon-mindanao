import { config } from "dotenv";
import pg from "pg";
config({ path: ".env.local", quiet: true });
const url = new URL(process.env.DATABASE_URL ?? "");
if (process.env.APP_ENV !== "local" || !["127.0.0.1", "localhost"].includes(url.hostname)) throw new Error("Local database required");
const client = new pg.Client({ connectionString: url.toString() });
await client.connect();
try {
  const started = Date.now();
  const { rows: [row] } = await client.query<{ now: Date; database_bytes: string; file_bytes: string; expired_uploads: string; expired_responses: string }>(`SELECT clock_timestamp() AS now, pg_database_size(current_database()) AS database_bytes,
    (SELECT COALESCE(SUM(size), 0) FROM stored_objects WHERE cleaned_at IS NULL) AS file_bytes,
    (SELECT COUNT(*) FROM stored_objects WHERE cleaned_at IS NULL AND (status = 'FAILED' OR (status = 'PENDING' AND expires_at <= NOW()))) AS expired_uploads,
    (SELECT COUNT(*) FROM evaluation_responses WHERE submitted_at < NOW() - INTERVAL '2 years') AS expired_responses`);
  const clockDifferenceMs = Math.round(row.now.getTime() - (started + Date.now()) / 2);
  const usage = (bytes: string, budget: string | undefined) => {
    const quota = Number(budget); const percent = quota > 0 && Number.isFinite(quota) ? Math.round(Number(bytes) / quota * 10000) / 100 : null;
    return { bytes: Number(bytes), percent, state: percent === null ? "QUOTA_NOT_CONFIGURED" : percent >= 85 ? "ACTION_REQUIRED" : percent >= 70 ? "WARNING" : "OK" };
  };
  console.log(JSON.stringify({ database: "reachable", clockDifferenceMs, databaseUsage: usage(row.database_bytes, process.env.LOCAL_DATABASE_BUDGET_BYTES), privateFileUsage: usage(row.file_bytes, process.env.LOCAL_FILE_BUDGET_BYTES), expiredUploads: Number(row.expired_uploads), identifiableResponsesPastRetention: Number(row.expired_responses) }, null, 2));
  if (Math.abs(clockDifferenceMs) > 1000) throw new Error("Local database and host clocks differ by over one second. Resolve Docker clock drift before time-sensitive verification.");
} finally { await client.end(); }
