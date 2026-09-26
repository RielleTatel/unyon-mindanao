import "server-only";

import { withAccessRuntime } from "@/features/access/server";
import { createFirebaseIdentityVerifier } from "@/platform/firebase/identity-verifier";
import { createBirthdayFeature, type BirthdayRepository } from "./birthdays";
import { PrismaBirthdayRepository } from "./prisma-birthday-repository";
import { D1BirthdayRepository } from "./d1-birthday-repository";

export function withBirthdayFeature<Result>(work: (feature: ReturnType<typeof createBirthdayFeature>) => Promise<Result>) {
  if (process.env.PERSISTENCE_PROVIDER === "d1") {
    return import("@/features/access/server/d1-runtime").then(({ withD1AccessRuntime }) =>
      withD1AccessRuntime<{ birthdays: BirthdayRepository }, Result>(
        (sessions, persistence) => work(createBirthdayFeature({
          sessions, transactions: persistence.transactions,
          identityVerifier: createFirebaseIdentityVerifier({
            projectId: process.env.FIREBASE_PROJECT_ID!,
            emulatorHost: process.env.APP_ENV === "local" ? process.env.FIREBASE_AUTH_EMULATOR_HOST : undefined,
          }),
        })),
        (transaction) => ({ birthdays: new D1BirthdayRepository(transaction) }),
      ),
    );
  }
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
