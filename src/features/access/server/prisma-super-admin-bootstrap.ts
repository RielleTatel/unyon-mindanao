import "server-only";

import type { SuperAdminBootstrapRepository } from "./bootstrap";
import { activeAppointmentsWhere, databaseNow } from "./prisma-helpers";
import type { PrismaClient } from "@/platform/database/client";

export class PrismaSuperAdminBootstrapRepository
  implements SuperAdminBootstrapRepository
{
  constructor(private readonly prisma: PrismaClient) {}

  async bootstrap(
    input: Parameters<SuperAdminBootstrapRepository["bootstrap"]>[0],
  ) {
    return this.prisma.$transaction(async (transaction) => {
      const occurredAt = await databaseNow(transaction);
      const [byUid, byEmail] = await Promise.all([
        transaction.portalUser.findUnique({
          where: { firebaseUid: input.firebaseUid },
        }),
        transaction.portalUser.findUnique({ where: { email: input.email } }),
      ]);

      if (
        (byUid && byUid.email !== input.email) ||
        (byEmail && byEmail.firebaseUid !== input.firebaseUid)
      ) {
        throw new Error("Bootstrap identity conflicts with an existing user");
      }

      let created = !byUid;
      const portalUser = byUid
        ? await transaction.portalUser.update({
            data: { fullName: input.fullName, status: "ACTIVE" },
            where: { id: byUid.id },
          })
        : await transaction.portalUser.create({
            data: {
              email: input.email,
              firebaseUid: input.firebaseUid,
              fullName: input.fullName,
            },
          });
      let appointment = await transaction.appointment.findFirst({
        where: {
          ...activeAppointmentsWhere(occurredAt),
          portalUserId: portalUser.id,
          role: "SUPER_ADMIN",
          universityId: null,
        },
      });

      if (!appointment) {
        const scheduledAppointment = await transaction.appointment.findFirst({
          where: {
            portalUserId: portalUser.id,
            role: "SUPER_ADMIN",
            startsAt: { gt: occurredAt },
            universityId: null,
          },
        });

        if (scheduledAppointment) {
          throw new Error(
            "Bootstrap conflicts with a scheduled Super Admin appointment",
          );
        }

        created = true;
        appointment = await transaction.appointment.create({
          data: {
            portalUserId: portalUser.id,
            role: "SUPER_ADMIN",
            startsAt: occurredAt,
          },
        });
      }

      await transaction.auditLog.create({
        data: {
          action: created ? "super_admin.bootstrapped" : "super_admin.confirmed",
          actorPortalUserId: portalUser.id,
          correlationId: input.correlationId,
          metadata: { created },
          occurredAt,
          resourceId: appointment.id,
          resourceType: "Appointment",
        },
      });

      return {
        appointmentId: appointment.id,
        created,
        portalUserId: portalUser.id,
      };
    });
  }
}
