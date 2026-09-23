import "server-only";

import { createPrivateObjectStore } from "#unyon-object-store";
import { withAccessRuntime } from "@/features/access/server";
import { createPrivateFileFeature } from "./private-files";
import { PrismaPrivateFileRepository } from "./prisma-private-file-repository";

export { createPrivateFileFeature, type PrivateFileRepository, validSignature } from "./private-files";
export function withPrivateFileFeature<Result>(work: (feature: ReturnType<typeof createPrivateFileFeature>) => Promise<Result>) {
  return withAccessRuntime<{ files: PrismaPrivateFileRepository }, Result>(
    (sessions, persistence) => work(createPrivateFileFeature({ sessions, transactions: persistence.transactions, store: createPrivateObjectStore() })),
    (transaction) => ({ files: new PrismaPrivateFileRepository(transaction) }),
  );
}
