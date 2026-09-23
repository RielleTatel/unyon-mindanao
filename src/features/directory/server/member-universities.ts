import "server-only";

import { z } from "zod";

import {
  AccessError,
  createProtectedOperationFactory,
  type PortalActor,
  type SessionService,
  type TransactionRunner,
} from "@/features/access/server";
import type { MemberUniversityRecord } from "../contracts";

export type { MemberUniversityRecord } from "../contracts";
export type { MemberUniversityStatus } from "../contracts";

export interface MemberUniversityRepository {
  list(includeArchived: boolean): Promise<MemberUniversityRecord[]>;
  get(id: string): Promise<MemberUniversityRecord | null>;
  create(input: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
  }): Promise<MemberUniversityRecord>;
  updateActive(
    id: string,
    input: { name: string; slug: string; description: string | null },
  ): Promise<MemberUniversityRecord | null>;
  archive(id: string): Promise<MemberUniversityRecord | null>;
  restore(id: string): Promise<MemberUniversityRecord | null>;
}

export interface DirectoryCapabilities {
  memberUniversities: MemberUniversityRepository;
}

type MemberUniversityIntent =
  | "member-university.list"
  | "member-university.read"
  | "member-university.create"
  | "member-university.update"
  | "member-university.archive"
  | "member-university.restore";

const nameSchema = z
  .string()
  .transform(normalizeName)
  .pipe(z.string().min(2).max(180));

const profileFieldsSchema = z.object({
  name: nameSchema,
  slug: z.string().trim().max(160).optional(),
  description: z.string().trim().max(1000).optional(),
});

const createSchema = profileFieldsSchema.transform((input, context) => {
  const slug = normalizeSlug(input.slug || input.name);

  if (slug.length === 0) {
    context.addIssue({ code: "custom", message: "A usable slug is required" });
    return z.NEVER;
  }

  return {
    description: normalizeDescription(input.description),
    id: crypto.randomUUID(),
    name: input.name,
    slug,
  };
});

const updateSchema = profileFieldsSchema.extend({
  id: z.string().uuid(),
}).transform((input, context) => {
  const slug = normalizeSlug(input.slug || input.name);

  if (slug.length === 0) {
    context.addIssue({ code: "custom", message: "A usable slug is required" });
    return z.NEVER;
  }

  return {
    description: normalizeDescription(input.description),
    id: input.id,
    name: input.name,
    slug,
  };
});

const idSchema = z.object({ id: z.string().uuid() });
const listSchema = z.object({ includeArchived: z.boolean().default(false) });

export function createMemberUniversityFeature(dependencies: {
  sessions: Pick<SessionService, "hashSessionToken">;
  transactions: TransactionRunner<DirectoryCapabilities>;
}) {
  const factory = createProtectedOperationFactory<DirectoryCapabilities>(
    dependencies,
  );
  const authorize = ({ actor, intent }: {
    actor: PortalActor;
    intent: MemberUniversityIntent;
  }) => canManageMemberUniversity(actor, intent);

  const list = factory.query({
    intent: "member-university.list",
    input: listSchema,
    resolveSubject: async () => ({
      id: "all",
      kind: "MemberUniversityDirectory",
    }),
    authorize,
    execute: ({ transaction }, input) =>
      transaction.capabilities.memberUniversities.list(input.includeArchived),
  });

  const get = factory.query({
    intent: "member-university.read",
    input: idSchema,
    resolveSubject: async ({ transaction }, input) =>
      (await transaction.capabilities.memberUniversities.get(input.id))
        ? { id: input.id, kind: "MemberUniversity" }
        : null,
    authorize,
    execute: ({ transaction, subject }) =>
      transaction.capabilities.memberUniversities.get(subject.id),
  });

  const create = factory.mutation({
    action: "member_university.created",
    intent: "member-university.create",
    input: createSchema,
    resolveSubject: async (_context, input) => ({
      id: input.id,
      kind: "MemberUniversity",
    }),
    authorize,
    execute: ({ transaction }, input) =>
      transaction.capabilities.memberUniversities.create(input),
    auditMetadata: (result) => ({ name: result.name, slug: result.slug }),
  });

  const update = factory.mutation({
    action: "member_university.updated",
    intent: "member-university.update",
    input: updateSchema,
    resolveSubject: async ({ transaction }, input) => {
      const current = await transaction.capabilities.memberUniversities.get(
        input.id,
      );

      return current?.status === "ACTIVE"
        ? { id: input.id, kind: "MemberUniversity" }
        : null;
    },
    authorize,
    execute: async ({ transaction, subject }, input) => {
      const updated = await transaction.capabilities.memberUniversities.updateActive(
        subject.id,
        input,
      );

      if (!updated) {
        throw forbiddenOrNotFound();
      }

      return updated;
    },
    auditMetadata: (result) => ({ name: result.name, slug: result.slug }),
  });

  const archive = factory.mutation({
    action: "member_university.archived",
    intent: "member-university.archive",
    input: idSchema,
    resolveSubject: async ({ transaction }, input) => {
      const current = await transaction.capabilities.memberUniversities.get(
        input.id,
      );

      return current?.status === "ACTIVE"
        ? { id: input.id, kind: "MemberUniversity" }
        : null;
    },
    authorize,
    execute: async ({ transaction, subject }) => {
      const archived = await transaction.capabilities.memberUniversities.archive(
        subject.id,
      );

      if (!archived) {
        throw forbiddenOrNotFound();
      }

      return archived;
    },
    auditMetadata: (result) => ({ name: result.name, slug: result.slug }),
  });

  const restore = factory.mutation({
    action: "member_university.restored",
    intent: "member-university.restore",
    input: idSchema,
    resolveSubject: async ({ transaction }, input) => {
      const current = await transaction.capabilities.memberUniversities.get(
        input.id,
      );

      return current?.status === "ARCHIVED"
        ? { id: input.id, kind: "MemberUniversity" }
        : null;
    },
    authorize,
    execute: async ({ transaction, subject }) => {
      const restored = await transaction.capabilities.memberUniversities.restore(
        subject.id,
      );

      if (!restored) {
        throw forbiddenOrNotFound();
      }

      return restored;
    },
    auditMetadata: (result) => ({ name: result.name, slug: result.slug }),
  });

  return { archive, create, get, list, restore, update };
}

function normalizeName(value: string) {
  return value.normalize("NFKC").trim().replaceAll(/\s+/gu, " ");
}

function normalizeSlug(value: string) {
  return normalizeName(value)
    .normalize("NFKD")
    .replaceAll(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/gu, "-")
    .replaceAll(/^-|-$/gu, "");
}

function normalizeDescription(value: string | undefined) {
  const normalized = value?.normalize("NFKC").trim().replaceAll(/\s+/gu, " ");
  return normalized || null;
}

function forbiddenOrNotFound() {
  return new AccessError(
    "NOT_FOUND_OR_FORBIDDEN",
    "Not found or forbidden",
  );
}

function canManageMemberUniversity(
  actor: PortalActor,
  intent: MemberUniversityIntent,
) {
  switch (intent) {
    case "member-university.list":
    case "member-university.read":
    case "member-university.create":
    case "member-university.update":
    case "member-university.archive":
    case "member-university.restore":
      return actor.appointments.some(({ role }) => role === "SUPER_ADMIN");
    default:
      return assertNever(intent);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unsupported Member University intent: ${String(value)}`);
}
