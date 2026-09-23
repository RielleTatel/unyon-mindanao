import "server-only";
import { withAccessRuntime } from "@/features/access/server";
import { createEvaluationFeature } from "./evaluations";
import { PrismaEvaluationRepository } from "./prisma-evaluation-repository";
export { createEvaluationFeature } from "./evaluations";
export { PrismaEvaluationRepository } from "./prisma-evaluation-repository";
export function withEvaluationFeature<Result>(work: (feature: ReturnType<typeof createEvaluationFeature>) => Promise<Result>) {
  return withAccessRuntime<{ evaluations: PrismaEvaluationRepository }, Result>((sessions, persistence) => work(createEvaluationFeature({ sessions, transactions: persistence.transactions })), (transaction) => ({ evaluations: new PrismaEvaluationRepository(transaction) }));
}
