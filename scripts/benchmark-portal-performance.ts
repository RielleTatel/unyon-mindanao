import { execFileSync } from "node:child_process";
import { readFileSync, readdirSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { isDeepStrictEqual } from "node:util";
import ts from "typescript";
import { createEventFeature, type EventCapabilities } from "../src/features/events/server";
import { D1EventRepository } from "../src/features/events/server/d1-event-repository";
import { createCommunicationsFeature, type CommunicationsRepository } from "../src/features/communications/server";
import { D1CommunicationsRepository } from "../src/features/communications/server/d1-communications-repository";
import { createBirthdayFeature, type BirthdayRepository } from "../src/features/directory/server";
import { D1BirthdayRepository } from "../src/features/directory/server/d1-birthday-repository";
import { createEvaluationFeature, type EvaluationRepository } from "../src/features/evaluations/server";
import { D1EvaluationRepository } from "../src/features/evaluations/server/d1-evaluation-repository";
import type { EvaluationQuestion } from "../src/features/evaluations/contracts";
import { D1TransactionRunner } from "../src/features/access/server/d1-transaction-runner";
import { D1SessionRepository } from "../src/features/access/server/d1-session-repository";
import { manilaDateKey } from "../src/features/events/format";
import { LocalD1Database } from "../tests/fixtures/local-d1";

// Run from the repository root with:
// node --conditions=react-server --expose-gc --import tsx scripts/benchmark-portal-performance.ts [baseline-ref]
// Timings describe local preparation only; they are not browser or Workers CPU measurements.
const baselineRef = process.argv[2] ?? "b4d5350";
const calendarPath = "src/features/events/ui/event-workspace.tsx";
type CalendarEvent = { id: string; startsAt: string };
type CalendarProjection = (input: { events: CalendarEvent[]; month: string }) => ({ day: number; events: CalendarEvent[] } | null)[];

function calendarProjection(content: string): CalendarProjection {
  const source = ts.createSourceFile(calendarPath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const printer = ts.createPrinter();
  const functions = source.statements.filter((node): node is ts.FunctionDeclaration =>
    ts.isFunctionDeclaration(node) && Boolean(node.name && ["Calendar", "manilaDateKey", "shiftMonth"].includes(node.name.text)),
  );
  if (!functions.some(({ name }) => name?.text === "Calendar")) throw new Error("Calendar preparation not found");
  const projected = functions.map((node) => {
    if (node.name?.text !== "Calendar" || !node.body) return printer.printNode(ts.EmitHint.Unspecified, node, source);
    const body = ts.factory.updateBlock(node.body, [
      ...node.body.statements.filter((statement) => !ts.isReturnStatement(statement)),
      ts.factory.createReturnStatement(ts.factory.createIdentifier("cells")),
    ]);
    return printer.printNode(ts.EmitHint.Unspecified, ts.factory.updateFunctionDeclaration(
      node, node.modifiers, node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type, body,
    ), source);
  }).join("\n");
  const code = ts.transpileModule(projected, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function("manilaDateKey", `${code}\nreturn Calendar;`)(manilaDateKey) as CalendarProjection;
}

const before = calendarProjection(execFileSync("git", ["show", `${baselineRef}:${calendarPath}`], { encoding: "utf8" }));
const after = calendarProjection(readFileSync(calendarPath, "utf8"));
const median = (samples: number[]) => [...samples].sort((left, right) => left - right)[Math.floor(samples.length / 2)];
for (const size of [100, 1000]) {
  const events = Array.from({ length: size }, (_, index) => ({
    id: `synthetic-${index}`, startsAt: new Date(Date.UTC(2027, 4, 1 + index % 31, index % 24)).toISOString(),
  }));
  const samples = { before: [] as number[], after: [] as number[] };
  for (let repetition = 0; repetition < 5; repetition++) {
    globalThis.gc?.();
    let started = performance.now();
    const original = before({ events, month: "2027-05" });
    samples.before.push(performance.now() - started);
    started = performance.now();
    const current = after({ events, month: "2027-05" });
    samples.after.push(performance.now() - started);
    if (!isDeepStrictEqual(original, current)) throw new Error("Calendar projection changed");
  }
  console.log(JSON.stringify({ kind: "calendar-preparation", node: process.version, baselineRef, events: size, equivalent: true,
    beforeMedianMs: Number(median(samples.before).toFixed(2)), afterMedianMs: Number(median(samples.after).toFixed(2)),
    speedup: Number((median(samples.before) / median(samples.after)).toFixed(1)),
  }));
}
for (const month of ["2028-02", "2027-12", "2028-01", "2027-06"]) {
  const events = ["2028-02-28T16:00:00.000Z", "2028-02-29T16:00:00.000Z", "2027-12-31T16:00:00.000Z"]
    .map((startsAt, index) => ({ id: `boundary-${index}`, startsAt }));
  if (!isDeepStrictEqual(before({ events, month }), after({ events, month }))) throw new Error(`Calendar boundary changed: ${month}`);
}

class MeasuredDatabase extends LocalD1Database {
  metrics = { reads: 0, batches: 0, batchStatements: 0, returnedRows: 0 };
  reset() { this.metrics = { reads: 0, batches: 0, batchStatements: 0, returnedRows: 0 }; }
  prepare(query: string) {
    const decorate = (statement: ReturnType<LocalD1Database["prepare"]>): typeof statement => new Proxy(statement, {
      get: (target, property, receiver) => {
        if (property === "bind") return (...values: unknown[]) => decorate(target.bind(...values));
        if (property === "first") return async <Row>() => {
          this.metrics.reads++; const result = await target.first<Row>(); this.metrics.returnedRows += result ? 1 : 0; return result;
        };
        if (property === "all") return async <Row>() => {
          this.metrics.reads++; const result = await target.all<Row>(); this.metrics.returnedRows += result.results.length; return result;
        };
        return Reflect.get(target, property, receiver);
      },
    });
    return decorate(super.prepare(query));
  }
  async batch<Row>(statements: Parameters<LocalD1Database["batch"]>[0]) {
    this.metrics.batches++; this.metrics.batchStatements += statements.length;
    return super.batch<Row>(statements);
  }
}
type Capabilities = EventCapabilities & { communications: CommunicationsRepository; birthdays: BirthdayRepository; evaluations: EvaluationRepository };
const database = new MeasuredDatabase(readdirSync("database/d1/migrations").filter((path) => path.endsWith(".sql")).sort());
const userId = "f1000000-0000-4000-8000-000000000001";
const tokenHash = "a".repeat(64);
try {
  database.exec(`INSERT INTO portal_users (id,firebase_uid,email,full_name) VALUES ('${userId}','benchmark-fixture','benchmark@unyon.test','Benchmark Fixture');
    INSERT INTO appointments (id,portal_user_id,role,starts_at) VALUES ('f2000000-0000-4000-8000-000000000001','${userId}','SUPER_ADMIN','2000-01-01T00:00:00.000Z');
    INSERT INTO portal_sessions (id,portal_user_id,token_hash,expires_at) VALUES ('f3000000-0000-4000-8000-000000000001','${userId}','${tokenHash}','2100-01-01T00:00:00.000Z');
    INSERT INTO member_universities (id,name,slug) VALUES ('f4000000-0000-4000-8000-000000000001','Benchmark University','benchmark-university');`);
  for (let index = 0; index < 1000; index++) {
    const id = `f5000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    const status = index % 2 ? "PUBLISHED" : "DRAFT";
    await database.prepare(`INSERT INTO events (id,title,description,category,status,starts_at,ends_at,location,created_by_portal_user_id,published_at)
      VALUES (?, ?, ?, 'Benchmark', ?, '2050-01-01T00:00:00.000Z','2050-01-01T02:00:00.000Z','Synthetic venue',?,?)`)
      .bind(id, `Synthetic upcoming event ${index}`, "Demonstration fixture ".repeat(25), status, userId, status === "PUBLISHED" ? "2020-01-01T00:00:00.000Z" : null).run();
    await database.prepare("INSERT INTO announcements (id,title,body,status,published_at) VALUES (?, ?, ?, ?, ?)")
      .bind(`f6000000-0000-4000-8000-${String(index).padStart(12, "0")}`, `Synthetic announcement ${index}`, "Demonstration fixture ".repeat(25), status, status === "PUBLISHED" ? "2020-01-01T00:00:00.000Z" : null).run();
  }
  for (let index = 0; index < 100; index++) {
    const id = `f7000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    await database.prepare(`INSERT INTO events (id,title,description,category,status,starts_at,ends_at,location,created_by_portal_user_id,published_at)
      VALUES (?, ?, 'Demonstration fixture', 'Benchmark','PUBLISHED','2020-01-01T00:00:00.000Z','2020-01-01T02:00:00.000Z','Synthetic venue',?,'2019-12-01T00:00:00.000Z')`)
      .bind(id, `Synthetic open evaluation ${index}`, userId).run();
    await database.prepare("UPDATE event_evaluation_windows SET closes_at = '2099-01-01T00:00:00.000Z' WHERE event_id = ?").bind(id).run();
  }
  for (let index = 2; index <= 50; index++) {
    const id = `f4000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    await database.prepare("INSERT INTO member_universities (id,name,slug) VALUES (?, ?, ?)").bind(id, `Benchmark University ${index}`, `benchmark-university-${index}`).run();
  }
  const resultEventId = "f7000000-0000-4000-8000-000000000000";
  const template = await database.prepare(`SELECT t.questions FROM event_evaluation_windows w
    JOIN evaluation_template_versions t ON t.id = w.template_id WHERE w.event_id = ?`).bind(resultEventId).first<{ questions: string }>();
  if (!template) throw new Error("Evaluation fixture template unavailable");
  const questions = JSON.parse(template.questions) as EvaluationQuestion[];
  for (let index = 0; index < 1000; index++) {
    const respondentId = index === 0 ? userId : `f8000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    if (index > 0) {
      await database.prepare("INSERT INTO portal_users (id,firebase_uid,email,full_name,status) VALUES (?, ?, ?, ?, ?)")
        .bind(respondentId, `benchmark-user-${index}`, `benchmark-${index}@unyon.test`, `Synthetic Respondent ${index}`, index < 500 ? "ACTIVE" : "DISABLED").run();
      const universityId = `f4000000-0000-4000-8000-${String(1 + index % 50).padStart(12, "0")}`;
      await database.prepare(`INSERT INTO appointments (id,portal_user_id,role,university_id,starts_at,ends_at)
        VALUES (?, ?, 'REPRESENTATIVE', ?, '2000-01-01T00:00:00.000Z', ?)`)
        .bind(`fa000000-0000-4000-8000-${String(index).padStart(12, "0")}`, respondentId, universityId, index < 500 ? null : "2025-01-01T00:00:00.000Z").run();
    }
    const responseId = `f9000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
    await database.prepare("INSERT INTO evaluation_responses (id,event_id,portal_user_id) VALUES (?, ?, ?)").bind(responseId, resultEventId, respondentId).run();
    for (const [position, question] of questions.entries()) {
      await database.prepare("INSERT INTO evaluation_answers (response_id,position,rating,comment) VALUES (?, ?, ?, ?)")
        .bind(responseId, position, question.kind === "RATING" ? 4 : null, question.kind === "COMMENT" ? "Synthetic capacity response" : null).run();
    }
  }
  const transactions = new D1TransactionRunner<Capabilities>(database as unknown as D1Database, (transaction) => ({
    events: new D1EventRepository(transaction), communications: new D1CommunicationsRepository(transaction),
    birthdays: new D1BirthdayRepository(transaction), evaluations: new D1EvaluationRepository(transaction),
  }));
  const dependencies = { sessions: { hashSessionToken: async () => tokenHash }, transactions };
  const events = createEventFeature(dependencies);
  const communications = createCommunicationsFeature(dependencies);
  const evaluations = createEvaluationFeature(dependencies);
  const birthdays = createBirthdayFeature({ ...dependencies, identityVerifier: { verifyIdToken: async () => { throw new Error("No identity operations in this benchmark"); } } });
  const sessions = new D1SessionRepository(database as unknown as D1Database);
  const request = (input: unknown = {}) => ({ input, sessionToken: "synthetic", correlationId: "portal-benchmark" });
  async function measure(label: string, work: () => Promise<unknown>) {
    database.reset();
    const started = performance.now();
    const result = await work();
    console.log(JSON.stringify({ kind: "feature-interface", label, ...database.metrics,
      logicalDatabaseCalls: database.metrics.reads + database.metrics.batches, localElapsedMs: Number((performance.now() - started).toFixed(2)), result,
    }));
  }
  await measure("events-page-administrator-composition", async () => {
    await sessions.resolve({ tokenHash, correlationId: "layout" });
    const workspace = await events.workspace(request({ view: "list" }));
    return { eventsReturned: workspace.events.length, hasNext: workspace.pagination.hasNext };
  });
  await measure("evaluations-page-100-open-windows", async () => {
    // The preserved newest-first ordering puts 500 future windows before these 100 open windows.
    const page = await evaluations.page(request({ pageSize: 100, page: 5 }));
    return { windowsReturned: page.records.length, canRespond: page.records.filter(({ canRespond }) => canRespond).length };
  });
  await measure("dashboard-composition", async () => {
    await sessions.resolve({ tokenHash, correlationId: "layout" });
    await sessions.resolve({ tokenHash, correlationId: "page" });
    const [eventRecords, announcementRecords, birthdayRecords, evaluationRecords] = await Promise.all([
      events.upcomingSummaries(request()), communications.recentAnnouncements(request()), birthdays.list(request({ month: 9 })), evaluations.openSummaries(request()),
    ]);
    return { eventsMaterialized: eventRecords.length, announcementsMaterialized: announcementRecords.length,
      birthdays: birthdayRecords.length, evaluationSummaries: evaluationRecords.length,
      eventProjectionBytes: Buffer.byteLength(JSON.stringify(eventRecords)), announcementProjectionBytes: Buffer.byteLength(JSON.stringify(announcementRecords)),
    };
  });
  await measure("evaluation-results-1000-responses", async () => {
    const result = await evaluations.results(request({ id: resultEventId }));
    return result.disclosure === "WITHHELD" ? { disclosure: result.disclosure } : {
      disclosure: result.disclosure, count: result.count, attributedResponses: result.responses.length,
    };
  });
} finally {
  database.close();
}
