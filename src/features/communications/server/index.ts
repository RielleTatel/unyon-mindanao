import "server-only";

import { withAccessRuntime } from "@/features/access/server";
import { createCommunicationsFeature, type CommunicationsRepository } from "./communications";
import { PrismaCommunicationsRepository } from "./prisma-communications-repository";
import { D1CommunicationsRepository } from "./d1-communications-repository";

export { createCommunicationsFeature, type CommunicationsRepository } from "./communications";

export function withCommunicationsFeature<Result>(work: (feature: ReturnType<typeof createCommunicationsFeature>) => Promise<Result>) {
  if (process.env.PERSISTENCE_PROVIDER === "d1") {
    return import("@/features/access/server/d1-runtime").then(({ withD1AccessRuntime }) =>
      withD1AccessRuntime<{ communications: CommunicationsRepository }, Result>(
        (sessions, persistence) => work(createCommunicationsFeature({ sessions, transactions: persistence.transactions })),
        (transaction) => ({ communications: new D1CommunicationsRepository(transaction) }),
      ),
    );
  }
  return withAccessRuntime<{ communications: PrismaCommunicationsRepository }, Result>(
    (sessions, persistence) => work(createCommunicationsFeature({ sessions, transactions: persistence.transactions })),
    (transaction) => ({ communications: new PrismaCommunicationsRepository(transaction) }),
  );
}
