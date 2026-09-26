import "server-only";

import { AccessError } from "@/features/access/server";
import type { D1BatchTransaction } from "@/features/access/server/d1-transaction-runner";
import type { FinancialReportRecord } from "../contracts";
import type { FinancialReportRepository } from "./reports";

interface ReportRow {
  id: string;
  title: string;
  reporting_period: string;
  description: string;
  revision_id: string | null;
  revision: number | null;
  status: "DRAFT" | "PUBLISHED" | "SUPERSEDED" | null;
  object_id: string | null;
  published_at: string | null;
}

export class D1FinancialReportRepository implements FinancialReportRepository {
  constructor(private readonly transaction: D1BatchTransaction) {}

  async list(administrative: boolean) {
    const rows = await this.transaction.all<ReportRow>(
      `SELECT r.id, r.title, r.reporting_period, r.description,
              rev.id AS revision_id, rev.revision, rev.status,
              rev.object_id, rev.published_at
       FROM financial_reports AS r
       LEFT JOIN financial_report_revisions AS rev
         ON rev.report_id = r.id
        ${administrative ? "" : "AND rev.status <> 'DRAFT'"}
       ${administrative ? "" : "WHERE EXISTS (SELECT 1 FROM financial_report_revisions AS current WHERE current.report_id = r.id AND current.status = 'PUBLISHED')"}
       ORDER BY r.created_at DESC, r.id ASC, rev.revision DESC`,
    );
    return groupReports(rows);
  }

  async get(id: string) {
    return (await this.list(true)).find((report) => report.id === id) ?? null;
  }

  async create(input: Parameters<FinancialReportRepository["create"]>[0]) {
    const now = this.transaction.occurredAt.toISOString();
    this.transaction.enqueue(
      `INSERT INTO financial_reports (id, title, reporting_period, description, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      input.id,
      input.title,
      input.reportingPeriod,
      input.description,
      now,
    );
    this.transaction.enqueue(
      `INSERT INTO financial_report_revisions (id, report_id, revision, status, created_at)
       VALUES (?, ?, 1, 'DRAFT', ?)`,
      crypto.randomUUID(),
      input.id,
      now,
    );
  }

  async revise(id: string) {
    const report = await this.get(id);
    if (!report) throw new AccessError("NOT_FOUND_OR_FORBIDDEN", "Not found or forbidden");
    const drafts = await this.transaction.first<{ count: number }>(
      `SELECT COUNT(*) AS count FROM financial_report_revisions
       WHERE report_id = ? AND status = 'DRAFT'`,
      id,
    );
    if ((drafts?.count ?? 0) > 0) {
      throw new AccessError("CONFLICT", "Finish the existing draft first");
    }
    const latest = await this.transaction.first<{ revision: number | null }>(
      `SELECT MAX(revision) AS revision FROM financial_report_revisions
       WHERE report_id = ?`,
      id,
    );
    const previousRevision = latest?.revision ?? 0;
    this.transaction.enqueueGuard(
      `SELECT 1 FROM financial_reports WHERE id = ?`,
      id,
    );
    this.transaction.enqueueGuard(
      `SELECT COUNT(*) FROM financial_report_revisions
       WHERE report_id = ? AND status = 'DRAFT' HAVING COUNT(*) = 0`,
      id,
    );
    this.transaction.enqueueGuard(
      `SELECT MAX(revision) FROM financial_report_revisions
       WHERE report_id = ? HAVING COALESCE(MAX(revision), 0) = ?`,
      id,
      previousRevision,
    );
    this.transaction.enqueue(
      `INSERT INTO financial_report_revisions (id, report_id, revision, created_at)
       VALUES (?, ?, ?, ?)`,
      crypto.randomUUID(),
      id,
      previousRevision + 1,
      this.transaction.occurredAt.toISOString(),
    );
  }

  async publish(id: string, revisionId: string, actorId: string, now: Date) {
    const draft = await this.transaction.first<{
      id: string;
      report_id: string;
      status: string;
      object_id: string | null;
      object_status: string | null;
      purpose: string | null;
      resource_id: string | null;
    }>(
      `SELECT rev.id, rev.report_id, rev.status, rev.object_id,
              obj.status AS object_status, obj.purpose, obj.resource_id
       FROM financial_report_revisions AS rev
       LEFT JOIN stored_objects AS obj ON obj.id = rev.object_id
       WHERE rev.id = ?`,
      revisionId,
    );
    if (
      !draft ||
      draft.report_id !== id ||
      draft.status !== "DRAFT" ||
      !draft.object_id ||
      draft.object_status !== "AVAILABLE" ||
      draft.purpose !== "FINANCIAL_REPORT" ||
      draft.resource_id !== draft.id
    ) {
      throw new AccessError("CONFLICT", "Upload a PDF to the draft before publishing");
    }

    const nowIso = now.toISOString();
    this.transaction.enqueueGuard(
      `SELECT 1 FROM financial_report_revisions AS rev
       JOIN stored_objects AS obj ON obj.id = rev.object_id
       WHERE rev.id = ? AND rev.report_id = ? AND rev.status = 'DRAFT'
         AND obj.status = 'AVAILABLE' AND obj.purpose = 'FINANCIAL_REPORT'
         AND obj.resource_id = rev.id`,
      revisionId,
      id,
    );
    this.transaction.enqueue(
      `UPDATE financial_report_revisions
       SET status = 'SUPERSEDED', superseded_at = ?
       WHERE report_id = ? AND status = 'PUBLISHED'`,
      nowIso,
      id,
    );
    this.transaction.enqueueCheckedMutation(
      `UPDATE financial_report_revisions
       SET status = 'PUBLISHED', published_at = ?, published_by_id = ?
       WHERE id = ? AND report_id = ? AND status = 'DRAFT' AND object_id = ?`,
      nowIso,
      actorId,
      revisionId,
      id,
      draft.object_id,
    );
  }
}

function groupReports(rows: ReportRow[]): FinancialReportRecord[] {
  const reports = new Map<string, FinancialReportRecord>();
  for (const row of rows) {
    const report = reports.get(row.id) ?? {
      description: row.description,
      id: row.id,
      reportingPeriod: row.reporting_period,
      revisions: [],
      title: row.title,
    };
    if (row.revision_id && row.revision !== null && row.status) {
      report.revisions.push({
        id: row.revision_id,
        objectId: row.object_id,
        publishedAt: row.published_at,
        revision: row.revision,
        status: row.status,
      });
    }
    reports.set(row.id, report);
  }
  return [...reports.values()];
}
