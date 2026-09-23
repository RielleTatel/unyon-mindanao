import "server-only";

import { z } from "zod";

import { redactAuditMetadata } from "./audit";
import type {
  PortalActor,
  ProtectedTransaction,
  ResourceSubject,
  TransactionRunner,
} from "./contracts";
import { AccessError, operationFailed } from "./errors";
import type { SessionService } from "./session-service";

interface OperationContext<
  Subject extends ResourceSubject,
  Capabilities extends object,
> {
  actor: PortalActor;
  occurredAt: Date;
  subject: Subject;
  transaction: ProtectedTransaction<Capabilities>;
}

interface SubjectContext<Capabilities extends object> {
  actor: PortalActor;
  occurredAt: Date;
  transaction: ProtectedTransaction<Capabilities>;
}

export function createProtectedOperationFactory<
  Capabilities extends object = Record<string, never>,
>(dependencies: {
  sessions: Pick<SessionService, "hashSessionToken">;
  transactions: TransactionRunner<Capabilities>;
}) {
  return {
    query<
      Input,
      Subject extends ResourceSubject,
      Result,
      Intent extends string,
    >(definition: {
      intent: Intent;
      input: z.ZodType<Input>;
      resolveSubject(
        context: SubjectContext<Capabilities>,
        input: Input,
      ): Promise<Subject | null>;
      authorize(context: {
        actor: PortalActor;
        intent: Intent;
        subject: Subject;
      }): boolean | Promise<boolean>;
      execute(
        context: OperationContext<Subject, Capabilities>,
        input: Input,
      ): Promise<Result>;
    }) {
      return async (request: {
        correlationId: string;
        input: unknown;
        sessionToken: string;
      }): Promise<Result> => {
        const parsed = definition.input.safeParse(request.input);

        if (!parsed.success) {
          throw new AccessError("INVALID_INPUT", "Invalid input");
        }

        try {
          const tokenHash = await dependencies.sessions.hashSessionToken(
            request.sessionToken,
          );

          return await dependencies.transactions.run(
            { correlationId: request.correlationId, tokenHash },
            async (transaction, actor) => {
              const subject = await definition.resolveSubject(
                {
                  actor,
                  occurredAt: transaction.occurredAt,
                  transaction,
                },
                parsed.data,
              );
              const authorized =
                subject &&
                (await definition.authorize({
                  actor,
                  intent: definition.intent,
                  subject,
                }));

              if (!subject || !authorized) {
                throw new AccessError(
                  "NOT_FOUND_OR_FORBIDDEN",
                  "Not found or forbidden",
                );
              }

              return definition.execute(
                {
                  actor,
                  occurredAt: transaction.occurredAt,
                  subject,
                  transaction,
                },
                parsed.data,
              );
            },
          );
        } catch (error) {
          if (error instanceof AccessError) {
            throw error;
          }

          throw operationFailed();
        }
      };
    },
    mutation<
      Input,
      Subject extends ResourceSubject,
      Result,
      Intent extends string,
    >(definition: {
      action: string;
      intent: Intent;
      input: z.ZodType<Input>;
      resolveSubject(
        context: SubjectContext<Capabilities>,
        input: Input,
      ): Promise<Subject | null>;
      authorize(context: {
        actor: PortalActor;
        intent: Intent;
        subject: Subject;
      }): boolean | Promise<boolean>;
      execute(
        context: OperationContext<Subject, Capabilities>,
        input: Input,
      ): Promise<Result>;
      auditMetadata?(
        result: Result,
        input: Input,
      ): Readonly<Record<string, unknown>>;
    }) {
      return async (request: {
        correlationId: string;
        input: unknown;
        sessionToken: string;
      }): Promise<Result> => {
        const parsed = definition.input.safeParse(request.input);

        if (!parsed.success) {
          throw new AccessError("INVALID_INPUT", "Invalid input");
        }

        try {
          const tokenHash = await dependencies.sessions.hashSessionToken(
            request.sessionToken,
          );

          return await dependencies.transactions.run(
            { correlationId: request.correlationId, tokenHash },
            async (transaction, actor) => {
              const subject = await definition.resolveSubject(
                {
                  actor,
                  occurredAt: transaction.occurredAt,
                  transaction,
                },
                parsed.data,
              );
              const authorized =
                subject &&
                (await definition.authorize({
                  actor,
                  intent: definition.intent,
                  subject,
                }));

              if (!subject || !authorized) {
                throw new AccessError(
                  "NOT_FOUND_OR_FORBIDDEN",
                  "Not found or forbidden",
                );
              }

              const result = await definition.execute(
                {
                  actor,
                  occurredAt: transaction.occurredAt,
                  subject,
                  transaction,
                },
                parsed.data,
              );

              await transaction.appendAudit({
                action: definition.action,
                actorPortalUserId: actor.portalUserId,
                correlationId: request.correlationId,
                metadata: redactAuditMetadata(
                  definition.auditMetadata?.(result, parsed.data) ?? {},
                ),
                occurredAt: transaction.occurredAt,
                resourceId: subject.id,
                resourceType: subject.kind,
              });

              return result;
            },
          );
        } catch (error) {
          if (error instanceof AccessError) {
            throw error;
          }

          throw operationFailed();
        }
      };
    },
  };
}
