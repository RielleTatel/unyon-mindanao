import "server-only";
import { withAccessRuntime } from "@/features/access/server";
import { createFinancialReportFeature, type FinancialReportRepository } from "./reports";
import { PrismaFinancialReportRepository } from "./prisma-financial-report-repository";
import { D1FinancialReportRepository } from "./d1-financial-report-repository";
export { createFinancialReportFeature, type FinancialReportRepository } from "./reports";
export { PrismaFinancialReportRepository } from "./prisma-financial-report-repository";
export function withFinancialReportFeature<Result>(work: (feature: ReturnType<typeof createFinancialReportFeature>) => Promise<Result>) {
  if (process.env.PERSISTENCE_PROVIDER === "d1") {
    return import("@/features/access/server/d1-runtime").then(({ withD1AccessRuntime }) =>
      withD1AccessRuntime<{ reports: FinancialReportRepository }, Result>(
        (sessions, persistence) => work(createFinancialReportFeature({ sessions, transactions: persistence.transactions })),
        (transaction) => ({ reports: new D1FinancialReportRepository(transaction) }),
      ),
    );
  }
  return withAccessRuntime<{ reports: PrismaFinancialReportRepository }, Result>((sessions, persistence) => work(createFinancialReportFeature({ sessions, transactions: persistence.transactions })), (transaction) => ({ reports: new PrismaFinancialReportRepository(transaction) }));
}
