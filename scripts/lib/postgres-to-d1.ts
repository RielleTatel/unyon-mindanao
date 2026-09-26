const migrationTableColumns = {
  member_universities: ["id", "name", "slug", "description", "status", "created_at", "updated_at"],
  portal_users: ["id", "firebase_uid", "email", "full_name", "birth_date", "birth_date_version", "profile_object_id", "status", "created_at", "updated_at"],
  stored_objects: ["id", "key", "purpose", "resource_id", "uploader_id", "mime_type", "size", "sha256", "status", "expires_at", "cleaned_at", "created_at", "updated_at"],
  appointments: ["id", "portal_user_id", "role", "university_id", "starts_at", "ends_at", "created_at"],
  invitations: ["id", "token_hash", "email", "role", "status", "university_id", "invited_by_portal_user_id", "accepted_by_portal_user_id", "expires_at", "accepted_at", "revoked_at", "created_at", "updated_at"],
  audit_logs: ["id", "actor_portal_user_id", "action", "resource_type", "resource_id", "correlation_id", "metadata", "occurred_at"],
  announcements: ["id", "title", "body", "status", "version", "published_at", "created_at", "updated_at"],
  shortcuts: ["id", "label", "url", "icon", "sort_order", "active", "version", "created_at", "updated_at"],
  evaluation_template_versions: ["id", "version", "questions", "created_at"],
  events: ["id", "title", "description", "category", "status", "starts_at", "ends_at", "all_day", "location", "online_url", "contact_person", "owner_university_id", "created_by_portal_user_id", "published_at", "cancelled_at", "completed_at", "archived_at", "version", "cover_object_id", "created_at", "updated_at"],
  event_co_hosts: ["event_id", "university_id", "created_at"],
  event_evaluation_windows: ["event_id", "template_id", "opens_at", "closes_at", "closed", "version"],
  evaluation_responses: ["id", "event_id", "portal_user_id", "version", "submitted_at", "updated_at"],
  evaluation_answers: ["response_id", "position", "rating", "comment"],
  financial_reports: ["id", "title", "reporting_period", "description", "created_at"],
  financial_report_revisions: ["id", "report_id", "revision", "status", "object_id", "published_by_id", "published_at", "superseded_at", "created_at"],
} as const;

export const postgresMigrationTableColumns = migrationTableColumns;
export const d1DataTableColumns = {
  ...migrationTableColumns,
  portal_sessions: ["id", "portal_user_id", "token_hash", "expires_at", "revoked_at", "created_at"],
} as const;

export type PostgresMigrationTable = keyof typeof postgresMigrationTableColumns;
export type D1DataTable = keyof typeof d1DataTableColumns;
export type PostgresMigrationRow = Readonly<Record<string, unknown>>;
export type D1DataRow = Readonly<Record<string, unknown>>;

export interface PostgresToD1MigrationSnapshot {
  formatVersion: 1;
  createdAt: string;
  excludedPortalSessions: number;
  tables: Partial<Record<PostgresMigrationTable, readonly PostgresMigrationRow[]>>;
}

export interface D1BackupSnapshot {
  formatVersion: 1;
  createdAt: string;
  tables: Partial<Record<D1DataTable, readonly D1DataRow[]>>;
}

export interface D1MigrationStatement {
  sql: string;
  values: (string | number | null)[];
}

export interface PostgresQueryResult {
  rows: PostgresMigrationRow[];
}

export type PostgresReadQuery = (sql: string) => Promise<PostgresQueryResult>;

export const postgresMigrationTables = Object.keys(migrationTableColumns) as PostgresMigrationTable[];
export const d1DataTables = Object.keys(d1DataTableColumns) as D1DataTable[];
const postgresMigrationOrder = postgresMigrationTables;
const defaultEvaluationTemplateId = "b0000000-0000-4000-8000-000000000001";
const defaultEvaluationTemplateQuestions = [
  { label: "Overall event experience", kind: "RATING" },
  { label: "Organization and delivery", kind: "RATING" },
  { label: "Comments or suggestions", kind: "COMMENT" },
];
const jsonColumns = new Set(["audit_logs.metadata", "evaluation_template_versions.questions"]);
const booleanColumns = new Set(["shortcuts.active", "events.all_day", "event_evaluation_windows.closed"]);
const timestampColumns = new Set([
  "created_at", "updated_at", "occurred_at", "starts_at", "ends_at", "published_at",
  "cancelled_at", "completed_at", "archived_at", "expires_at", "cleaned_at", "accepted_at",
  "revoked_at", "opens_at", "closes_at", "submitted_at", "superseded_at",
]);

const primaryKeys: Record<D1DataTable, string> = {
  member_universities: "id",
  portal_users: "id",
  stored_objects: "id",
  appointments: "id",
  invitations: "id",
  audit_logs: "id",
  announcements: "id",
  shortcuts: "id",
  evaluation_template_versions: "id",
  events: "id",
  event_co_hosts: "event_id, university_id",
  event_evaluation_windows: "event_id",
  evaluation_responses: "id",
  evaluation_answers: "response_id, position",
  financial_reports: "id",
  financial_report_revisions: "id",
  portal_sessions: "id",
};

export async function readPostgresMigrationSnapshot(query: PostgresReadQuery): Promise<PostgresToD1MigrationSnapshot> {
  const tables: PostgresToD1MigrationSnapshot["tables"] = {};
  for (const table of postgresMigrationOrder) {
    const columns = postgresMigrationTableColumns[table].join(", ");
    const result = await query(`SELECT ${columns} FROM ${table} ORDER BY ${primaryKeys[table]}`);
    tables[table] = result.rows;
  }

  const sessions = await query("SELECT COUNT(*) AS count FROM portal_sessions");
  const excludedPortalSessions = Number(sessions.rows[0]?.count);
  if (!Number.isSafeInteger(excludedPortalSessions) || excludedPortalSessions < 0) {
    throw new Error("PostgreSQL returned an invalid Portal Session count");
  }

  return { formatVersion: 1, createdAt: new Date().toISOString(), excludedPortalSessions, tables };
}

export function buildD1ImportStatements(snapshot: PostgresToD1MigrationSnapshot): D1MigrationStatement[] {
  validateSnapshot(snapshot, postgresMigrationOrder, true);
  return buildStatements(snapshot.tables, postgresMigrationOrder);
}

export function buildD1RestoreStatements(snapshot: D1BackupSnapshot): D1MigrationStatement[] {
  validateSnapshot(snapshot, d1DataTables, false);
  return buildStatements(snapshot.tables, d1DataTables);
}

export function getD1MigrationExpectedCounts(snapshot: PostgresToD1MigrationSnapshot) {
  validateSnapshot(snapshot, postgresMigrationOrder, true);
  if (!(snapshot.tables.evaluation_template_versions ?? []).some((row) => row.id === defaultEvaluationTemplateId)) {
    throw new Error("The PostgreSQL snapshot is missing the built-in Evaluation Template");
  }
  return Object.fromEntries([
    ...postgresMigrationOrder.map((table) => [table, snapshot.tables[table]?.length ?? 0]),
    ["portal_sessions", 0],
  ]) as Record<PostgresMigrationTable | "portal_sessions", number>;
}

export function getD1BackupExpectedCounts(snapshot: D1BackupSnapshot) {
  validateSnapshot(snapshot, d1DataTables, false);
  if (!(snapshot.tables.evaluation_template_versions ?? []).some((row) => row.id === defaultEvaluationTemplateId)) {
    throw new Error("The D1 backup is missing the built-in Evaluation Template");
  }
  return Object.fromEntries(d1DataTables.map((table) => [table, snapshot.tables[table]?.length ?? 0])) as Record<D1DataTable, number>;
}

export function serializeD1ImportStatements(statements: readonly D1MigrationStatement[]) {
  return statements.map(({ sql, values }) => interpolateValues(sql, values)).join(";\n") + (statements.length ? ";\n" : "");
}

function buildStatements(
  tables: Partial<Record<D1DataTable, readonly D1DataRow[]>>,
  order: readonly D1DataTable[],
) {
  const statements: D1MigrationStatement[] = [];
  const deferredProfiles: Array<{ id: string; profileObjectId: string }> = [];
  const deferredEventStates: D1DataRow[] = [];

  for (const table of order) {
    const columns = d1DataTableColumns[table] as readonly string[];
    for (const row of tables[table] ?? []) {
      if (table === "evaluation_template_versions" && isBuiltInEvaluationTemplate(row)) continue;
      if (table === "portal_users" && typeof row.profile_object_id === "string") {
        deferredProfiles.push({ id: row.id as string, profileObjectId: row.profile_object_id });
      }
      if (table === "events") deferredEventStates.push(row);

      const values = columns.map((column) => {
        if (table === "portal_users" && column === "profile_object_id") return null;
        if (table === "events" && column === "status") return "DRAFT";
        if (table === "events" && column === "published_at") return null;
        return normalizeValue(table, column, row[column]);
      });
      statements.push(insertStatement(table, columns, values));
    }
  }

  for (const profile of deferredProfiles) {
    statements.push({ sql: "UPDATE portal_users SET profile_object_id = ? WHERE id = ?", values: [profile.profileObjectId, profile.id] });
  }
  for (const event of deferredEventStates) {
    statements.push({
      sql: "UPDATE events SET status = ?, published_at = ?, cancelled_at = ?, completed_at = ?, archived_at = ?, version = ?, updated_at = ? WHERE id = ?",
      values: [
        normalizeValue("events", "status", event.status),
        normalizeValue("events", "published_at", event.published_at),
        normalizeValue("events", "cancelled_at", event.cancelled_at),
        normalizeValue("events", "completed_at", event.completed_at),
        normalizeValue("events", "archived_at", event.archived_at),
        normalizeValue("events", "version", event.version),
        normalizeValue("events", "updated_at", event.updated_at),
        normalizeValue("events", "id", event.id),
      ],
    });
  }
  return statements;
}

function validateSnapshot(
  snapshot: { formatVersion: number; createdAt: string; excludedPortalSessions?: number; tables: Partial<Record<D1DataTable, readonly D1DataRow[]>> },
  tableList: readonly D1DataTable[],
  requiresSessionExclusionCount: boolean,
) {
  if (snapshot.formatVersion !== 1 || !Number.isFinite(Date.parse(snapshot.createdAt))) {
    throw new Error("Unsupported or invalid D1 snapshot");
  }
  if (requiresSessionExclusionCount && (!Number.isInteger(snapshot.excludedPortalSessions) || (snapshot.excludedPortalSessions ?? -1) < 0)) {
    throw new Error("Unsupported or invalid PostgreSQL-to-D1 migration snapshot");
  }
  if (!snapshot.tables || typeof snapshot.tables !== "object" || tableList.some((table) => !Array.isArray(snapshot.tables[table])) || Object.keys(snapshot.tables).length !== tableList.length) {
    throw new Error("Migration snapshot is incomplete");
  }

  for (const [table, rows] of Object.entries(snapshot.tables)) {
    if (!tableList.includes(table as D1DataTable) || !Array.isArray(rows)) throw new Error("D1 snapshot contains an unsupported table");
    const columns = d1DataTableColumns[table as D1DataTable] as readonly string[];
    for (const row of rows) {
      if (!row || typeof row !== "object" || columns.some((column) => !(column in row)) || Object.keys(row).some((column) => !columns.includes(column))) {
        throw new Error(`D1 snapshot contains an invalid ${table} row`);
      }
    }
  }
}

function isBuiltInEvaluationTemplate(row: D1DataRow) {
  if (row.id !== defaultEvaluationTemplateId) return false;
  const questions = normalizeJson(row.questions);
  if (row.version !== 1 || questions !== JSON.stringify(defaultEvaluationTemplateQuestions)) {
    throw new Error("The built-in Evaluation Template differs from the D1 target schema");
  }
  return true;
}

function insertStatement(table: D1DataTable, columns: readonly string[], values: (string | number | null)[]): D1MigrationStatement {
  return { sql: `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map(() => "?").join(", ")})`, values };
}

function normalizeValue(table: D1DataTable, column: string, value: unknown): string | number | null {
  if (value === null) return null;
  if (value === undefined) throw new Error(`D1 snapshot row is missing ${table}.${column}`);
  if (jsonColumns.has(`${table}.${column}`)) return normalizeJson(value);
  if (booleanColumns.has(`${table}.${column}`)) {
    if (typeof value === "boolean") return value ? 1 : 0;
    if (value === 0 || value === 1) return value;
    throw new Error(`D1 snapshot row has an invalid boolean ${table}.${column}`);
  }
  if (column === "birth_date") {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/u.test(value)) return value.slice(0, 10);
    throw new Error("D1 snapshot row has an invalid Portal User birth date");
  }
  if (timestampColumns.has(column) && (value instanceof Date || typeof value === "string")) {
    const timestamp = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(timestamp.getTime())) throw new Error(`D1 snapshot row has an invalid timestamp ${table}.${column}`);
    return timestamp.toISOString();
  }
  if (typeof value === "boolean") return value ? 1 : 0;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") return value;
  throw new Error(`D1 snapshot row has an unsupported value ${table}.${column}`);
}

function normalizeJson(value: unknown) {
  const parsed = typeof value === "string" ? JSON.parse(value) as unknown : value;
  return JSON.stringify(parsed);
}

function interpolateValues(sql: string, values: readonly (string | number | null)[]) {
  let valueIndex = 0;
  const statement = sql.replaceAll("?", () => sqlLiteral(values[valueIndex++]));
  if (valueIndex !== values.length) throw new Error("D1 migration statement binding count mismatch");
  return statement;
}

function sqlLiteral(value: string | number | null) {
  if (value === null) return "NULL";
  if (typeof value === "number") return String(value);
  return `'${value.replaceAll("'", "''")}'`;
}
