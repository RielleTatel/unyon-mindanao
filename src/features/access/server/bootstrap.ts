import "server-only";

import { z } from "zod";

const bootstrapInput = z.object({
  correlationId: z.string().min(1),
  email: z.string().trim().email().transform((email) => email.toLowerCase()),
  firebaseUid: z.string().trim().min(1),
  fullName: z.string().trim().min(1),
});

export interface SuperAdminBootstrapRepository {
  bootstrap(input: z.infer<typeof bootstrapInput>): Promise<{
    appointmentId: string;
    created: boolean;
    portalUserId: string;
  }>;
}

export function createSuperAdminBootstrap(
  repository: SuperAdminBootstrapRepository,
) {
  return async (input: z.input<typeof bootstrapInput>) =>
    repository.bootstrap(bootstrapInput.parse(input));
}
