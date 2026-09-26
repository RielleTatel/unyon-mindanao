import "server-only";

import { z } from "zod";
import { createProtectedOperationFactory, withAccessRuntime } from "@/features/access/server";
import type { TransactionRunner } from "@/features/access/server";
import type { Prisma } from "#unyon-prisma-client";
import { D1ProfileRepository } from "./d1-profile-repository";

export interface ProfileRecord {
  id: string;
  fullName: string;
  email: string;
  status: "ACTIVE" | "DISABLED";
  profileObjectId: string | null;
  birthday: { month: number | null; day: number | null };
  appointments: Array<{
    id: string;
    role: "SUPER_ADMIN" | "UNIVERSITY_ADMIN" | "REPRESENTATIVE";
    startsAt: string;
    endsAt: string | null;
    university: { name: string } | null;
  }>;
}

export interface ProfileRepository {
  get(id: string): Promise<ProfileRecord>;
}

class PrismaProfileRepository implements ProfileRepository {
  constructor(private readonly transaction: Prisma.TransactionClient) {}

  async get(id: string) {
    const user = await this.transaction.portalUser.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        fullName: true,
        email: true,
        status: true,
        profileObjectId: true,
        appointments: {
          orderBy: { startsAt: "desc" },
          select: {
            id: true,
            role: true,
            startsAt: true,
            endsAt: true,
            university: { select: { name: true } },
          },
        },
      },
    });
    const [birthday] = await this.transaction.$queryRaw<
      { month: number | null; day: number | null }[]
    >`SELECT EXTRACT(MONTH FROM birth_date)::int AS month, EXTRACT(DAY FROM birth_date)::int AS day FROM portal_users WHERE id = ${id}::uuid`;

    return {
      ...user,
      birthday,
      appointments: user.appointments.map((appointment) => ({
        ...appointment,
        startsAt: appointment.startsAt.toISOString(),
        endsAt: appointment.endsAt?.toISOString() ?? null,
      })),
    };
  }
}

export function createProfileFeature(dependencies: {
  sessions: { hashSessionToken(value: string): Promise<string> };
  transactions: TransactionRunner<{ profile: ProfileRepository }>;
}) {
  const factory = createProtectedOperationFactory(dependencies);
  return {
    get: factory.query({
      intent: "profile.self",
      input: z.object({}),
      resolveSubject: async ({ actor }) => ({ id: actor.portalUserId, kind: "PortalUser" }),
      authorize: () => true,
      execute: ({ transaction, subject }) =>
        transaction.capabilities.profile.get(subject.id),
    }),
  };
}

export function withProfileFeature<Result>(
  work: (feature: ReturnType<typeof createProfileFeature>) => Promise<Result>,
) {
  if (process.env.PERSISTENCE_PROVIDER === "d1") {
    return import("@/features/access/server/d1-runtime").then(({ withD1AccessRuntime }) =>
      withD1AccessRuntime<{ profile: ProfileRepository }, Result>(
        (sessions, persistence) => work(createProfileFeature({ sessions, transactions: persistence.transactions })),
        (transaction) => ({ profile: new D1ProfileRepository(transaction) }),
      ),
    );
  }
  return withAccessRuntime<{ profile: ProfileRepository }, Result>(
    (sessions, persistence) =>
      work(createProfileFeature({ sessions, transactions: persistence.transactions })),
    (transaction) => ({ profile: new PrismaProfileRepository(transaction) }),
  );
}
