import "server-only";

import { z } from "zod";
import { collectionPage, paginationInput } from "@/shared/pagination";

import {
  AccessError,
  createProtectedOperationFactory,
  type PortalActor,
  type ResourceSubject,
  type SessionService,
  type TransactionRunner,
} from "@/features/access/server";
import type { EventRecord, EventSummary, EventUniversityChoice } from "../contracts";

export type { EventRecord, EventUniversityChoice } from "../contracts";

interface EventSubject extends ResourceSubject {
  kind: "Event";
  ownerUniversityId: string | null;
  status: "DRAFT" | "PUBLISHED" | "CANCELLED" | "COMPLETED" | "ARCHIVED";
  startsAt: Date;
  endsAt: Date;
}

export interface EventRepository {
  upcomingSummaries(asOf: Date): Promise<EventSummary[]>;
  list(input: {
    actorRoles: Array<{ role: string; universityId: string | null }>;
    includeArchived: boolean;
    upcomingOnly: boolean;
    asOf: Date;
    search: string;
    startsFrom?: Date;
    startsBefore?: Date;
    limit?: number;
    offset?: number;
  }): Promise<EventRecord[]>;
  get(id: string): Promise<{ record: EventRecord; subject: EventSubject } | null>;
  activeUniversity(id: string): Promise<EventUniversityChoice | null>;
  listActiveUniversities(): Promise<EventUniversityChoice[]>;
  createDraft(input: {
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
  }): Promise<EventRecord>;
  editDetails(input: { id: string; version: number; title: string; description: string; location: string | null; onlineUrl: string | null; contactPerson: string | null }): Promise<EventRecord | null>;
  transition(input: {
    id: string;
    expectedVersion: number;
    from: EventSubject["status"];
    to: EventSubject["status"];
    occurredAt: Date;
  }): Promise<EventRecord | null>;
}

export interface EventCapabilities {
  events: EventRepository;
}

type EventIntent =
  | "event.list"
  | "event.upcoming_summaries"
  | "event.workspace"
  | "event.read"
  | "event.university_choices"
  | "event.create"
  | "event.edit"
  | "event.publish"
  | "event.cancel"
  | "event.complete"
  | "event.archive";

const text = (max: number) => z.string().trim().max(max);
const createInput = z.object({
  eventId: z.string().uuid(),
  title: z.string().transform(normalizeText).pipe(z.string().min(3).max(180)),
  description: z.string().transform(normalizeText).pipe(z.string().min(1).max(5000)),
  category: z.string().transform(normalizeText).pipe(z.string().min(2).max(80)),
  startsAt: z.string().datetime({ offset: true }).transform((value) => new Date(value)),
  endsAt: z.string().datetime({ offset: true }).transform((value) => new Date(value)),
  allDay: z.boolean().default(false),
  location: text(300).transform(emptyToNull),
  onlineUrl: text(2000).transform(emptyToNull).pipe(z.union([
    z.null(),
    z.string().url().refine((value) => ["http:", "https:"].includes(new URL(value).protocol)),
  ])),
  contactPerson: text(160).transform(emptyToNull),
  ownerUniversityId: z.string().uuid().nullable(),
  coHostUniversityIds: z.array(z.string().uuid()).max(50).default([]),
}).refine(({ startsAt, endsAt }) => startsAt < endsAt, {
  message: "The event must end after it starts",
  path: ["endsAt"],
}).refine(({ location, onlineUrl }) => Boolean(location || onlineUrl), {
  message: "Add a venue or an online link",
  path: ["location"],
}).refine(({ ownerUniversityId, coHostUniversityIds }) =>
  new Set(coHostUniversityIds).size === coHostUniversityIds.length &&
  (!ownerUniversityId || !coHostUniversityIds.includes(ownerUniversityId)), {
  message: "Co-host universities must be unique and cannot own the event",
  path: ["coHostUniversityIds"],
});

const listInput = z.object({
  includeArchived: z.boolean().default(false),
  upcomingOnly: z.boolean().default(false),
  search: z.string().trim().max(120).default(""),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/u).optional(),
});
const idInput = z.object({ id: z.string().uuid() });
const transitionInput = idInput.extend({ version: z.number().int().positive() });

export function createEventFeature(dependencies: {
  sessions: Pick<SessionService, "hashSessionToken">;
  transactions: TransactionRunner<EventCapabilities>;
}) {
  const factory = createProtectedOperationFactory<EventCapabilities>(dependencies);
  const anyAppointment = ({ actor }: { actor: PortalActor; intent: EventIntent }) =>
    actor.appointments.length > 0;

  const list = factory.query({
    intent: "event.list",
    input: listInput,
    resolveSubject: async () => ({ id: "visible-events", kind: "EventDirectory" }),
    authorize: anyAppointment,
    execute: async ({ actor, transaction }, input) => {
      const records = await transaction.capabilities.events.list({
        asOf: transaction.occurredAt,
        actorRoles: actor.appointments.map(({ role, universityId }) => ({ role, universityId })),
        includeArchived: input.includeArchived && hasRole(actor, "SUPER_ADMIN"),
        upcomingOnly: input.upcomingOnly,
        search: input.search,
        ...(input.month ? monthBounds(input.month) : {}),
        ...(input.month ? {} : { limit: 50 }),
      });

      return records.map((record) => ({
        ...record,
        canComplete: record.status === "PUBLISHED" && new Date(record.endsAt) <= transaction.occurredAt,
        manageable: canManage(actor, { ownerUniversityId: record.ownerUniversityId }),
      }));
    },
  });

  const workspace = factory.query({
    intent: "event.workspace",
    input: listInput.extend({ ...paginationInput.shape, view: z.enum(["list", "calendar"]).default("list") }),
    resolveSubject: async () => ({ id: "event-workspace", kind: "EventDirectory" }),
    authorize: anyAppointment,
    execute: async ({ actor, transaction }, input) => {
      const canCreate = actor.appointments.some(({ role }) => role === "SUPER_ADMIN" || role === "UNIVERSITY_ADMIN");
      const allowConfederation = hasRole(actor, "SUPER_ADMIN");
      const calendar = input.view === "calendar";
      if (calendar && !input.month) throw new AccessError("INVALID_INPUT", "Choose a calendar month");
      const [records, universityChoices] = await Promise.all([
        transaction.capabilities.events.list({
          actorRoles: actor.appointments, asOf: transaction.occurredAt,
          includeArchived: input.includeArchived && allowConfederation,
          search: input.search, upcomingOnly: input.upcomingOnly,
          ...(calendar ? monthBounds(input.month!) : { limit: input.pageSize + 1, offset: input.page * input.pageSize }),
        }),
        canCreate ? transaction.capabilities.events.listActiveUniversities() : Promise.resolve([]),
      ]);
      const page = calendar ? { records, page: 0, pageSize: records.length, hasNext: false } : collectionPage(records, input);
      return {
        events: page.records.map((record) => ({ ...record,
          canComplete: record.status === "PUBLISHED" && new Date(record.endsAt) <= transaction.occurredAt,
          manageable: canManage(actor, record),
        })),
        pagination: { page: page.page, pageSize: page.pageSize, hasNext: page.hasNext },
        canCreate, allowConfederation, universityChoices,
        ownerUniversityIds: actor.appointments.flatMap(({ role, universityId }) => role === "UNIVERSITY_ADMIN" && universityId ? [universityId] : []),
      };
    },
  });

  const get = factory.query({
    intent: "event.read",
    input: idInput,
    resolveSubject: async ({ transaction }, input) =>
      (await transaction.capabilities.events.get(input.id))?.subject ?? null,
    authorize: ({ actor, subject }) => canRead(actor, subject),
    execute: async ({ actor, transaction, subject }) => {
      const result = await transaction.capabilities.events.get(subject.id);

      if (!result || !canRead(actor, result.subject)) {
        throw forbidden();
      }

      return {
        ...result.record,
        canComplete: result.subject.status === "PUBLISHED" && result.subject.endsAt <= transaction.occurredAt,
        manageable: canManage(actor, result.subject),
      };
    },
  });

  const upcomingSummaries = factory.query({
    intent: "event.upcoming_summaries",
    input: z.object({}),
    resolveSubject: async () => ({ id: "upcoming-events", kind: "EventDirectory" }),
    authorize: anyAppointment,
    execute: ({ transaction }) => transaction.capabilities.events.upcomingSummaries(transaction.occurredAt),
  });

  const universityChoices = factory.query({
    intent: "event.university_choices",
    input: z.object({}),
    resolveSubject: async () => ({ id: "active-universities", kind: "MemberUniversityDirectory" }),
    authorize: ({ actor }) => actor.appointments.some(({ role }) =>
      role === "SUPER_ADMIN" || role === "UNIVERSITY_ADMIN",
    ),
    execute: ({ transaction }) => transaction.capabilities.events.listActiveUniversities(),
  });

  const create = factory.mutation({
    action: "event.draft_created",
    intent: "event.create",
    input: createInput,
    resolveSubject: async ({ transaction }, input) => {
      if (input.ownerUniversityId && !await transaction.capabilities.events.activeUniversity(input.ownerUniversityId)) {
        return null;
      }

      return {
        id: input.eventId,
        kind: "Event",
        ownerUniversityId: input.ownerUniversityId,
        status: "DRAFT",
        startsAt: input.startsAt,
        endsAt: input.endsAt,
      } satisfies EventSubject;
    },
    authorize: ({ actor, subject }) => canManage(actor, subject),
    execute: async ({ actor, transaction, subject }, input) => {
      const record = await transaction.capabilities.events.createDraft({
        ...input,
        createdByPortalUserId: actor.portalUserId,
        id: subject.id,
      });
      return { ...record, manageable: true, canComplete: false };
    },
    auditMetadata: (record) => ({
      category: record.category,
      ownerUniversityId: record.ownerUniversityId,
      status: record.status,
    }),
  });

  const publish = transition("event.publish", "event.published", "PUBLISHED");
  const edit = factory.mutation({
    intent: "event.edit", action: "event.edited",
    input: transitionInput.extend({ title: z.string().trim().min(3).max(180), description: z.string().trim().min(1).max(5000), location: text(300).transform(emptyToNull), contactPerson: text(160).transform(emptyToNull), onlineUrl: text(2000).transform(emptyToNull).pipe(z.union([z.null(), z.url().refine((value) => { const url = new URL(value); return ["http:", "https:"].includes(url.protocol) && !url.username && !url.password; })])) }).refine(({ location, onlineUrl }) => Boolean(location || onlineUrl)),
    resolveSubject: async ({ transaction }, input) => (await transaction.capabilities.events.get(input.id))?.subject ?? null,
    authorize: ({ actor, subject }) => canManage(actor, subject),
    execute: async ({ transaction, subject }, input) => {
      if (!["DRAFT", "PUBLISHED"].includes(subject.status)) throw new AccessError("CONFLICT", "Only draft or published Event details can be edited");
      const record = await transaction.capabilities.events.editDetails(input);
      if (!record) throw new AccessError("CONFLICT", "The Event changed. Refresh and try again");
      return { ...record, manageable: true };
    },
  });
  const cancel = transition("event.cancel", "event.cancelled", "CANCELLED");
  const complete = transition("event.complete", "event.completed", "COMPLETED");
  const archive = transition("event.archive", "event.archived", "ARCHIVED");

  function transition(intent: EventIntent, action: string, to: EventSubject["status"]) {
    return factory.mutation({
      action,
      intent,
      input: transitionInput,
      resolveSubject: async ({ transaction }, input) =>
        (await transaction.capabilities.events.get(input.id))?.subject ?? null,
      authorize: ({ actor, subject }) => canManage(actor, subject),
      execute: async ({ occurredAt, transaction, subject }, input) => {
        const allowed =
          (to === "PUBLISHED" && subject.status === "DRAFT" && subject.startsAt > occurredAt) ||
          (to === "CANCELLED" && subject.status === "PUBLISHED") ||
          (to === "COMPLETED" && subject.status === "PUBLISHED" && subject.endsAt <= occurredAt) ||
          (to === "ARCHIVED" && ["CANCELLED", "COMPLETED"].includes(subject.status));

        if (!allowed) {
          throw new AccessError("CONFLICT", "The event cannot make that status change");
        }

        const record = await transaction.capabilities.events.transition({
          expectedVersion: input.version,
          from: subject.status,
          id: subject.id,
          occurredAt,
          to,
        });

        if (!record) {
          throw new AccessError("CONFLICT", "The event changed. Refresh and try again");
        }

        return {
          ...record,
          manageable: true,
          canComplete: to === "PUBLISHED" && subject.endsAt <= occurredAt,
        };
      },
      auditMetadata: (record) => ({ status: record.status }),
    });
  }

  return { archive, cancel, complete, create, edit, get, list, publish, universityChoices, upcomingSummaries, workspace };
}

function canRead(actor: PortalActor, subject: EventSubject) {
  if (hasRole(actor, "SUPER_ADMIN")) return true;
  if (subject.status === "ARCHIVED") return false;
  if (subject.status === "PUBLISHED") return true;

  return canManage(actor, subject);
}

function canManage(actor: PortalActor, subject: Pick<EventSubject, "ownerUniversityId">) {
  return actor.appointments.some((appointment) =>
    appointment.role === "SUPER_ADMIN" ||
    (appointment.role === "UNIVERSITY_ADMIN" &&
      subject.ownerUniversityId !== null &&
      appointment.universityId === subject.ownerUniversityId),
  );
}

function hasRole(actor: PortalActor, role: string) {
  return actor.appointments.some((appointment) => appointment.role === role);
}

function normalizeText(value: string) {
  return value.normalize("NFKC").trim().replaceAll(/\s+/gu, " ");
}

function emptyToNull(value: string) {
  return value.length ? value : null;
}

function monthBounds(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const start = new Date(0);
  start.setUTCFullYear(year, monthNumber - 1, 1);
  const next = new Date(start);
  next.setUTCMonth(next.getUTCMonth() + 1);
  const manilaOffset = 8 * 60 * 60 * 1000;
  return {
    startsFrom: new Date(start.getTime() - manilaOffset),
    ...(next.getUTCFullYear() <= 9999 ? { startsBefore: new Date(next.getTime() - manilaOffset) } : {}),
  };
}

function forbidden() {
  return new AccessError("NOT_FOUND_OR_FORBIDDEN", "Not found or forbidden");
}
