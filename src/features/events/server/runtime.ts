import "server-only";

import { withAccessRuntime, type AccessPersistence } from "@/features/access/server";
import { PrismaEventRepository } from "./prisma-event-repository";
import { createEventFeature } from "./events";

export function withEventFeature<Result>(
  work: (feature: ReturnType<typeof createEventFeature>) => Promise<Result>,
) {
  return withAccessRuntime(
    async (sessions, persistence: AccessPersistence<{
      events: PrismaEventRepository;
    }>) => work(createEventFeature({ sessions, transactions: persistence.transactions })),
    (transaction) => ({ events: new PrismaEventRepository(transaction) }),
  );
}
