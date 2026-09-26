import "server-only";

import {
  withAccessRuntime,
  type AccessPersistence,
} from "@/features/access/server";
import { createMemberUniversityFeature, type DirectoryCapabilities } from "./member-universities";
import { PrismaMemberUniversityRepository } from "./prisma-member-university-repository";
import { D1MemberUniversityRepository } from "./d1-member-university-repository";

export function withMemberUniversityFeature<Result>(
  work: (
    feature: ReturnType<typeof createMemberUniversityFeature>,
  ) => Promise<Result>,
) {
  if (process.env.PERSISTENCE_PROVIDER === "d1") {
    return import("@/features/access/server/d1-runtime").then(({ withD1AccessRuntime }) =>
      withD1AccessRuntime<DirectoryCapabilities, Result>(
        (sessions, persistence) => work(createMemberUniversityFeature({ sessions, transactions: persistence.transactions })),
        (transaction) => ({ memberUniversities: new D1MemberUniversityRepository(transaction) }),
      ),
    );
  }
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
