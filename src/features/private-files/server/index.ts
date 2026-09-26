import "server-only";

import { createPrivateObjectStore } from "#unyon-object-store";
import { withAccessRuntime } from "@/features/access/server";
import { createPrivateFileFeature, type PrivateFileRepository } from "./private-files";
import { PrismaPrivateFileRepository } from "./prisma-private-file-repository";
import { D1PrivateFileRepository } from "./d1-private-file-repository";

export { createPrivateFileFeature, type PrivateFileRepository, validSignature } from "./private-files";
export function withPrivateFileFeature<Result>(work: (feature: ReturnType<typeof createPrivateFileFeature>) => Promise<Result>) {
  if (process.env.PERSISTENCE_PROVIDER === "d1") {
    return import("@/features/access/server/d1-runtime").then(({ withD1AccessRuntime }) =>
      withD1AccessRuntime<{ files: PrivateFileRepository }, Result>(
        (sessions, persistence) => work(createPrivateFileFeature({ sessions, transactions: persistence.transactions, store: createPrivateObjectStore() })),
        (transaction) => ({ files: new D1PrivateFileRepository(transaction) }),
      ),
    );
  }
  return withAccessRuntime<{ files: PrismaPrivateFileRepository }, Result>(
    (sessions, persistence) => work(createPrivateFileFeature({ sessions, transactions: persistence.transactions, store: createPrivateObjectStore() })),
    (transaction) => ({ files: new PrismaPrivateFileRepository(transaction) }),
  );
}
