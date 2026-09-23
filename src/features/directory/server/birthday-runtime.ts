import "server-only";

import { withAccessRuntime } from "@/features/access/server";
import { createFirebaseIdentityVerifier } from "@/platform/firebase/identity-verifier";
import { createBirthdayFeature } from "./birthdays";
import { PrismaBirthdayRepository } from "./prisma-birthday-repository";

export function withBirthdayFeature<Result>(work: (feature: ReturnType<typeof createBirthdayFeature>) => Promise<Result>) {
  return withAccessRuntime<{ birthdays: PrismaBirthdayRepository }, Result>(
    (sessions, persistence) => work(createBirthdayFeature({
      sessions, transactions: persistence.transactions,
      identityVerifier: createFirebaseIdentityVerifier({
        projectId: process.env.FIREBASE_PROJECT_ID!,
        emulatorHost: process.env.APP_ENV === "local" ? process.env.FIREBASE_AUTH_EMULATOR_HOST : undefined,
      }),
    })),
    (transaction) => ({ birthdays: new PrismaBirthdayRepository(transaction) }),
  );
}
