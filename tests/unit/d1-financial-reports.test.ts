// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import {
  createD1AccessPersistence,
  createSuperAdminBootstrap,
} from "@/features/access/server";
import {
  createFinancialReportFeature,
  type FinancialReportRepository,
} from "@/features/financial-reports/server";
import { D1FinancialReportRepository } from "@/features/financial-reports/server/d1-financial-report-repository";
import { LocalD1Database } from "../fixtures/local-d1";

const adminTokenHash = "4".repeat(64);

describe("D1 financial reports through the feature interface", () => {
  let database: LocalD1Database;

  afterEach(() => database?.close());

  it("creates revisions, requires an available private PDF, and supersedes atomically", async () => {
    database = new LocalD1Database([
      "0001_access_foundation.sql",
      "0002_communications.sql",
      "0003_events_and_files.sql",
      "0004_invitations.sql",
      "0005_evaluations_and_reports.sql",
    ]);
    const access = createD1AccessPersistence(database as unknown as D1Database);
    const admin = await createSuperAdminBootstrap(access.superAdminBootstrap)({
      correlationId: "bootstrap",
      email: "admin@unyon.test",
      firebaseUid: "firebase-admin-reports",
      fullName: "Report Administrator",
    });
    await access.sessions.start({
      correlationId: "session",
      identity: {
        authenticatedAt: new Date(Date.now() - 1_000),
        email: "admin@unyon.test",
        emailVerified: true,
        firebaseUid: "firebase-admin-reports",
      },
      maximumLifetimeSeconds: 3600,
      tokenHash: adminTokenHash,
    });
    const persistence = createD1AccessPersistence<{
      reports: FinancialReportRepository;
    }>(database as unknown as D1Database, (transaction) => ({
      reports: new D1FinancialReportRepository(transaction),
    }));
    const feature = createFinancialReportFeature({
      sessions: { hashSessionToken: async () => adminTokenHash },
      transactions: persistence.transactions,
    });
    const sessionToken = "report-admin-session";

    const report = await feature.create({
      correlationId: "report-create",
      sessionToken,
      input: {
        title: "Annual Financial Report",
        reportingPeriod: "2025–2026",
        description: "Audited report for member universities.",
      },
    });
    let record = await persistence.transactions.run(
      { correlationId: "inspect-report", tokenHash: adminTokenHash },
      async (transaction) => transaction.capabilities.reports.get(report.id),
    );
    expect(record?.revisions).toHaveLength(1);
    const initialRevision = record!.revisions[0]!;

    const firstObjectId = "78901234-7890-4890-8890-789012345678";
    await database.batch([
      database.prepare(
        `INSERT INTO stored_objects
          (id, key, purpose, resource_id, uploader_id, mime_type, size, sha256, status, expires_at)
         VALUES (?, ?, 'FINANCIAL_REPORT', ?, ?, 'application/pdf', 100, ?, 'AVAILABLE', ?)`,
      ).bind(firstObjectId, firstObjectId, initialRevision.id, admin.portalUserId, "a".repeat(64), new Date(Date.now() + 60_000).toISOString()),
      database.prepare(
        "UPDATE financial_report_revisions SET object_id = ? WHERE id = ?",
      ).bind(firstObjectId, initialRevision.id),
    ]);
    await feature.publish({
      correlationId: "report-publish-first",
      sessionToken,
      input: { id: report.id, revisionId: initialRevision.id },
    });

    await feature.revise({
      correlationId: "report-revise",
      sessionToken,
      input: { id: report.id },
    });
    record = await persistence.transactions.run(
      { correlationId: "inspect-report", tokenHash: adminTokenHash },
      async (transaction) => transaction.capabilities.reports.get(report.id),
    );
    const nextRevision = record!.revisions.find(({ status }) => status === "DRAFT")!;
    const secondObjectId = "89012345-8901-4901-8901-890123456789";
    await database.batch([
      database.prepare(
        `INSERT INTO stored_objects
          (id, key, purpose, resource_id, uploader_id, mime_type, size, sha256, status, expires_at)
         VALUES (?, ?, 'FINANCIAL_REPORT', ?, ?, 'application/pdf', 100, ?, 'AVAILABLE', ?)`,
      ).bind(secondObjectId, secondObjectId, nextRevision.id, admin.portalUserId, "b".repeat(64), new Date(Date.now() + 60_000).toISOString()),
      database.prepare(
        "UPDATE financial_report_revisions SET object_id = ? WHERE id = ?",
      ).bind(secondObjectId, nextRevision.id),
    ]);
    await feature.publish({
      correlationId: "report-publish-second",
      sessionToken,
      input: { id: report.id, revisionId: nextRevision.id },
    });

    await expect(
      feature.list({ correlationId: "public-reports", sessionToken, input: {} }),
    ).resolves.toMatchObject([
      { id: report.id, revisions: [{ status: "PUBLISHED" }, { status: "SUPERSEDED" }] },
    ]);
    await expect(
      database.prepare(
        "SELECT action FROM audit_logs WHERE action LIKE 'financial_report.%'",
      ).all<{ action: string }>(),
    ).resolves.toMatchObject({ results: expect.arrayContaining([
      { action: "financial_report.created" },
      { action: "financial_report.revision_created" },
      { action: "financial_report.published" },
    ]) });
  });
});
