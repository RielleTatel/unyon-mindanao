import { describe, expect, it, vi } from "vitest";

import {
  AccessError,
  type AuditRecord,
  type PortalActor,
  type TransactionRunner,
} from "@/features/access/server";
import {
  createMemberUniversityFeature,
  type DirectoryCapabilities,
  type MemberUniversityRecord,
  type MemberUniversityRepository,
} from "@/features/directory/server";

const superAdmin: PortalActor = {
  appointments: [{ id: "appointment-1", role: "SUPER_ADMIN", universityId: null }],
  email: "admin@unyon.test",
  firebaseUid: "firebase-admin",
  portalUserId: "00000000-0000-4000-8000-000000000001",
};

const empty = (actor: PortalActor = superAdmin) => {
  const records = new Map<string, MemberUniversityRecord>();
  const auditRecords: AuditRecord[] = [];
  const repository: MemberUniversityRepository = {
    archive: vi.fn(async (id) => {
      const current = records.get(id);

      if (!current || current.status !== "ACTIVE") {
        return null;
      }

      const archived = { ...current, status: "ARCHIVED" as const };
      records.set(id, archived);
      return archived;
    }),
    create: vi.fn(async (input) => {
      const now = new Date("2026-09-21T00:00:00.000Z").toISOString();
      const record: MemberUniversityRecord = {
        ...input,
        createdAt: now,
        status: "ACTIVE",
        updatedAt: now,
      };
      records.set(input.id, record);
      return record;
    }),
    get: vi.fn(async (id) => records.get(id) ?? null),
    list: vi.fn(async (includeArchived) =>
      [...records.values()].filter(
        ({ status }) => includeArchived || status === "ACTIVE",
      ),
    ),
    restore: vi.fn(async (id) => {
      const current = records.get(id);

      if (!current || current.status !== "ARCHIVED") {
        return null;
      }

      const restored = { ...current, status: "ACTIVE" as const };
      records.set(id, restored);
      return restored;
    }),
    updateActive: vi.fn(async (id, input) => {
      const current = records.get(id);

      if (!current || current.status !== "ACTIVE") {
        return null;
      }

      const updated = { ...current, ...input };
      records.set(id, updated);
      return updated;
    }),
  };
  const transactions: TransactionRunner<DirectoryCapabilities> = {
    run: async (_input, work) =>
      work(
        {
          capabilities: { memberUniversities: repository },
          occurredAt: new Date("2026-09-21T00:00:00.000Z"),
          appendAudit: async (record) => {
            auditRecords.push(record);
          },
        },
        actor,
      ),
  };
  const feature = createMemberUniversityFeature({
    sessions: { hashSessionToken: async () => "token-hash" },
    transactions,
  });

  return { auditRecords, feature, records, repository };
};

function request(input: unknown) {
  return {
    correlationId: "request-1",
    input,
    sessionToken: "session-token",
  };
}

describe("Member University feature", () => {
  it("normalizes fields and returns an audit-safe purpose-built record", async () => {
    const { auditRecords, feature } = empty();
    const result = await feature.create(
      request({
        name: "  University   of Mindanao  ",
        slug: "The University of Mindanao!",
        description: "  A  member university.  ",
      }),
    );

    expect(result).toMatchObject({
      name: "University of Mindanao",
      slug: "the-university-of-mindanao",
      description: "A member university.",
      status: "ACTIVE",
    });
    expect(auditRecords).toEqual([
      expect.objectContaining({
        action: "member_university.created",
        metadata: {
          name: "University of Mindanao",
          slug: "the-university-of-mindanao",
        },
        resourceId: result.id,
        resourceType: "MemberUniversity",
      }),
    ]);
    expect(Object.keys(result).sort()).toEqual([
      "createdAt",
      "description",
      "id",
      "name",
      "slug",
      "status",
      "updatedAt",
    ]);
  });

  it("updates active details, archives, hides archived records from active choices, and restores", async () => {
    const { auditRecords, feature } = empty();
    const created = await feature.create(
      request({ name: "Davao University", description: "First profile" }),
    );

    const updated = await feature.update(
      request({
        id: created.id,
        name: "Davao Member University",
        slug: "davao-members",
        description: "Updated profile",
      }),
    );
    expect(updated.name).toBe("Davao Member University");
    expect(await feature.archive(request({ id: created.id }))).toMatchObject({
      status: "ARCHIVED",
    });
    await expect(feature.list(request({}))).resolves.toEqual([]);
    await expect(
      feature.get(request({ id: created.id })),
    ).resolves.toMatchObject({ status: "ARCHIVED" });
    await expect(
      feature.list(request({ includeArchived: true })),
    ).resolves.toMatchObject([{ id: created.id, status: "ARCHIVED" }]);
    await expect(feature.restore(request({ id: created.id }))).resolves.toMatchObject({
      status: "ACTIVE",
    });
    expect(auditRecords.map(({ action }) => action)).toEqual([
      "member_university.created",
      "member_university.updated",
      "member_university.archived",
      "member_university.restored",
    ]);
  });

  it("denies non-Super Admin reads and mutations with the same stable scope error", async () => {
    const representative: PortalActor = {
      ...superAdmin,
      appointments: [
        {
          id: "appointment-rep",
          role: "REPRESENTATIVE",
          universityId: "00000000-0000-4000-8000-000000000002",
        },
      ],
    };
    const { auditRecords, feature, repository } = empty(representative);

    await expect(feature.list(request({}))).rejects.toEqual(
      new AccessError("NOT_FOUND_OR_FORBIDDEN", "Not found or forbidden"),
    );
    await expect(
      feature.create(request({ name: "Unauthorized University" })),
    ).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    expect(repository.create).not.toHaveBeenCalled();
    expect(auditRecords).toHaveLength(0);
  });
});
