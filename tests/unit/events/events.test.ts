import { describe, expect, it, vi } from "vitest";

import {
  type AuditRecord,
  type PortalActor,
  type TransactionRunner,
} from "@/features/access/server";
import {
  createEventFeature,
  type EventCapabilities,
  type EventRecord,
  type EventRepository,
} from "@/features/events/server";

const now = new Date("2026-09-21T00:00:00.000Z");
const universityA = "00000000-0000-4000-8000-000000000002";
const universityB = "00000000-0000-4000-8000-000000000003";
const eventId = "00000000-0000-4000-8000-000000000004";

function record(overrides: Partial<EventRecord> = {}): EventRecord {
  return {
    allDay: false,
    canComplete: false,
    coverObjectId: null,
    category: "Assembly",
    coHosts: [],
    contactPerson: null,
    description: "A gathering for student leaders.",
    endsAt: "2026-10-02T09:00:00.000Z",
    id: eventId,
    location: "Davao City",
    manageable: false,
    onlineUrl: null,
    ownerUniversityId: universityA,
    ownerUniversityName: "University A",
    publishedAt: now.toISOString(),
    startsAt: "2026-10-02T01:00:00.000Z",
    status: "PUBLISHED",
    title: "Student Congress",
    version: 1,
    ...overrides,
  };
}

function actor(role: "SUPER_ADMIN" | "UNIVERSITY_ADMIN" | "REPRESENTATIVE", universityId: string | null = universityA): PortalActor {
  return {
    appointments: [{ id: "appointment-1", role, universityId: role === "SUPER_ADMIN" ? null : universityId }],
    email: "actor@unyon.test",
    firebaseUid: "firebase-actor",
    portalUserId: "00000000-0000-4000-8000-000000000001",
  };
}

function createFeature(role: "SUPER_ADMIN" | "UNIVERSITY_ADMIN" | "REPRESENTATIVE", universityId: string | null = universityA) {
  let current = record();
  const audit: AuditRecord[] = [];
  const repository: EventRepository = {
    editDetails: vi.fn(async () => current),
    list: vi.fn(async () => [current]),
    get: vi.fn(async (id) => id === current.id ? {
      record: current,
      subject: {
        endsAt: new Date(current.endsAt),
        id: current.id,
        kind: "Event" as const,
        ownerUniversityId: current.ownerUniversityId,
        startsAt: new Date(current.startsAt),
        status: current.status,
      },
    } : null),
    activeUniversity: vi.fn(async (id) => ({ id, name: "University A" })),
    listActiveUniversities: vi.fn(async () => [{ id: universityA, name: "University A" }]),
    createDraft: vi.fn(async (input) => {
      current = record({
        allDay: input.allDay,
        category: input.category,
        description: input.description,
        endsAt: input.endsAt.toISOString(),
        id: input.id,
        location: input.location,
        onlineUrl: input.onlineUrl,
        ownerUniversityId: input.ownerUniversityId,
        startsAt: input.startsAt.toISOString(),
        status: "DRAFT",
        title: input.title,
        version: 1,
      });
      return current;
    }),
    transition: vi.fn(async (input) => {
      if (current.version !== input.expectedVersion || current.status !== input.from) return null;
      current = record({
        ...current,
        canComplete: input.to === "PUBLISHED" && current.endsAt <= input.occurredAt.toISOString(),
        publishedAt: input.to === "PUBLISHED" ? input.occurredAt.toISOString() : current.publishedAt,
        status: input.to,
        version: current.version + 1,
      });
      return current;
    }),
  };
  const transactions: TransactionRunner<EventCapabilities> = {
    run: (_input, work) => work({
      capabilities: { events: repository },
      occurredAt: now,
      appendAudit: async (entry) => { audit.push(entry); },
    }, actor(role, universityId)),
  };
  const feature = createEventFeature({
    sessions: { hashSessionToken: async () => "hashed-session" },
    transactions,
  });
  return { audit, feature, repository };
}

const request = (input: unknown) => ({ correlationId: "event-test", input, sessionToken: "session-token" });

describe("Event feature", () => {
  it("lets the Owning University publish and audit a draft", async () => {
    const { audit, feature, repository } = createFeature("UNIVERSITY_ADMIN");
    const draft = record({ status: "DRAFT", publishedAt: null });
    vi.mocked(repository.get).mockImplementation(async (id) => id === draft.id ? {
      record: draft,
      subject: {
        endsAt: new Date(draft.endsAt), id: draft.id, kind: "Event" as const,
        ownerUniversityId: universityA, startsAt: new Date(draft.startsAt), status: "DRAFT",
      },
    } : null);
    vi.mocked(repository.transition).mockResolvedValue(record({ status: "PUBLISHED", version: 2 }));

    await expect(feature.publish(request({ id: eventId, version: 1 }))).resolves.toMatchObject({ status: "PUBLISHED", manageable: true });
    expect(repository.transition).toHaveBeenCalledWith(expect.objectContaining({ from: "DRAFT", to: "PUBLISHED", expectedVersion: 1 }));
    expect(audit).toEqual([expect.objectContaining({ action: "event.published", resourceId: eventId, resourceType: "Event" })]);
  });

  it("denies a co-host University Admin from publishing another university's event", async () => {
    const { audit, feature, repository } = createFeature("UNIVERSITY_ADMIN", universityB);
    await expect(feature.publish(request({ id: eventId, version: 1 }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    expect(repository.transition).not.toHaveBeenCalled();
    expect(audit).toEqual([]);
  });

  it("shows published events to Representatives and hides drafts", async () => {
    const { feature, repository } = createFeature("REPRESENTATIVE");
    const visible = await feature.get(request({ id: eventId }));
    expect(visible).toMatchObject({ status: "PUBLISHED", manageable: false });

    const draft = record({ status: "DRAFT", publishedAt: null });
    vi.mocked(repository.get).mockResolvedValue({
      record: draft,
      subject: { endsAt: new Date(draft.endsAt), id: eventId, kind: "Event" as const, ownerUniversityId: universityA, startsAt: new Date(draft.startsAt), status: "DRAFT" },
    });
    await expect(feature.get(request({ id: eventId }))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
  });

  it("rejects co-host as owner and invalid time ranges before persistence", async () => {
    const { feature, repository } = createFeature("UNIVERSITY_ADMIN");
    await expect(feature.create(request({
      eventId,
      title: "Leadership Congress",
      description: "A gathering for student leaders.",
      category: "Congress",
      startsAt: "2026-10-02T09:00:00+08:00",
      endsAt: "2026-10-02T10:00:00+08:00",
      location: "Davao City",
      onlineUrl: "",
      contactPerson: "",
      ownerUniversityId: universityA,
      coHostUniversityIds: [universityA],
    }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    expect(repository.createDraft).not.toHaveBeenCalled();
  });

  it("prevents a stale lifecycle transition", async () => {
    const { feature, repository } = createFeature("SUPER_ADMIN");
    vi.mocked(repository.transition).mockResolvedValue(null);
    await expect(feature.cancel(request({ id: eventId, version: 2 }))).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
