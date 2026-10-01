// @vitest-environment node
import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createD1AccessPersistence, createSuperAdminBootstrap, type TransactionRunner } from "@/features/access/server";
import { createEventFeature, type EventCapabilities } from "@/features/events/server";
import { D1EventRepository } from "@/features/events/server/d1-event-repository";
import { createEvaluationFeature, type EvaluationRepository } from "@/features/evaluations/server";
import { D1EvaluationRepository } from "@/features/evaluations/server/d1-evaluation-repository";
import { createCommunicationsFeature, type CommunicationsRepository } from "@/features/communications/server";
import { D1CommunicationsRepository } from "@/features/communications/server/d1-communications-repository";
import { createFinancialReportFeature, type FinancialReportRepository } from "@/features/financial-reports/server";
import { D1FinancialReportRepository } from "@/features/financial-reports/server/d1-financial-report-repository";
import { LocalD1Database } from "../fixtures/local-d1";

class MeasuredDatabase extends LocalD1Database {
  metrics = { reads: 0, batches: 0, assertionWrites: 0 };
  reset() { this.metrics = { reads: 0, batches: 0, assertionWrites: 0 }; }
  prepare(query: string) {
    const decorate = (statement: ReturnType<LocalD1Database["prepare"]>): typeof statement => new Proxy(statement, {
      get: (target, property, receiver) => {
        if (property === "bind") return (...values: unknown[]) => decorate(target.bind(...values));
        if (property === "first") return <Row>() => { this.metrics.reads++; return target.first<Row>(); };
        if (property === "all") return <Row>() => { this.metrics.reads++; return target.all<Row>(); };
        if (property === "run") return <Row>() => {
          if (query.includes("INSERT INTO d1_assertion_guard")) this.metrics.assertionWrites++;
          return target.run<Row>();
        };
        return Reflect.get(target, property, receiver);
      },
    });
    return decorate(super.prepare(query));
  }
  async batch<Row>(statements: Parameters<LocalD1Database["batch"]>[0]) {
    this.metrics.batches++;
    return super.batch<Row>(statements);
  }
}

type Capabilities = EventCapabilities & { evaluations: EvaluationRepository; communications: CommunicationsRepository; reports: FinancialReportRepository };
const universities = [randomUUID(), randomUUID(), randomUUID()];
const hashes = { admin: "a".repeat(64), owner: "b".repeat(64), representative: "c".repeat(64) };
type Actor = keyof typeof hashes;
const request = (input: unknown = {}, actor: Actor = "admin") => ({ input, sessionToken: actor, correlationId: randomUUID() });
const sqlString = (value: string) => `'${value.replaceAll("'", "''")}'`;

describe("Portal performance through protected feature interfaces", () => {
  let database: MeasuredDatabase;
  afterEach(() => database?.close());

  async function fixture() {
    database = new MeasuredDatabase(["0001_access_foundation.sql", "0002_communications.sql", "0003_events_and_files.sql", "0004_invitations.sql", "0005_evaluations_and_reports.sql"]);
    const access = createD1AccessPersistence<Capabilities>(database as unknown as D1Database, (transaction) => ({
      events: new D1EventRepository(transaction), evaluations: new D1EvaluationRepository(transaction),
      communications: new D1CommunicationsRepository(transaction), reports: new D1FinancialReportRepository(transaction),
    }));
    const admin = await createSuperAdminBootstrap(access.superAdminBootstrap)({ correlationId: "performance-fixture", email: "performance-admin@unyon.test", firebaseUid: "performance-admin", fullName: "Performance Admin" });
    database.exec("UPDATE appointments SET starts_at = '2020-01-01T00:00:00.000Z'");
    for (const [index, id] of universities.entries()) {
      database.exec(`INSERT INTO member_universities (id, name, slug) VALUES (${sqlString(id)}, 'University ${index}', 'university-${index}')`);
    }
    for (const actor of ["owner", "representative"] as const) {
      const id = randomUUID();
      database.exec(`INSERT INTO portal_users (id, firebase_uid, email, full_name) VALUES (${sqlString(id)}, 'performance-${actor}', 'performance-${actor}@unyon.test', 'Performance ${actor}');
        INSERT INTO appointments (id, portal_user_id, role, university_id, starts_at) VALUES (${sqlString(randomUUID())}, ${sqlString(id)}, '${actor === "owner" ? "UNIVERSITY_ADMIN" : "REPRESENTATIVE"}', ${sqlString(universities[0])}, '2020-01-01T00:00:00.000Z')`);
    }
    for (const actor of Object.keys(hashes) as Actor[]) {
      await access.sessions.start({ correlationId: "fixture-session", tokenHash: hashes[actor], maximumLifetimeSeconds: 3600,
        identity: { authenticatedAt: new Date(), email: `performance-${actor}@unyon.test`, emailVerified: true, firebaseUid: `performance-${actor}` },
      });
    }
    const dependencies = { sessions: { hashSessionToken: async (token: string) => hashes[token as Actor] ?? "unknown" }, transactions: access.transactions };
    return { adminId: admin.portalUserId, dependencies, events: createEventFeature(dependencies), evaluations: createEvaluationFeature(dependencies), communications: createCommunicationsFeature(dependencies), reports: createFinancialReportFeature(dependencies) };
  }

  function seedEvent(adminId: string, input: { startsAt: string; endsAt?: string; status?: "DRAFT" | "PUBLISHED"; owner?: string; title?: string; coHosts?: boolean }) {
    const id = randomUUID();
    const end = input.endsAt ?? new Date(new Date(input.startsAt).getTime() + 3600000).toISOString();
    const owner = input.owner ?? universities[0];
    database.exec(`INSERT INTO events (id, title, description, category, status, starts_at, ends_at, location, owner_university_id, created_by_portal_user_id, published_at)
      VALUES (${sqlString(id)}, ${sqlString(input.title ?? "Performance Event")}, 'Synthetic capacity fixture', 'Assembly', '${input.status ?? "PUBLISHED"}', ${sqlString(input.startsAt)}, ${sqlString(end)}, 'Fixture venue', ${sqlString(owner)}, ${sqlString(adminId)}, ${input.status === "DRAFT" ? "NULL" : sqlString(new Date().toISOString())})`);
    if (input.coHosts) for (const university of universities.filter((candidate) => candidate !== owner)) {
      database.exec(`INSERT INTO event_co_hosts (event_id, university_id) VALUES (${sqlString(id)}, ${sqlString(university)})`);
    }
    return id;
  }

  it("bounds Event pages before co-host joins, preserves university visibility, and selects only four published summaries", async () => {
    const { events, adminId } = await fixture();
    const ids = Array.from({ length: 120 }, (_, index) => seedEvent(adminId, {
      startsAt: "2032-03-01T00:00:00.000Z", status: index % 2 ? "PUBLISHED" : "DRAFT",
      owner: universities[Math.floor(index / 2) % 2], title: `Event ${String(index).padStart(3, "0")}`, coHosts: true,
    }));
    database.reset();
    const first = await events.workspace(request({ view: "list" }));
    expect(first.events).toHaveLength(50);
    expect(first.pagination).toMatchObject({ page: 0, pageSize: 50, hasNext: true });
    expect(first.events.every(({ coHosts }) => coHosts.length === 2)).toBe(true);
    expect(database.metrics).toMatchObject({ batches: 0, assertionWrites: 0 });
    const second = await events.workspace(request({ view: "list", page: 1 }));
    const third = await events.workspace(request({ view: "list", page: 2 }));
    expect([...first.events, ...second.events, ...third.events].map(({ id }) => id)).toEqual(ids);
    expect(third.pagination.hasNext).toBe(false);
    const representative = await events.workspace(request({ view: "list", pageSize: 100 }, "representative"));
    expect(representative.events).toHaveLength(60);
    expect(representative.events.every(({ status, manageable }) => status === "PUBLISHED" && !manageable)).toBe(true);
    const owner = await events.workspace(request({ view: "list", pageSize: 100 }, "owner"));
    expect(owner.events).toHaveLength(90);
    expect(owner.events.every((event) => event.status === "PUBLISHED" || event.ownerUniversityId === universities[0])).toBe(true);
    await expect(events.get(request({ id: ids[2] }, "owner"))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    await expect(events.workspace(request({ pageSize: 101 }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
    const summaries = await events.upcomingSummaries(request());
    expect(summaries.map(({ id }) => id)).toEqual([ids[1], ids[3], ids[5], ids[7]]);
    expect(summaries.every((summary) => !("description" in summary) && !("coHosts" in summary))).toBe(true);
  });

  it("scopes calendar queries to Manila month bounds, including leap-day and UTC rollovers", async () => {
    const { events, adminId } = await fixture();
    const dates = ["2032-01-31T15:59:59.000Z", "2032-01-31T16:00:00.000Z", "2032-02-29T15:59:59.000Z", "2032-02-29T16:00:00.000Z"];
    const ids = dates.map((startsAt) => seedEvent(adminId, { startsAt }));
    const calendar = await events.workspace(request({ view: "calendar", month: "2032-02" }));
    expect(calendar.events.map(({ id }) => id)).toEqual([ids[1], ids[2]]);
    expect(calendar.pagination.hasNext).toBe(false);
    await expect(events.workspace(request({ view: "calendar", month: "2032-13" }))).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });

  it("lists 100 open Evaluation windows within six reads and no assertion writes", async () => {
    const { evaluations, adminId } = await fixture();
    database.reset();
    expect((await evaluations.page(request())).records).toEqual([]);
    expect(database.metrics.reads).toBeLessThanOrEqual(4);
    expect(database.metrics).toMatchObject({ batches: 0, assertionWrites: 0 });
    const start = new Date(Date.now() - 2 * 86400000).toISOString();
    for (let index = 0; index < 100; index++) seedEvent(adminId, { startsAt: start, title: `Open Evaluation ${index}` });
    database.reset();
    const page = await evaluations.page(request({ pageSize: 100 }, "representative"));
    expect(page.records).toHaveLength(100);
    expect(page.records.every(({ canRespond, response }) => canRespond && response === null)).toBe(true);
    expect(database.metrics.reads).toBeLessThanOrEqual(6);
    expect(database.metrics).toMatchObject({ batches: 0, assertionWrites: 0 });
    database.reset();
    const summaries = await evaluations.openSummaries(request({}, "representative"));
    expect(summaries).toHaveLength(100);
    expect(summaries.every((summary) => !summary.submitted && !("questions" in summary))).toBe(true);
    expect(database.metrics.reads).toBeLessThanOrEqual(4);
  });

  it("filters publication before limits and preserves the existing UTF-16 Announcement excerpt", async () => {
    const { communications } = await fixture();
    const body = "💡".repeat(300);
    for (let index = 0; index < 120; index++) {
      database.exec(`INSERT INTO announcements (id, title, body, status, published_at)
        VALUES (${sqlString(randomUUID())}, 'Announcement ${index}', ${sqlString(body)}, '${index < 110 ? "DRAFT" : "PUBLISHED"}', ${index < 110 ? "NULL" : "'2026-01-01T00:00:00.000Z'"})`);
    }
    const recent = await communications.recentAnnouncements(request());
    expect(recent).toHaveLength(3);
    expect(recent.every(({ excerpt }) => excerpt === body.slice(0, 220))).toBe(true);
    const page = await communications.announcementPage(request());
    expect(page.records).toHaveLength(50);
    expect(page.hasNext).toBe(true);
    const published = await communications.announcementPage(request({}, "representative"));
    expect(published.records).toHaveLength(10);
    expect(published.records.every(({ status }) => status === "PUBLISHED")).toBe(true);
  });

  it("moves Shortcuts with a compact intent and rejects stale or concurrent ordering changes atomically", async () => {
    const { communications, dependencies } = await fixture();
    const shortcuts: Awaited<ReturnType<typeof communications.saveShortcut>>[] = [];
    for (let index = 0; index < 3; index++) shortcuts.push(await communications.saveShortcut(request({ label: `Shortcut ${index}`, url: `https://example.com/${index}`, icon: null, active: true })));
    await communications.moveShortcut(request({ id: shortcuts[1].id, version: 1, direction: "up" }));
    expect((await communications.listShortcuts(request())).map(({ id }) => id)).toEqual([shortcuts[1].id, shortcuts[0].id, shortcuts[2].id]);
    await expect(communications.moveShortcut(request({ id: shortcuts[1].id, version: 1, direction: "down" }))).rejects.toMatchObject({ code: "CONFLICT" });
    const transactions: TransactionRunner<Capabilities> = { run: (input, work) => dependencies.transactions.run(input, async (transaction, actor) => {
      const result = await work(transaction, actor);
      database.exec(`UPDATE shortcuts SET version = version + 1 WHERE id = ${sqlString(shortcuts[2].id)}`);
      return result;
    }) };
    const concurrent = createCommunicationsFeature({ ...dependencies, transactions });
    await expect(concurrent.moveShortcut(request({ id: shortcuts[1].id, version: 2, direction: "down" }))).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await communications.listShortcuts(request())).map(({ id }) => id)).toEqual([shortcuts[1].id, shortcuts[0].id, shortcuts[2].id]);
    await expect(communications.moveShortcut(request({ id: shortcuts[0].id, version: 2, direction: "down" }, "representative"))).rejects.toMatchObject({ code: "NOT_FOUND_OR_FORBIDDEN" });
    expect((await database.prepare("SELECT COUNT(*) AS count FROM audit_logs WHERE action = 'shortcuts.reordered'").first<{ count: number }>())?.count).toBe(1);
  });

  it("bounds report entities before joining revisions and keeps drafts private", async () => {
    const { reports, adminId } = await fixture();
    for (let index = 0; index < 55; index++) {
      const reportId = randomUUID();
      database.exec(`INSERT INTO financial_reports (id, title, reporting_period, description) VALUES (${sqlString(reportId)}, 'Report ${index}', '2026', 'Synthetic report')`);
      for (let revision = 1; revision <= 3; revision++) {
        const revisionId = randomUUID(); const objectId = randomUUID();
        database.exec(`INSERT INTO stored_objects (id, key, purpose, resource_id, uploader_id, mime_type, size, sha256, status, expires_at) VALUES (${sqlString(objectId)}, ${sqlString(objectId)}, 'FINANCIAL_REPORT', ${sqlString(revisionId)}, ${sqlString(adminId)}, 'application/pdf', 100, '${"a".repeat(64)}', 'AVAILABLE', '2032-01-01T00:00:00.000Z');
          INSERT INTO financial_report_revisions (id, report_id, revision, status, object_id, published_by_id, published_at, superseded_at) VALUES (${sqlString(revisionId)}, ${sqlString(reportId)}, ${revision}, '${revision === 1 ? "SUPERSEDED" : revision === 2 ? "PUBLISHED" : "DRAFT"}', ${sqlString(objectId)}, ${sqlString(adminId)}, '2026-01-01T00:00:00.000Z', ${revision === 1 ? "'2026-01-02T00:00:00.000Z'" : "NULL"})`);
      }
    }
    const page = await reports.page(request());
    expect(page.records).toHaveLength(50);
    expect(page.records.every(({ revisions }) => revisions.length === 3)).toBe(true);
    expect(page.hasNext).toBe(true);
    const published = await reports.page(request({}, "representative"));
    expect(published.records).toHaveLength(50);
    expect(published.records.every(({ revisions }) => revisions.length === 2 && revisions.every(({ status }) => status !== "DRAFT"))).toBe(true);
  });
});
