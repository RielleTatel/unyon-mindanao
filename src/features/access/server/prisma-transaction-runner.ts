import "server-only";

import { redactAuditMetadata } from "./audit";
import type {
  PortalActor,
  ProtectedTransaction,
  TransactionRunner,
} from "./contracts";
import { AccessError, authenticationRequired } from "./errors";
import {
  type AccessTransaction,
  activeAppointmentsWhere,
  databaseNow,
  toPortalActor,
} from "./prisma-helpers";
import type { PrismaClient } from "@/platform/database/client";
import type { Prisma } from "#unyon-prisma-client";

export class PrismaTransactionRunner<
  Capabilities extends object = Record<string, never>,
> implements TransactionRunner<Capabilities> {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly createCapabilities: (
      transaction: AccessTransaction,
      occurredAt: Date,
    ) => Capabilities = () => ({}) as Capabilities,
  ) {}

  async run<Result>(
    input: { correlationId: string; tokenHash: string },
    work: (
      transaction: ProtectedTransaction<Capabilities>,
      actor: PortalActor,
    ) => Promise<Result>,
  ): Promise<Result> {
    let auditActorId: string | undefined;
    try {
      return await this.prisma.$transaction(async (transaction) => {
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
            tokenHash: input.tokenHash,
          },
        });

        auditActorId = session?.portalUserId;

        if (
          !session ||
          session.portalUser.status !== "ACTIVE" ||
          session.portalUser.appointments.length === 0
        ) {
          throw authenticationRequired();
        }

        const actor = toPortalActor(session.portalUser);

        return work(
          {
            capabilities: this.createCapabilities(transaction, occurredAt),
            occurredAt,
            appendAudit: async (record) => {
              await transaction.auditLog.create({
                data: {
                  ...record,
                  metadata: redactAuditMetadata(
                    record.metadata,
                  ) as Prisma.InputJsonValue,
                },
              });
            },
          },
          actor,
        );
      }, { isolationLevel: "Serializable" });
    } catch (error) {
      // Persist denial evidence after rollback; never include tokens or input data.
      if (auditActorId && error instanceof AccessError && (error.code === "NOT_FOUND_OR_FORBIDDEN" || error.code === "AUTHENTICATION_REQUIRED")) {
        await this.prisma.$transaction(async (transaction) => {
          await transaction.auditLog.create({ data: {
            action: "access.denied",
            actorPortalUserId: auditActorId,
            correlationId: input.correlationId,
            resourceType: "ProtectedOperation",
            resourceId: "access",
            metadata: { reason: error.code },
            occurredAt: await databaseNow(transaction),
          } });
        });
      }
      throw error;
    }
  }
}
