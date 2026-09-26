// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import {
  D1BatchTransaction,
  D1TransactionRunner,
} from "@/features/access/server/d1-transaction-runner";
import type { AuditRecord } from "@/features/access/server/contracts";
import { LocalD1Database } from "../fixtures/local-d1";

const fixedNow = new Date("2026-09-25T03:00:00.000Z");
const ids = {
  appointment: "appointment-1",
  session: "session-1",
  user: "user-1",
};
const tokenHash = "a".repeat(64);

describe("D1 transaction runner", () => {
  let database: LocalD1Database;

  afterEach(() => database?.close());

  async function seedActiveSession() {
    await database.batch([
      database.prepare(
        `INSERT INTO portal_users (id, firebase_uid, email, full_name, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).bind(ids.user, "firebase-user-1", "admin@unyon.test", "Admin", fixedNow.toISOString(), fixedNow.toISOString()),
      database.prepare(
        `INSERT INTO appointments (id, portal_user_id, role, starts_at)
         VALUES (?, ?, 'SUPER_ADMIN', ?)`,
      ).bind(ids.appointment, ids.user, "2026-09-24T00:00:00.000Z"),
      database.prepare(
        `INSERT INTO portal_sessions (id, portal_user_id, token_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).bind(ids.session, ids.user, tokenHash, "2026-09-30T00:00:00.000Z", fixedNow.toISOString()),
    ]);
  }

  function makeRunner() {
    return new D1TransactionRunner<{ database: D1BatchTransaction }>(
      database as unknown as D1Database,
      (transaction) => ({ database: transaction }),
      () => fixedNow,
    );
  }

  function auditRecord(overrides: Partial<AuditRecord> = {}): AuditRecord {
    return {
      action: "account.renamed",
      actorPortalUserId: ids.user,
      correlationId: "correlation-1",
      metadata: { note: "safe" },
      occurredAt: fixedNow,
      resourceId: ids.user,
      resourceType: "PortalUser",
      ...overrides,
    };
  }

  it("resolves current authority and commits the mutation and audit in one D1 batch", async () => {
    database = new LocalD1Database();
    await seedActiveSession();
    const runner = makeRunner();

    const result = await runner.run(
      { correlationId: "correlation-1", tokenHash },
      async (transaction, actor) => {
        transaction.capabilities.database.enqueue(
          "UPDATE portal_users SET full_name = ? WHERE id = ?",
          "Renamed Admin",
          actor.portalUserId,
        );
        await transaction.appendAudit(auditRecord());
        return actor.appointments[0]?.role;
      },
    );

    expect(result).toBe("SUPER_ADMIN");
    await expect(
      database.prepare("SELECT full_name FROM portal_users WHERE id = ?")
        .bind(ids.user)
        .first<{ full_name: string }>(),
    ).resolves.toEqual({ full_name: "Renamed Admin" });
    await expect(
      database.prepare("SELECT action, metadata FROM audit_logs").first<{
        action: string;
        metadata: string;
      }>(),
    ).resolves.toEqual({ action: "account.renamed", metadata: '{"note":"safe"}' });
  });

  it("rolls a domain mutation back when its audit insert fails", async () => {
    database = new LocalD1Database();
    await seedActiveSession();
    await database.batch([
      database.prepare(
        `CREATE TRIGGER reject_audit BEFORE INSERT ON audit_logs
         BEGIN SELECT RAISE(ABORT, 'audit unavailable'); END`,
      ),
    ]);

    await expect(
      makeRunner().run(
        { correlationId: "correlation-1", tokenHash },
        async (transaction, actor) => {
          transaction.capabilities.database.enqueue(
            "UPDATE portal_users SET full_name = ? WHERE id = ?",
            "Must Roll Back",
            actor.portalUserId,
          );
          await transaction.appendAudit(auditRecord());
        },
      ),
    ).rejects.toThrow(/audit unavailable/iu);

    await expect(
      database.prepare("SELECT full_name FROM portal_users WHERE id = ?")
        .bind(ids.user)
        .first<{ full_name: string }>(),
    ).resolves.toEqual({ full_name: "Admin" });
  });

  it("rejects a session when its Appointment has expired", async () => {
    database = new LocalD1Database();
    await seedActiveSession();
    await database.batch([
      database.prepare(
        "UPDATE appointments SET ends_at = ? WHERE id = ?",
      ).bind("2026-09-25T02:59:59.000Z", ids.appointment),
    ]);

    await expect(
      makeRunner().run(
        { correlationId: "correlation-1", tokenHash },
        async () => "must not run",
      ),
    ).rejects.toMatchObject({ code: "AUTHENTICATION_REQUIRED" });
  });

  it("does not commit a protected write if authority is revoked before the batch", async () => {
    database = new LocalD1Database();
    await seedActiveSession();

    await expect(
      makeRunner().run(
        { correlationId: "correlation-1", tokenHash },
        async (transaction, actor) => {
          transaction.capabilities.database.enqueue(
            "UPDATE portal_users SET full_name = ? WHERE id = ?",
            "Must Not Commit",
            actor.portalUserId,
          );
          await transaction.appendAudit(auditRecord());
          await database.batch([
            database.prepare(
              "UPDATE appointments SET ends_at = ? WHERE id = ?",
            ).bind("2026-09-25T02:59:59.000Z", ids.appointment),
          ]);
        },
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    await expect(
      database.prepare("SELECT full_name FROM portal_users WHERE id = ?")
        .bind(ids.user)
        .first<{ full_name: string }>(),
    ).resolves.toEqual({ full_name: "Admin" });
    await expect(
      database.prepare("SELECT COUNT(*) AS count FROM audit_logs").first<{
        count: number;
      }>(),
    ).resolves.toEqual({ count: 0 });
  });
});
