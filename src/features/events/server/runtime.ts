import "server-only";

import { withAccessRuntime, type AccessPersistence } from "@/features/access/server";
import { PrismaEventRepository } from "./prisma-event-repository";
import { D1EventRepository } from "./d1-event-repository";
import { createEventFeature, type EventCapabilities } from "./events";

export function withEventFeature<Result>(
  work: (feature: ReturnType<typeof createEventFeature>) => Promise<Result>,
) {
  if (process.env.PERSISTENCE_PROVIDER === "d1") {
    return import("@/features/access/server/d1-runtime").then(({ withD1AccessRuntime }) =>
      withD1AccessRuntime<EventCapabilities, Result>(
        (sessions, persistence) => work(createEventFeature({ sessions, transactions: persistence.transactions })),
        (transaction) => ({ events: new D1EventRepository(transaction) }),
      ),
    );
  }
  return withAccessRuntime(
    async (sessions, persistence: AccessPersistence<{
      events: PrismaEventRepository;
    }>) => work(createEventFeature({ sessions, transactions: persistence.transactions })),
    (transaction) => ({ events: new PrismaEventRepository(transaction) }),
  );
}
