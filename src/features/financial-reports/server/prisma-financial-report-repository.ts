import "server-only";
import type { Prisma } from "#unyon-prisma-client";
import { AccessError } from "@/features/access/server";
import type { FinancialReportRepository } from "./reports";

export class PrismaFinancialReportRepository implements FinancialReportRepository {
  constructor(private readonly transaction: Prisma.TransactionClient) {}
  async list(administrative: boolean) {
    const rows = await this.transaction.financialReport.findMany({
      where: administrative ? {} : { revisions: { some: { status: "PUBLISHED" } } }, orderBy: { createdAt: "desc" },
      select: { id: true, title: true, reportingPeriod: true, description: true, revisions: { where: administrative ? {} : { status: { not: "DRAFT" } }, orderBy: { revision: "desc" }, select: { id: true, revision: true, status: true, objectId: true, publishedAt: true } } },
    });
    return rows.map((row) => ({ ...row, revisions: row.revisions.map((revision) => ({ ...revision, publishedAt: revision.publishedAt?.toISOString() ?? null })) }));
  }
  async get(id: string) { return (await this.list(true)).find((report) => report.id === id) ?? null; }
  async create(input: Parameters<FinancialReportRepository["create"]>[0]) { await this.transaction.financialReport.create({ data: { ...input, revisions: { create: { revision: 1 } } } }); }
  async revise(id: string) {
    await this.transaction.$queryRaw`SELECT id FROM financial_reports WHERE id = ${id}::uuid FOR UPDATE`;
    if (await this.transaction.financialReportRevision.count({ where: { reportId: id, status: "DRAFT" } })) throw new AccessError("CONFLICT", "Finish the existing draft first");
    const last = await this.transaction.financialReportRevision.aggregate({ where: { reportId: id }, _max: { revision: true } });
    await this.transaction.financialReportRevision.create({ data: { reportId: id, revision: (last._max.revision ?? 0) + 1 } });
  }
  async publish(id: string, revisionId: string, actorId: string, now: Date) {
    await this.transaction.$queryRaw`SELECT id FROM financial_reports WHERE id = ${id}::uuid FOR UPDATE`;
    const revision = await this.transaction.financialReportRevision.findUnique({ where: { id: revisionId }, include: { object: true } });
    if (!revision || revision.reportId !== id || revision.status !== "DRAFT" || revision.object?.status !== "AVAILABLE" || revision.object.purpose !== "FINANCIAL_REPORT" || revision.object.resourceId !== revision.id) throw new AccessError("CONFLICT", "Upload a PDF to the draft before publishing");
    await this.transaction.financialReportRevision.updateMany({ where: { reportId: id, status: "PUBLISHED" }, data: { status: "SUPERSEDED", supersededAt: now } });
    await this.transaction.financialReportRevision.update({ where: { id: revisionId }, data: { status: "PUBLISHED", publishedAt: now, publishedById: actorId } });
  }
}
