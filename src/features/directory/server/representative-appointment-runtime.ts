import "server-only";

import { withAccessRuntime } from "@/features/access/server";
import { createFirebaseIdentityVerifier } from "@/platform/firebase/identity-verifier";
import { createRepresentativeAppointmentFeature } from "./representative-appointments";
import { PrismaRepresentativeAppointmentRepository } from "./prisma-representative-appointment-repository";

export function withRepresentativeAppointmentFeature<Result>(work: (feature: ReturnType<typeof createRepresentativeAppointmentFeature>) => Promise<Result>) {
  return withAccessRuntime<{ representativeAppointments: PrismaRepresentativeAppointmentRepository }, Result>(
    (sessions, persistence) => work(createRepresentativeAppointmentFeature({
      sessions,
      transactions: persistence.transactions,
      identityVerifier: createFirebaseIdentityVerifier({
        projectId: process.env.FIREBASE_PROJECT_ID!,
        emulatorHost: process.env.APP_ENV === "local" ? process.env.FIREBASE_AUTH_EMULATOR_HOST : undefined,
      }),
    })),
    (transaction) => ({ representativeAppointments: new PrismaRepresentativeAppointmentRepository(transaction) }),
  );
}
