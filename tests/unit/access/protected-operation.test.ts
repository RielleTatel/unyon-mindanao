import { z } from "zod";
import { describe, expect, it, vi } from "vitest";

import {
  AccessError,
  createProtectedOperationFactory,
  type PortalActor,
} from "@/features/access/server";

const actor: PortalActor = {
  portalUserId: "user-1",
  firebaseUid: "firebase-1",
  email: "admin@unyon.test",
  appointments: [
    {
      id: "appointment-1",
      role: "SUPER_ADMIN",
      universityId: null,
    },
  ],
};

describe("protected operation", () => {
  it("parses, authenticates, authorizes, executes, audits, and commits in order", async () => {
    const order: string[] = [];
    const appendAudit = vi.fn(async () => {
      order.push("audit");
    });
    const factory = createProtectedOperationFactory({
      sessions: {
        hashSessionToken: vi.fn(async () => {
          order.push("session-hash");
          return "token-hash";
        }),
      },
      transactions: {
        run: async (_input, work) => {
          order.push("transaction");
          order.push("identity");
          const result = await work({
            appendAudit,
            capabilities: {},
            occurredAt: new Date("2026-09-16T00:00:00.000Z"),
          }, actor);
          order.push("commit");
          return result;
        },
      },
    });
    const operation = factory.mutation({
      action: "portal.test",
      intent: "portal.test",
      input: z.object({
        value: z.string().transform((value) => {
          order.push("parse");
          return value;
        }),
      }),
      resolveSubject: async () => {
        order.push("subject");
        return { kind: "Portal", id: "portal" } as const;
      },
      authorize: () => {
        order.push("authorize");
        return true;
      },
      execute: async (_context, input) => {
        order.push("execute");
        return { value: input.value };
      },
      auditMetadata: () => ({ status: "ok" }),
    });

    await expect(
      operation({
        correlationId: "request-1",
        input: { value: "accepted" },
        sessionToken: "session-token",
      }),
    ).resolves.toEqual({ value: "accepted" });
    expect(order).toEqual([
      "parse",
      "session-hash",
      "transaction",
      "identity",
      "subject",
      "authorize",
      "execute",
      "audit",
      "commit",
    ]);
    expect(appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "portal.test",
        actorPortalUserId: "user-1",
        correlationId: "request-1",
        metadata: { status: "ok" },
      }),
    );
  });

  it.each([null, { kind: "Portal", id: "portal" }])(
    "returns the same public error for missing and forbidden subjects",
    async (subject) => {
      const factory = createProtectedOperationFactory({
        sessions: { hashSessionToken: vi.fn(async () => "token-hash") },
        transactions: {
          run: async (_input, work) =>
            work({
              appendAudit: vi.fn(),
              capabilities: {},
              occurredAt: new Date("2026-09-16T00:00:00.000Z"),
            }, actor),
        },
      });
      const execute = vi.fn();
      const operation = factory.mutation({
        action: "portal.test",
        intent: "portal.test",
        input: z.object({}),
        resolveSubject: async () => subject,
        authorize: () => false,
        execute,
      });

      await expect(
        operation({
          correlationId: "request-2",
          input: {},
          sessionToken: "session-token",
        }),
      ).rejects.toEqual(
        new AccessError("NOT_FOUND_OR_FORBIDDEN", "Not found or forbidden"),
      );
      expect(execute).not.toHaveBeenCalled();
    },
  );

  it("redacts sensitive audit metadata and hides dependency failures", async () => {
    const appendAudit = vi.fn();
    const factory = createProtectedOperationFactory({
      sessions: { hashSessionToken: vi.fn(async () => "token-hash") },
      transactions: {
        run: async (_input, work) =>
          work({
            appendAudit,
            capabilities: {},
            occurredAt: new Date("2026-09-16T00:00:00.000Z"),
          }, actor),
      },
    });
    const operation = factory.mutation({
      action: "portal.test",
      intent: "portal.test",
      input: z.object({}),
      resolveSubject: async () => ({ kind: "Portal", id: "portal" }),
      authorize: () => true,
      execute: async () => ({ ok: true }),
      auditMetadata: () => ({
        token: "secret",
        password: "secret",
        birthDate: "2000-01-01",
        dateOfBirth: "2000-01-01",
        nested: { dob: "2000-01-01", visible: true },
        evaluationComment: "private",
        signedUrl: "https://private.test",
        safe: "visible",
      }),
    });

    await operation({
      correlationId: "request-3",
      input: {},
      sessionToken: "session-token",
    });
    expect(appendAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        metadata: { nested: { visible: true }, safe: "visible" },
      }),
    );

    const failing = factory.mutation({
      action: "portal.fail",
      intent: "portal.fail",
      input: z.object({}),
      resolveSubject: async () => {
        throw new Error("postgres password leaked by driver");
      },
      authorize: () => true,
      execute: vi.fn(),
    });

    await expect(
      failing({
        correlationId: "request-4",
        input: {},
        sessionToken: "session-token",
      }),
    ).rejects.toEqual(
      new AccessError("OPERATION_FAILED", "The operation could not be completed"),
    );
  });
});
