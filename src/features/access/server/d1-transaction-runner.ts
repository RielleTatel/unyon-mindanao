import "server-only";

import { redactAuditMetadata } from "./audit";
import type {
  AuditRecord,
  PortalActor,
  ProtectedTransaction,
  TransactionRunner,
} from "./contracts";
import { AccessError, authenticationRequired } from "./errors";

interface ActiveSessionRow {
  appointment_id: string | null;
  email: string;
  firebase_uid: string;
  portal_user_id: string;
  role: PortalActor["appointments"][number]["role"] | null;
  status: "ACTIVE" | "DISABLED";
  university_id: string | null;
}

type D1SqlExecutor = Pick<D1Database, "prepare" | "batch">;

export async function d1DatabaseNow(database: D1SqlExecutor) {
  const row = await database
    .prepare("SELECT strftime('%Y-%m-%dT%H:%M:%fZ', 'now') AS now")
    .first<{ now: string }>();
  if (!row) throw new Error("D1 database time unavailable");
  return new Date(row.now);
}

export class D1BatchTransaction {
  private readonly writes: D1PreparedStatement[] = [];

  constructor(
    private readonly database: D1SqlExecutor,
    readonly occurredAt: Date,
  ) {}

  async first<Row>(query: string, ...values: unknown[]) {
    return this.database.prepare(query).bind(...values).first<Row>();
  }

  async all<Row>(query: string, ...values: unknown[]) {
    const result = await this.database.prepare(query).bind(...values).all<Row>();
    if (!result.success) throw new Error("D1 query failed");
    return result.results;
  }

  enqueue(query: string, ...values: unknown[]) {
    this.writes.push(this.database.prepare(query).bind(...values));
  }

  get hasWrites() {
    return this.writes.length > 0;
  }

  prependGuard(query: string, ...values: unknown[]) {
    const pending = this.writes.splice(0);
    this.enqueueGuard(query, ...values);
    this.writes.push(...pending);
  }

  enqueueGuard(query: string, ...values: unknown[]) {
    const assertionId = crypto.randomUUID();
    this.enqueue(
      `INSERT INTO d1_assertion_guard (id, passed)
       SELECT ?, CASE WHEN EXISTS (${query}) THEN 1 ELSE 0 END`,
      assertionId,
      ...values,
    );
    this.enqueue("DELETE FROM d1_assertion_guard WHERE id = ?", assertionId);
  }

  enqueueCheckedMutation(query: string, ...values: unknown[]) {
    this.enqueueCheckedMutationWithCount(query, 1, ...values);
  }

  enqueueCheckedMutationWithCount(
    query: string,
    expectedChanges: number,
    ...values: unknown[]
  ) {
    const assertionId = crypto.randomUUID();
    this.enqueue(query, ...values);
    this.enqueue(
      `INSERT INTO d1_assertion_guard (id, passed)
       SELECT ?, CASE WHEN changes() = ? THEN 1 ELSE 0 END`,
      assertionId,
      expectedChanges,
    );
    this.enqueue("DELETE FROM d1_assertion_guard WHERE id = ?", assertionId);
  }

  appendAudit = async (record: AuditRecord) => {
    this.enqueue(
      `INSERT INTO audit_logs
        (id, actor_portal_user_id, action, resource_type, resource_id, correlation_id, metadata, occurred_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      crypto.randomUUID(),
      record.actorPortalUserId,
      record.action,
      record.resourceType,
      record.resourceId,
      record.correlationId,
      JSON.stringify(redactAuditMetadata(record.metadata)),
      record.occurredAt.toISOString(),
    );
  };

  async commit() {
    if (this.writes.length === 0) return;
    const results = await this.database.batch(this.writes);
    if (results.some((result) => !result.success)) {
      throw new Error("D1 transaction batch failed");
    }
  }
}

export class D1TransactionRunner<
  Capabilities extends object = Record<string, never>,
> implements TransactionRunner<Capabilities> {
  constructor(
    private readonly database: D1Database,
    private readonly createCapabilities: (
      transaction: D1BatchTransaction,
      occurredAt: Date,
      database: D1Database,
    ) => Capabilities = () => ({}) as Capabilities,
    private readonly clock?: () => Date,
  ) {}

  async run<Result>(
    input: { correlationId: string; tokenHash: string; mode?: "read" | "write" },
    work: (
      transaction: ProtectedTransaction<Capabilities>,
      actor: PortalActor,
    ) => Promise<Result>,
  ): Promise<Result> {
    let auditActorId: string | undefined;

    try {
      const database = this.database.withSession("first-primary");
      const occurredAt = this.clock ? this.clock() : await d1DatabaseNow(database);
      const rows = await database.prepare(
        `SELECT
           s.portal_user_id,
           u.firebase_uid,
           u.email,
           u.status,
           a.id AS appointment_id,
           a.role,
           a.university_id
         FROM portal_sessions AS s
         JOIN portal_users AS u ON u.id = s.portal_user_id
         LEFT JOIN appointments AS a
           ON a.portal_user_id = u.id
          AND a.starts_at <= ?
          AND (a.ends_at IS NULL OR a.ends_at > ?)
         WHERE s.token_hash = ?
           AND s.expires_at > ?
           AND s.revoked_at IS NULL
         ORDER BY a.starts_at, a.id`,
      )
        .bind(
          occurredAt.toISOString(),
          occurredAt.toISOString(),
          input.tokenHash,
          occurredAt.toISOString(),
        )
        .all<ActiveSessionRow>();

      if (!rows.success) throw new Error("D1 session lookup failed");
      const firstRow = rows.results[0];
      auditActorId = firstRow?.portal_user_id;

      const appointments = rows.results.flatMap((row) =>
        row.appointment_id && row.role
          ? [{
              id: row.appointment_id,
              role: row.role,
              universityId: row.university_id,
            }]
          : [],
      );

      if (!firstRow || firstRow.status !== "ACTIVE" || appointments.length === 0) {
        throw authenticationRequired();
      }

      const actor: PortalActor = {
        appointments,
        email: firstRow.email,
        firebaseUid: firstRow.firebase_uid,
        portalUserId: firstRow.portal_user_id,
      };
      const transaction = new D1BatchTransaction(database, occurredAt);
      const capturedUserId = actor.portalUserId;
      const capturedAppointments = JSON.stringify(actor.appointments);
      const capturedAppointmentCount = actor.appointments.length;
      const authorityQuery = `SELECT 1
         FROM portal_sessions AS s
         JOIN portal_users AS u ON u.id = s.portal_user_id
         WHERE s.token_hash = ?
           AND s.portal_user_id = ?
           AND s.expires_at > COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
           AND s.revoked_at IS NULL
           AND u.status = 'ACTIVE'
           AND (
             SELECT COUNT(*)
             FROM appointments AS a JOIN json_each(?) AS captured
               ON a.id = json_extract(captured.value, '$.id')
             WHERE a.portal_user_id = u.id
               AND a.role = json_extract(captured.value, '$.role')
               AND a.university_id IS json_extract(captured.value, '$.universityId')
               AND a.starts_at <= COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
               AND (a.ends_at IS NULL OR a.ends_at > COALESCE(?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')))
           ) = ?`;
      const result = await work(
        {
          appendAudit: transaction.appendAudit,
          capabilities: this.createCapabilities(transaction, occurredAt, this.database),
          occurredAt,
        },
        actor,
      );
      const guardTime = this.clock?.().toISOString() ?? null;
      const authorityValues = [input.tokenHash, capturedUserId, guardTime,
        capturedAppointments, guardTime, guardTime, capturedAppointmentCount];
      if (input.mode === "read" && !transaction.hasWrites) {
        // A fresh session makes this final authority check the primary query.
        const primary = this.database.withSession("first-primary");
        const valid = await primary.prepare(authorityQuery).bind(...authorityValues).first();
        if (!valid) throw authenticationRequired();
        return result;
      }
      transaction.prependGuard(authorityQuery, ...authorityValues);
      await transaction.commit();
      return result;
    } catch (error) {
      if (
        auditActorId &&
        error instanceof AccessError &&
        (error.code === "NOT_FOUND_OR_FORBIDDEN" ||
          error.code === "AUTHENTICATION_REQUIRED")
      ) {
        const database = this.database.withSession("first-primary");
        const occurredAt = this.clock ? this.clock() : await d1DatabaseNow(database);
        const transaction = new D1BatchTransaction(database, occurredAt);
        await transaction.appendAudit({
          action: "access.denied",
          actorPortalUserId: auditActorId,
          correlationId: input.correlationId,
          metadata: { reason: error.code },
          occurredAt,
          resourceId: "access",
          resourceType: "ProtectedOperation",
        });
        await transaction.commit();
      }
      if (isConstraintFailure(error)) {
        throw new AccessError(
          "CONFLICT",
          "The record changed or conflicts with an existing record",
        );
      }
      throw error;
    }
  }

}

function isConstraintFailure(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : String(error);
  return /constraint failed|unique constraint|foreign key constraint|overlapping appointment/iu.test(
    message,
  );
}
