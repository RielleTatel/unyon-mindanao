import "server-only";

import type { PortalActor } from "./contracts";
import type { Prisma } from "#unyon-prisma-client";

export type AccessTransaction = Prisma.TransactionClient;

export async function databaseNow(transaction: AccessTransaction) {
  const [row] = await transaction.$queryRaw<Array<{ now: Date }>>`
    SELECT CURRENT_TIMESTAMP AS "now"
  `;

  if (!row) {
    throw new Error("Database time unavailable");
  }

  return row.now;
}

export const activeAppointmentsWhere = (occurredAt: Date) => ({
  startsAt: { lte: occurredAt },
  OR: [{ endsAt: null }, { endsAt: { gt: occurredAt } }],
});

export function toPortalActor(user: {
  id: string;
  firebaseUid: string;
  email: string;
  appointments: Array<{
    id: string;
    role: "SUPER_ADMIN" | "UNIVERSITY_ADMIN" | "REPRESENTATIVE";
    universityId: string | null;
  }>;
}): PortalActor {
  return {
    appointments: user.appointments.map((appointment) => ({
      id: appointment.id,
      role: appointment.role,
      universityId: appointment.universityId,
    })),
    email: user.email,
    firebaseUid: user.firebaseUid,
    portalUserId: user.id,
  };
}
