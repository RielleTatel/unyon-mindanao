import "server-only";

import { withAccessRuntime } from "@/features/access/server";
import { createCommunicationsFeature } from "./communications";
import { PrismaCommunicationsRepository } from "./prisma-communications-repository";

export { createCommunicationsFeature, type CommunicationsRepository } from "./communications";

export function withCommunicationsFeature<Result>(work: (feature: ReturnType<typeof createCommunicationsFeature>) => Promise<Result>) {
  return withAccessRuntime<{ communications: PrismaCommunicationsRepository }, Result>(
    (sessions, persistence) => work(createCommunicationsFeature({ sessions, transactions: persistence.transactions })),
    (transaction) => ({ communications: new PrismaCommunicationsRepository(transaction) }),
  );
}
