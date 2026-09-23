import "server-only";

import {
  createAccessPersistence,
  createSessionService,
  type AccessPersistence,
  type IdentityVerifier,
} from "@/features/access/server";
import { createPrismaClient } from "@/platform/database/client";
import {
  acceptUniversityAdminInvitation,
  PrismaUniversityAdminInvitationRepository,
  previewUniversityAdminInvitation,
} from "./prisma-university-admin-invitation-repository";
import { createFirebaseIdentityVerifier } from "@/platform/firebase/identity-verifier";
import { webCryptoSessionTokens } from "@/platform/crypto/session-tokens";
import { createResendInvitationDelivery } from "@/platform/email/resend-invitation-delivery";
import { createUniversityAdminInvitationFeature } from "./university-admin-invitations";

export async function withUniversityAdminInvitationFeature<Result>(
  work: (
    feature: ReturnType<typeof createUniversityAdminInvitationFeature>,
  ) => Promise<Result>,
) {
  const projectId = process.env.FIREBASE_PROJECT_ID;

  if (!projectId) {
    throw new Error("FIREBASE_PROJECT_ID is required");
  }

  const prisma = createPrismaClient();
  const identityVerifier: IdentityVerifier = createFirebaseIdentityVerifier({
    emulatorHost:
      process.env.APP_ENV === "local"
        ? process.env.FIREBASE_AUTH_EMULATOR_HOST
        : undefined,
    projectId,
  });
  const persistence: AccessPersistence<{
    universityAdminInvitations: PrismaUniversityAdminInvitationRepository;
  }> = createAccessPersistence(prisma, (transaction) => ({
    universityAdminInvitations: new PrismaUniversityAdminInvitationRepository(transaction),
  }));
  const sessions = createSessionService({
    identityVerifier,
    repository: persistence.sessions,
    tokens: webCryptoSessionTokens,
  });
  const feature = createUniversityAdminInvitationFeature({
    acceptance: {
      accept: (input) => acceptUniversityAdminInvitation(prisma, input),
      preview: (tokenHash) => previewUniversityAdminInvitation(prisma, tokenHash),
    },
    appOrigin:
      process.env.NEXT_PUBLIC_APP_ORIGIN ?? "http://localhost:3000",
    delivery: createResendInvitationDelivery({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.INVITATION_FROM_EMAIL,
    }),
    identityVerifier,
    sessions,
    tokens: webCryptoSessionTokens,
    transactions: persistence.transactions,
  });

  try {
    return await work(feature);
  } finally {
    await prisma.$disconnect();
  }
}
