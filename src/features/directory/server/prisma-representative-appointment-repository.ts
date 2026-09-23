import "server-only";

import type { Prisma } from "#unyon-prisma-client";
import { AccessError } from "@/features/access/server";
import type { RepresentativeAppointmentRepository } from "./representative-appointments";

const selection = {
  id: true, portalUserId: true, universityId: true, startsAt: true, endsAt: true,
  portalUser: { select: { fullName: true, email: true, status: true } },
  university: { select: { name: true } },
} satisfies Prisma.AppointmentSelect;

export class PrismaRepresentativeAppointmentRepository implements RepresentativeAppointmentRepository {
  constructor(private readonly transaction: Prisma.TransactionClient) {}

  async list(universityIds: string[] | undefined, now: Date) {
    const rows = await this.transaction.appointment.findMany({
      where: { role: "REPRESENTATIVE", ...(universityIds ? { universityId: { in: universityIds } } : {}) },
      select: selection,
      orderBy: [{ startsAt: "desc" }, { id: "asc" }],
    });
    return rows.map((row) => toRecord(row, now));
  }

  async get(id: string, now: Date) {
    const row = await this.transaction.appointment.findFirst({ where: { id, role: "REPRESENTATIVE" }, select: selection });
    return row ? toRecord(row, now) : null;
  }

  async end(id: string, portalUserId: string, now: Date) {
    const changed = await this.transaction.appointment.updateMany({
      where: { id, portalUserId, role: "REPRESENTATIVE", startsAt: { lt: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
      data: { endsAt: now },
    });
    if (changed.count !== 1) throw new AccessError("CONFLICT", "This Appointment is no longer active");
    const remaining = await this.transaction.appointment.count({
      where: { portalUserId, startsAt: { lte: now }, OR: [{ endsAt: null }, { endsAt: { gt: now } }] },
    });
    if (remaining === 0) {
      await this.transaction.portalSession.updateMany({ where: { portalUserId, revokedAt: null }, data: { revokedAt: now } });
    }
    return { sessionsRevoked: remaining === 0 };
  }
}

function toRecord(row: Prisma.AppointmentGetPayload<{ select: typeof selection }>, now: Date) {
  return {
    id: row.id, portalUserId: row.portalUserId, fullName: row.portalUser.fullName, email: row.portalUser.email,
    universityId: row.universityId!, universityName: row.university!.name,
    startsAt: row.startsAt.toISOString(), endsAt: row.endsAt?.toISOString() ?? null,
    active: row.portalUser.status === "ACTIVE" && row.startsAt <= now && (!row.endsAt || row.endsAt > now),
  };
}
