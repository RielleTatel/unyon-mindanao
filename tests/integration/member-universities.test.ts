import { randomUUID } from "node:crypto";

import { config } from "dotenv";
import { afterAll, describe, expect, it } from "vitest";

import { createAccessPersistence } from "@/features/access/server";
import {
  createMemberUniversityFeature,
} from "@/features/directory/server";
import { PrismaMemberUniversityRepository } from "@/features/directory/server/prisma-member-university-repository";
import { createPrismaClient } from "@/platform/database/client";

config({ path: ".env.local" });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

if (!testDatabaseUrl || !new URL(testDatabaseUrl).pathname.endsWith("_test")) {
  throw new Error(
    "TEST_DATABASE_URL must point to a dedicated database ending in _test",
  );
}

const prisma = createPrismaClient(testDatabaseUrl);

describe("Member University persistence", () => {
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("enforces normalized uniqueness and audits create, update, archive, and restore", async () => {
    const feature = await createFeature("SUPER_ADMIN");
    const correlationIds: string[] = [];
    const call = (input: unknown) => {
      const correlationId = randomUUID();
      correlationIds.push(correlationId);
      return { correlationId, input, sessionToken: "raw-session-token" };
    };
    const created = await feature.create(
      call({
        name: "  North   Valley University  ",
        slug: "North Valley",
        description: "  First   description  ",
      }),
    );

    expect(created).toMatchObject({
      name: "North Valley University",
      slug: "north-valley",
      description: "First description",
      status: "ACTIVE",
    });
    await expect(
      feature.create(
        call({ name: "North Valley University", slug: "different-slug" }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      feature.create(
        call({ name: "Another University", slug: "north-valley" }),
      ),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const updated = await feature.update(
      call({
        id: created.id,
        name: "North Valley Member University",
        slug: "north-valley-members",
        description: "Updated directory profile",
      }),
    );
    expect(updated.name).toBe("North Valley Member University");
    await expect(feature.archive(call({ id: created.id }))).resolves.toMatchObject({
      status: "ARCHIVED",
    });
    await expect(feature.list(call({}))).resolves.not.toEqual(expect.arrayContaining([expect.objectContaining({ id: created.id })]));
    const detail = await feature.get(call({ id: created.id }));
    expect(detail).toMatchObject({
      id: created.id,
      name: "North Valley Member University",
      status: "ARCHIVED",
    });
    expect(Object.keys(detail ?? {}).sort()).toEqual([
      "createdAt",
      "description",
      "id",
      "name",
      "slug",
      "status",
      "updatedAt",
    ]);
    await expect(
      feature.list(call({ includeArchived: true })),
    ).resolves.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id, status: "ARCHIVED" })]),
    );
    await expect(feature.restore(call({ id: created.id }))).resolves.toMatchObject({
      status: "ACTIVE",
    });

    const auditRows = await prisma.auditLog.findMany({
      orderBy: { occurredAt: "asc" },
      where: { correlationId: { in: correlationIds }, resourceId: created.id },
    });
    expect(auditRows.map(({ action }) => action)).toEqual([
      "member_university.created",
      "member_university.updated",
      "member_university.archived",
      "member_university.restored",
    ]);
    expect(auditRows.every(({ resourceType }) => resourceType === "MemberUniversity")).toBe(
      true,
    );
    expect(auditRows[0]?.metadata).toEqual({
      name: "North Valley University",
      slug: "north-valley",
    });
    expect(
      await prisma.memberUniversity.findUniqueOrThrow({
        where: { id: created.id },
      }),
    ).toMatchObject({ status: "ACTIVE", name: "North Valley Member University" });
  });

  it("denies a University Admin from listing or mutating Confederation directory entries", async () => {
    const university = await prisma.memberUniversity.create({
      data: {
        name: `Scoped University ${randomUUID()}`,
        slug: `scoped-${randomUUID()}`,
      },
    });
    const feature = await createFeature("UNIVERSITY_ADMIN", university.id);
    const target = await prisma.memberUniversity.create({
      data: {
        name: `Target University ${randomUUID()}`,
        slug: `target-${randomUUID()}`,
      },
    });

    await expect(
      feature.list({
        correlationId: randomUUID(),
        input: {},
        sessionToken: "raw-session-token",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    await expect(
      feature.create({
        correlationId: randomUUID(),
        input: { name: `Unauthorized ${randomUUID()}` },
        sessionToken: "raw-session-token",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    await expect(
      feature.update({
        correlationId: randomUUID(),
        input: {
          id: target.id,
          name: "Modified by University Admin",
          slug: `modified-${randomUUID()}`,
        },
        sessionToken: "raw-session-token",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    await expect(
      feature.archive({
        correlationId: randomUUID(),
        input: { id: target.id },
        sessionToken: "raw-session-token",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });

    await prisma.memberUniversity.update({
      data: { status: "ARCHIVED" },
      where: { id: target.id },
    });
    await expect(
      feature.restore({
        correlationId: randomUUID(),
        input: { id: target.id },
        sessionToken: "raw-session-token",
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });

    await expect(
      prisma.memberUniversity.findUniqueOrThrow({
        where: { id: target.id },
      }),
    ).resolves.toMatchObject({ status: "ARCHIVED" });
    await expect(
      prisma.auditLog.count({
        where: {
          action: {
            in: [
              "member_university.created",
              "member_university.updated",
              "member_university.archived",
              "member_university.restored",
            ],
          },
          resourceId: target.id,
        },
      }),
    ).resolves.toBe(0);
  });
});

async function createFeature(
  role: "SUPER_ADMIN" | "UNIVERSITY_ADMIN",
  universityId: string | null = null,
) {
  const [{ now }] = await prisma.$queryRaw<Array<{ now: Date }>>`
    SELECT CURRENT_TIMESTAMP AS "now"
  `;
  const user = await prisma.portalUser.create({
    data: {
      email: `${randomUUID()}@unyon.test`,
      firebaseUid: `firebase-${randomUUID()}`,
      fullName: "Directory Test Actor",
    },
  });
  await prisma.appointment.create({
    data: {
      portalUserId: user.id,
      role,
      startsAt: new Date(now.getTime() - 60_000),
      universityId: role === "SUPER_ADMIN" ? null : universityId,
    },
  });

  const tokenHash = `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "")}`;
  await prisma.portalSession.create({
    data: {
      expiresAt: new Date(now.getTime() + 60 * 60 * 1000),
      portalUserId: user.id,
      tokenHash,
    },
  });

  const transactions = createAccessPersistence(
    prisma,
    (transaction) => ({
      memberUniversities: new PrismaMemberUniversityRepository(transaction),
    }),
  ).transactions;

  return createMemberUniversityFeature({
    sessions: { hashSessionToken: async () => tokenHash },
    transactions,
  });
}
