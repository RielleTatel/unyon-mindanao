import "server-only";
import type { Prisma } from "#unyon-prisma-client";
import { AccessError } from "@/features/access/server";
import type { EvaluationAnswer, EvaluationQuestion, EvaluationResults } from "../contracts";
import type { EvaluationRepository, EvaluationSubject } from "./evaluations";

export class PrismaEvaluationRepository implements EvaluationRepository {
  private appointmentCache = new Map<string, Promise<{ startsAt: Date; endsAt: Date | null }[]>>();
  private responseCache = new Map<string, Promise<Map<string, NonNullable<Awaited<ReturnType<EvaluationRepository["response"]>>>>>>();
  constructor(private readonly transaction: Prisma.TransactionClient) {}
  async list() {
    return this.transaction.$queryRaw<EvaluationSubject[]>`SELECT e.id, 'EventEvaluation' AS kind, e.title, e.status, e.owner_university_id AS "ownerUniversityId", e.ends_at AS "endsAt", w.opens_at AS "opensAt", w.closes_at AS "closesAt", w.closed, w.version, t.version AS "templateVersion", t.questions FROM event_evaluation_windows w JOIN events e ON e.id = w.event_id JOIN evaluation_template_versions t ON t.id = w.template_id ORDER BY w.opens_at DESC`;
  }
  async get(id: string) { return (await this.list()).find((record) => record.id === id) ?? null; }
  async eligible(userId: string, at: Date) {
    if (!this.appointmentCache.has(userId)) this.appointmentCache.set(userId, this.transaction.appointment.findMany({ where: { portalUserId: userId }, select: { startsAt: true, endsAt: true } }));
    return (await this.appointmentCache.get(userId)!).some(({ startsAt, endsAt }) => startsAt <= at && (!endsAt || endsAt > at));
  }
  async response(eventId: string, userId: string) {
    if (!this.responseCache.has(userId)) this.responseCache.set(userId, this.transaction.evaluationResponse.findMany({ where: { portalUserId: userId }, select: { eventId: true, version: true, answers: { orderBy: { position: "asc" }, select: { position: true, rating: true, comment: true } } } }).then((rows) => new Map(rows.map(({ eventId, ...response }) => [eventId, response]))));
    return (await this.responseCache.get(userId)!).get(eventId) ?? null;
  }
  async save(eventId: string, userId: string, version: number, answers: EvaluationAnswer[], now: Date) {
    if (version === 0) {
      try { await this.transaction.evaluationResponse.create({ data: { eventId, portalUserId: userId, submittedAt: now, answers: { create: answers } } }); }
      catch (error) { if (typeof error === "object" && error && "code" in error && error.code === "P2002") throw new AccessError("CONFLICT", "Response already exists"); throw error; }
      return;
    }
    const existing = await this.transaction.evaluationResponse.findUnique({ where: { eventId_portalUserId: { eventId, portalUserId: userId } }, select: { id: true } });
    if (!existing) throw new AccessError("CONFLICT", "Response changed");
    const changed = await this.transaction.evaluationResponse.updateMany({ where: { id: existing.id, version }, data: { version: { increment: 1 } } });
    if (changed.count !== 1) throw new AccessError("CONFLICT", "Response changed");
    await this.transaction.evaluationAnswer.deleteMany({ where: { responseId: existing.id } });
    await this.transaction.evaluationAnswer.createMany({ data: answers.map((answer) => ({ ...answer, responseId: existing.id })) });
  }
  async window(id: string, version: number, closed: boolean, closesAt: Date) {
    const changed = await this.transaction.eventEvaluationWindow.updateMany({ where: { eventId: id, version }, data: { closed, closesAt, version: { increment: 1 } } });
    if (changed.count !== 1) throw new AccessError("CONFLICT", "Window changed");
  }
  async templates() { return (await this.transaction.evaluationTemplateVersion.findMany({ orderBy: { version: "desc" } })).map(({ id, version, questions }) => ({ id, version, questions: questions as unknown as EvaluationQuestion[] })); }
  async createTemplate(questions: EvaluationQuestion[]) {
    const latest = await this.transaction.evaluationTemplateVersion.aggregate({ _max: { version: true } });
    await this.transaction.evaluationTemplateVersion.create({ data: { version: (latest._max.version ?? 0) + 1, questions: questions.map((question) => ({ ...question })) } });
  }
  async count(id: string) { return this.transaction.evaluationResponse.count({ where: { eventId: id } }); }
  async results(id: string, attributable: boolean, questions: EvaluationQuestion[]): Promise<EvaluationResults> {
    const rows = await this.transaction.evaluationResponse.findMany({ where: { eventId: id }, select: { ...(attributable ? { portalUserId: true } : {}), answers: { select: { position: true, rating: true, comment: true } } } });
    const ratings = questions.flatMap((question, position) => {
      if (question.kind !== "RATING" || !rows.length) return [];
      return [{ position, average: rows.reduce((sum, row) => sum + (row.answers.find((answer) => answer.position === position)?.rating ?? 0), 0) / rows.length }];
    });
    const comments = rows.flatMap((row) => row.answers.flatMap((answer) => answer.comment ? [{ position: answer.position, comment: answer.comment }] : [])).sort((a, b) => a.position - b.position || a.comment.localeCompare(b.comment));
    const responses = [];
    if (attributable) for (const row of rows) {
      const user = await this.transaction.portalUser.findUniqueOrThrow({ where: { id: row.portalUserId }, select: { fullName: true, email: true } });
      responses.push({ ...user, answers: row.answers });
    }
    return { disclosure: attributable ? "ATTRIBUTABLE" : "ANONYMOUS", count: rows.length, questions, ratings, comments, responses };
  }
}
