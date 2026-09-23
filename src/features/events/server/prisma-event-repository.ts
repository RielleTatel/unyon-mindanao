import "server-only";

import { AccessError } from "@/features/access/server";
import type { Prisma } from "#unyon-prisma-client";
import type { EventLifecycleStatus, EventRecord } from "../contracts";
import type { EventRepository } from "./events";

type Transaction = Prisma.TransactionClient;

export class PrismaEventRepository implements EventRepository {
  constructor(private readonly transaction: Transaction) {}

  async list(input: {
    actorRoles: Array<{ role: string; universityId: string | null }>;
    includeArchived: boolean;
    upcomingOnly: boolean;
    asOf: Date;
    search: string;
  }) {
    const isSuperAdmin = input.actorRoles.some(({ role }) => role === "SUPER_ADMIN");
    const managedUniversityIds = input.actorRoles
      .filter(({ role, universityId }) => role === "UNIVERSITY_ADMIN" && universityId)
      .map(({ universityId }) => universityId as string);
    const privateVisibility = isSuperAdmin
      ? {}
      : {
          OR: [
            { status: "PUBLISHED" as const },
            { ownerUniversityId: { in: managedUniversityIds } },
          ],
        };
    const search = input.search
      ? {
          OR: [
            { title: { contains: input.search, mode: "insensitive" as const } },
            { description: { contains: input.search, mode: "insensitive" as const } },
            { category: { contains: input.search, mode: "insensitive" as const } },
            { location: { contains: input.search, mode: "insensitive" as const } },
          ],
        }
      : {};
    const records = await this.transaction.event.findMany({
      include: {
        coHosts: { include: { university: { select: { id: true, name: true } } } },
        ownerUniversity: { select: { name: true } },
      },
      orderBy: [{ startsAt: "asc" }, { title: "asc" }],
      where: {
        AND: [
          privateVisibility,
          search,
          ...(input.upcomingOnly ? [{ endsAt: { gte: input.asOf } }] : []),
        ],
        ...(input.includeArchived ? {} : { status: { not: "ARCHIVED" as const } }),
      },
    });

    return records.map(toEventRecord);
  }

  async get(id: string) {
    const record = await this.transaction.event.findUnique({
      include: {
        coHosts: { include: { university: { select: { id: true, name: true } } } },
        ownerUniversity: { select: { name: true } },
      },
      where: { id },
    });

    if (!record) return null;

    return {
      record: toEventRecord(record),
      subject: {
        endsAt: record.endsAt,
        id: record.id,
        kind: "Event" as const,
        ownerUniversityId: record.ownerUniversityId,
        startsAt: record.startsAt,
        status: record.status,
      },
    };
  }

  async activeUniversity(id: string) {
    return this.transaction.memberUniversity.findFirst({
      select: { id: true, name: true },
      where: { id, status: "ACTIVE" },
    });
  }

  async listActiveUniversities() {
    return this.transaction.memberUniversity.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
      where: { status: "ACTIVE" },
    });
  }

  async createDraft(input: {
    id: string;
    title: string;
    description: string;
    category: string;
    startsAt: Date;
    endsAt: Date;
    allDay: boolean;
    location: string | null;
    onlineUrl: string | null;
    contactPerson: string | null;
    ownerUniversityId: string | null;
    coHostUniversityIds: string[];
    createdByPortalUserId: string;
  }) {
    if (input.coHostUniversityIds.length) {
      const activeCount = await this.transaction.memberUniversity.count({
        where: {
          id: { in: input.coHostUniversityIds },
          status: "ACTIVE",
        },
      });

      if (activeCount !== input.coHostUniversityIds.length) {
        throw new AccessError("INVALID_INPUT", "Choose active Member Universities as co-hosts");
      }
    }

    try {
      const record = await this.transaction.event.create({
        data: {
          allDay: input.allDay,
          category: input.category,
          coHosts: {
            create: input.coHostUniversityIds.map((universityId) => ({ universityId })),
          },
          createdByPortalUserId: input.createdByPortalUserId,
          description: input.description,
          endsAt: input.endsAt,
          id: input.id,
          location: input.location,
          onlineUrl: input.onlineUrl,
          ownerUniversityId: input.ownerUniversityId,
          startsAt: input.startsAt,
          title: input.title,
        },
        include: {
          coHosts: { include: { university: { select: { id: true, name: true } } } },
          ownerUniversity: { select: { name: true } },
        },
      });

      return toEventRecord(record);
    } catch (error) {
      if (isUniqueConstraint(error)) {
        throw new AccessError("CONFLICT", "The event could not be created with those details");
      }

      throw error;
    }
  }

  async transition(input: {
    id: string;
    expectedVersion: number;
    from: EventLifecycleStatus;
    to: EventLifecycleStatus;
    occurredAt: Date;
  }) {
    const result = await this.transaction.event.updateMany({
      data: {
        archivedAt: input.to === "ARCHIVED" ? input.occurredAt : undefined,
        cancelledAt: input.to === "CANCELLED" ? input.occurredAt : undefined,
        completedAt: input.to === "COMPLETED" ? input.occurredAt : undefined,
        publishedAt: input.to === "PUBLISHED" ? input.occurredAt : undefined,
        status: input.to,
        version: { increment: 1 },
      },
      where: {
        id: input.id,
        status: input.from,
        version: input.expectedVersion,
      },
    });

    if (result.count !== 1) return null;
    return (await this.get(input.id))?.record ?? null;
  }

  async editDetails(input: Parameters<EventRepository["editDetails"]>[0]) {
    const { id, version, ...data } = input;
    const result = await this.transaction.event.updateMany({ where: { id, version, status: { in: ["DRAFT", "PUBLISHED"] } }, data: { ...data, version: { increment: 1 } } });
    return result.count === 1 ? (await this.get(id))?.record ?? null : null;
  }
}

function toEventRecord(record: {
  id: string;
  title: string;
  description: string;
  category: string;
  status: EventLifecycleStatus;
  startsAt: Date;
  endsAt: Date;
  allDay: boolean;
  location: string | null;
  onlineUrl: string | null;
  contactPerson: string | null;
  ownerUniversityId: string | null;
  ownerUniversity: { name: string } | null;
  coverObjectId: string | null;
  coHosts: Array<{ university: { id: string; name: string } }>;
  version: number;
  publishedAt: Date | null;
}): EventRecord {
  return {
    allDay: record.allDay,
    category: record.category,
    coHosts: record.coHosts.map(({ university }) => university),
    contactPerson: record.contactPerson,
    coverObjectId: record.coverObjectId,
    description: record.description,
    endsAt: record.endsAt.toISOString(),
    id: record.id,
    location: record.location,
    manageable: false,
    canComplete: false,
    onlineUrl: record.onlineUrl,
    ownerUniversityId: record.ownerUniversityId,
    ownerUniversityName: record.ownerUniversity?.name ?? "Unyon Mindanao",
    publishedAt: record.publishedAt?.toISOString() ?? null,
    startsAt: record.startsAt.toISOString(),
    status: record.status,
    title: record.title,
    version: record.version,
  };
}

function isUniqueConstraint(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
