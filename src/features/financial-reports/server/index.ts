import "server-only";
import { withAccessRuntime } from "@/features/access/server";
import { createFinancialReportFeature } from "./reports";
import { PrismaFinancialReportRepository } from "./prisma-financial-report-repository";
export { createFinancialReportFeature } from "./reports";
export { PrismaFinancialReportRepository } from "./prisma-financial-report-repository";
export function withFinancialReportFeature<Result>(work: (feature: ReturnType<typeof createFinancialReportFeature>) => Promise<Result>) {
  return withAccessRuntime<{ reports: PrismaFinancialReportRepository }, Result>((sessions, persistence) => work(createFinancialReportFeature({ sessions, transactions: persistence.transactions })), (transaction) => ({ reports: new PrismaFinancialReportRepository(transaction) }));
}
