import "server-only";

import {
  withAccessRuntime,
  type AccessPersistence,
} from "@/features/access/server";
import { createMemberUniversityFeature } from "./member-universities";
import { PrismaMemberUniversityRepository } from "./prisma-member-university-repository";

export function withMemberUniversityFeature<Result>(
  work: (
    feature: ReturnType<typeof createMemberUniversityFeature>,
  ) => Promise<Result>,
) {
  return withAccessRuntime(
    async (sessions, persistence: AccessPersistence<{
      memberUniversities: PrismaMemberUniversityRepository;
    }>) =>
      work(
        createMemberUniversityFeature({
          sessions,
          transactions: persistence.transactions,
        }),
      ),
    (transaction) => ({
      memberUniversities: new PrismaMemberUniversityRepository(transaction),
    }),
  );
}
