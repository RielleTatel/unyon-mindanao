import "server-only";

import { withAccessRuntime } from "@/features/access/server";
import { createFirebaseIdentityVerifier } from "@/platform/firebase/identity-verifier";
import { createRepresentativeAppointmentFeature, type RepresentativeAppointmentRepository } from "./representative-appointments";
import { PrismaRepresentativeAppointmentRepository } from "./prisma-representative-appointment-repository";
import { D1RepresentativeAppointmentRepository } from "./d1-representative-appointment-repository";

export function withRepresentativeAppointmentFeature<Result>(work: (feature: ReturnType<typeof createRepresentativeAppointmentFeature>) => Promise<Result>) {
  if (process.env.PERSISTENCE_PROVIDER === "d1") {
    return import("@/features/access/server/d1-runtime").then(({ withD1AccessRuntime }) =>
      withD1AccessRuntime<{ representativeAppointments: RepresentativeAppointmentRepository }, Result>(
        (sessions, persistence) => work(createRepresentativeAppointmentFeature({
          sessions, transactions: persistence.transactions,
          identityVerifier: createFirebaseIdentityVerifier({
            projectId: process.env.FIREBASE_PROJECT_ID!,
            emulatorHost: process.env.APP_ENV === "local" ? process.env.FIREBASE_AUTH_EMULATOR_HOST : undefined,
          }),
        })),
        (transaction) => ({ representativeAppointments: new D1RepresentativeAppointmentRepository(transaction) }),
      ),
    );
  }
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
