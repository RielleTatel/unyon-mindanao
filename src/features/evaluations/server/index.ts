import "server-only";
import { withAccessRuntime } from "@/features/access/server";
import { createEvaluationFeature, type EvaluationRepository } from "./evaluations";
import { PrismaEvaluationRepository } from "./prisma-evaluation-repository";
import { D1EvaluationRepository } from "./d1-evaluation-repository";
export { createEvaluationFeature, type EvaluationRepository } from "./evaluations";
export { PrismaEvaluationRepository } from "./prisma-evaluation-repository";
export function withEvaluationFeature<Result>(work: (feature: ReturnType<typeof createEvaluationFeature>) => Promise<Result>) {
  if (process.env.PERSISTENCE_PROVIDER === "d1") {
    return import("@/features/access/server/d1-runtime").then(({ withD1AccessRuntime }) =>
      withD1AccessRuntime<{ evaluations: EvaluationRepository }, Result>(
        (sessions, persistence) => work(createEvaluationFeature({ sessions, transactions: persistence.transactions })),
        (transaction) => ({ evaluations: new D1EvaluationRepository(transaction) }),
      ),
    );
  }
  return withAccessRuntime<{ evaluations: PrismaEvaluationRepository }, Result>((sessions, persistence) => work(createEvaluationFeature({ sessions, transactions: persistence.transactions })), (transaction) => ({ evaluations: new PrismaEvaluationRepository(transaction) }));
}
