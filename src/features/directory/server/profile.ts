import "server-only";
import { z } from "zod";
import { createProtectedOperationFactory, withAccessRuntime } from "@/features/access/server";
import type { Prisma } from "#unyon-prisma-client";

class PrismaProfileRepository {
  constructor(private readonly transaction: Prisma.TransactionClient) {}
  async get(id: string) {
    const user = await this.transaction.portalUser.findUniqueOrThrow({ where: { id }, select: { id: true, fullName: true, email: true, status: true, profileObjectId: true, appointments: { orderBy: { startsAt: "desc" }, select: { id: true, role: true, startsAt: true, endsAt: true, university: { select: { name: true } } } } } });
    const [birthday] = await this.transaction.$queryRaw<{ month: number | null; day: number | null }[]>`SELECT EXTRACT(MONTH FROM birth_date)::int AS month, EXTRACT(DAY FROM birth_date)::int AS day FROM portal_users WHERE id = ${id}::uuid`;
    return { ...user, birthday, appointments: user.appointments.map((appointment) => ({ ...appointment, startsAt: appointment.startsAt.toISOString(), endsAt: appointment.endsAt?.toISOString() ?? null })) };
  }
}
export function withProfileFeature<Result>(work: (feature: { get: (request: { input: unknown; sessionToken: string; correlationId: string }) => Promise<Awaited<ReturnType<PrismaProfileRepository["get"]>>> }) => Promise<Result>) {
  return withAccessRuntime<{ profile: PrismaProfileRepository }, Result>((sessions, persistence) => {
    const factory = createProtectedOperationFactory({ sessions, transactions: persistence.transactions });
    return work({ get: factory.query({ intent: "profile.self", input: z.object({}), resolveSubject: async ({ actor }) => ({ id: actor.portalUserId, kind: "PortalUser" }), authorize: () => true, execute: ({ transaction, subject }) => transaction.capabilities.profile.get(subject.id) }) });
  }, (transaction) => ({ profile: new PrismaProfileRepository(transaction) }));
}
