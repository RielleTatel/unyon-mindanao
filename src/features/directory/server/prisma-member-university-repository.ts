import "server-only";

import { AccessError } from "@/features/access/server";
import type { Prisma } from "#unyon-prisma-client";
import type {
  MemberUniversityRecord,
  MemberUniversityRepository,
} from "./member-universities";

type Transaction = Prisma.TransactionClient;

export class PrismaMemberUniversityRepository
  implements MemberUniversityRepository
{
  constructor(private readonly transaction: Transaction) {}

  async list(includeArchived: boolean) {
    const records = await this.transaction.memberUniversity.findMany({
      orderBy: [{ status: "asc" }, { name: "asc" }],
      where: includeArchived ? {} : { status: "ACTIVE" },
    });

    return records.map(toMemberUniversityRecord);
  }

  async get(id: string) {
    const record = await this.transaction.memberUniversity.findUnique({
      where: { id },
    });

    return record ? toMemberUniversityRecord(record) : null;
  }

  async create(input: {
    id: string;
    name: string;
    slug: string;
    description: string | null;
  }) {
    try {
      const record = await this.transaction.memberUniversity.create({
        data: input,
      });

      return toMemberUniversityRecord(record);
    } catch (error) {
      throw mapUniqueConstraint(error);
    }
  }

  async updateActive(
    id: string,
    input: { name: string; slug: string; description: string | null },
  ) {
    try {
      const result = await this.transaction.memberUniversity.updateMany({
        data: input,
        where: { id, status: "ACTIVE" },
      });

      if (result.count === 0) {
        return null;
      }

      return this.get(id);
    } catch (error) {
      throw mapUniqueConstraint(error);
    }
  }

  async archive(id: string) {
    const result = await this.transaction.memberUniversity.updateMany({
      data: { status: "ARCHIVED" },
      where: { id, status: "ACTIVE" },
    });

    return result.count === 0 ? null : this.get(id);
  }

  async restore(id: string) {
    const result = await this.transaction.memberUniversity.updateMany({
      data: { status: "ACTIVE" },
      where: { id, status: "ARCHIVED" },
    });

    return result.count === 0 ? null : this.get(id);
  }
}

function toMemberUniversityRecord(record: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: Date;
  updatedAt: Date;
}): MemberUniversityRecord {
  return {
    createdAt: record.createdAt.toISOString(),
    description: record.description,
    id: record.id,
    name: record.name,
    slug: record.slug,
    status: record.status,
    updatedAt: record.updatedAt.toISOString(),
  };
}

function mapUniqueConstraint(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "P2002"
  ) {
    return new AccessError(
      "CONFLICT",
      "A Member University with that name or slug already exists",
    );
  }

  return error;
}
