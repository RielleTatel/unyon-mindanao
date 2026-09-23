import "server-only";

import type { Prisma } from "#unyon-prisma-client";
import { AccessError } from "@/features/access/server";
import type { FilePurpose } from "../contracts";
import type { PrivateFileRepository, StoredFile } from "./private-files";

export class PrismaPrivateFileRepository implements PrivateFileRepository {
  constructor(private readonly transaction: Prisma.TransactionClient) {}
  async subject(purpose: FilePurpose, id: string, now: Date) {
    if (purpose === "PROFILE_IMAGE") {
      const user = await this.transaction.portalUser.findUnique({ where: { id }, select: { status: true, profileObjectId: true, appointments: { where: { startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] }, select: { id: true } } } });
      return user ? { purpose, resourceId: id, objectId: user.profileObjectId, ownerUniversityId: null, status: user.status, activeProfile: user.status === "ACTIVE" && user.appointments.length > 0 } : null;
    }
    if (purpose === "EVENT_COVER") {
      const event = await this.transaction.event.findUnique({ where: { id }, select: { coverObjectId: true, ownerUniversityId: true, status: true } });
      return event ? { purpose, resourceId: id, objectId: event.coverObjectId, ownerUniversityId: event.ownerUniversityId, status: event.status, activeProfile: false } : null;
    }
    const revision = await this.transaction.financialReportRevision.findUnique({ where: { id }, select: { objectId: true, status: true } });
    return revision ? { purpose, resourceId: id, objectId: revision.objectId, ownerUniversityId: null, status: revision.status, activeProfile: false } : null;
  }
  async get(id: string) {
    // Hold the row across external upload/commit operations so cleanup cannot
    // remove an object while its pending upload is still writing.
    await this.transaction.$queryRaw`SELECT id FROM stored_objects WHERE id = ${id}::uuid FOR UPDATE`;
    return this.transaction.storedObject.findUnique({ where: { id } });
  }
  async reserve(input: StoredFile) { await this.transaction.storedObject.create({ data: input }); }
  async pendingCount(uploaderId: string, now: Date) { return this.transaction.storedObject.count({ where: { uploaderId, status: "PENDING", expiresAt: { gt: now } } }); }
  async commit(object: StoredFile, sha256: string) {
    const changed = await this.transaction.storedObject.updateMany({ where: { id: object.id, status: "PENDING" }, data: { status: "AVAILABLE", sha256 } });
    if (changed.count !== 1) throw new AccessError("CONFLICT", "Upload changed");
    if (object.purpose === "PROFILE_IMAGE") await this.transaction.portalUser.update({ where: { id: object.resourceId }, data: { profileObjectId: object.id } });
    else if (object.purpose === "EVENT_COVER") await this.transaction.event.update({ where: { id: object.resourceId }, data: { coverObjectId: object.id, version: { increment: 1 } } });
    else {
      const revision = await this.transaction.financialReportRevision.updateMany({ where: { id: object.resourceId, status: "DRAFT" }, data: { objectId: object.id } });
      if (revision.count !== 1) throw new AccessError("CONFLICT", "Financial Report revision is no longer a draft");
    }
  }
  async fail(id: string) {
    await this.transaction.storedObject.updateMany({ where: { id, status: { in: ["PENDING", "FAILED"] } }, data: { status: "FAILED" } });
  }
  async expired(now: Date) {
    const rows = await this.transaction.$queryRaw<{ id: string }[]>`SELECT id FROM stored_objects WHERE cleaned_at IS NULL AND (status = 'FAILED' OR (status = 'PENDING' AND expires_at <= ${now})) ORDER BY expires_at LIMIT 100 FOR UPDATE SKIP LOCKED`;
    return this.transaction.storedObject.findMany({ where: { id: { in: rows.map(({ id }) => id) } } });
  }
  async markCleaned(id: string, now: Date) {
    await this.transaction.storedObject.updateMany({ where: { id, status: "FAILED" }, data: { cleanedAt: now } });
  }
}
