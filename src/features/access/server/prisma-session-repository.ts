import "server-only";

import type {
  SessionRepository,
  SessionStartRecord,
} from "./contracts";
import {
  activeAppointmentsWhere,
  databaseNow,
  toPortalActor,
} from "./prisma-helpers";
import type { PrismaClient } from "@/platform/database/client";

export class PrismaSessionRepository implements SessionRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async start({
    correlationId,
    identity,
    maximumLifetimeSeconds,
    tokenHash,
  }: Parameters<SessionRepository["start"]>[0]): Promise<SessionStartRecord | null> {
    return this.prisma.$transaction(async (transaction) => {
      const occurredAt = await databaseNow(transaction);
      const portalUser = await transaction.portalUser.findFirst({
        include: {
          appointments: { where: activeAppointmentsWhere(occurredAt) },
        },
        where: {
          email: identity.email.toLowerCase(),
          firebaseUid: identity.firebaseUid,
          status: "ACTIVE",
        },
      });

      if (!portalUser || portalUser.appointments.length === 0) {
        return null;
      }

      const expiresAt = new Date(
        occurredAt.getTime() + maximumLifetimeSeconds * 1000,
      );
      const session = await transaction.portalSession.create({
        data: {
          expiresAt,
          portalUserId: portalUser.id,
          tokenHash,
        },
      });

      await transaction.auditLog.create({
        data: {
          action: "session.started",
          actorPortalUserId: portalUser.id,
          correlationId,
          metadata: { expiresAt: expiresAt.toISOString() },
          occurredAt,
          resourceId: session.id,
          resourceType: "PortalSession",
        },
      });

      return { actor: toPortalActor(portalUser), expiresAt };
    });
  }

  async resolve({ tokenHash }: Parameters<SessionRepository["resolve"]>[0]) {
    return this.prisma.$transaction(async (transaction) => {
      const occurredAt = await databaseNow(transaction);
      const session = await transaction.portalSession.findFirst({
        include: {
          portalUser: {
            include: {
              appointments: { where: activeAppointmentsWhere(occurredAt) },
            },
          },
        },
        where: {
          expiresAt: { gt: occurredAt },
          revokedAt: null,
          tokenHash,
        },
      });

      if (
        !session ||
        session.portalUser.status !== "ACTIVE" ||
        session.portalUser.appointments.length === 0
      ) {
        return null;
      }

      return toPortalActor(session.portalUser);
    });
  }

  async end({
    correlationId,
    tokenHash,
  }: Parameters<SessionRepository["end"]>[0]) {
    await this.prisma.$transaction(async (transaction) => {
      const occurredAt = await databaseNow(transaction);
      const session = await transaction.portalSession.findUnique({
        where: { tokenHash },
      });

      if (!session || session.revokedAt) {
        return;
      }

      await transaction.portalSession.update({
        data: { revokedAt: occurredAt },
        where: { id: session.id },
      });
      await transaction.auditLog.create({
        data: {
          action: "session.ended",
          actorPortalUserId: session.portalUserId,
          correlationId,
          metadata: {},
          occurredAt,
          resourceId: session.id,
          resourceType: "PortalSession",
        },
      });
    });
  }
}
