import "server-only";

import { AccessError } from "@/features/access/server";
import type { D1BatchTransaction } from "@/features/access/server/d1-transaction-runner";
import type { EvaluationAnswer, EvaluationQuestion, EvaluationResults } from "../contracts";
import type { EvaluationRepository, EvaluationSubject } from "./evaluations";

interface EvaluationRow {
  id: string;
  kind: "EventEvaluation";
  title: string;
  status: string;
  owner_university_id: string | null;
  ends_at: string;
  opens_at: string;
  closes_at: string;
  closed: number;
  version: number;
  template_version: number;
  questions: string;
}

export class D1EvaluationRepository implements EvaluationRepository {
  private readonly responseCache = new Map<
    string,
    Promise<Map<string, NonNullable<Awaited<ReturnType<EvaluationRepository["response"]>>>>>
  >();

  constructor(private readonly transaction: D1BatchTransaction) {}

  async list() {
    const rows = await this.transaction.all<EvaluationRow>(
      `SELECT e.id, 'EventEvaluation' AS kind, e.title, e.status,
              e.owner_university_id, e.ends_at, w.opens_at, w.closes_at,
              w.closed, w.version, t.version AS template_version, t.questions
       FROM event_evaluation_windows AS w
       JOIN events AS e ON e.id = w.event_id
       JOIN evaluation_template_versions AS t ON t.id = w.template_id
       ORDER BY w.opens_at DESC`,
    );
    return rows.map(toSubject);
  }

  async get(id: string) {
    return (await this.list()).find((record) => record.id === id) ?? null;
  }

  async eligible(userId: string, at: Date) {
    const row = await this.transaction.first<{ eligible: number }>(
      `SELECT EXISTS (
         SELECT 1 FROM appointments
         WHERE portal_user_id = ? AND starts_at <= ?
           AND (ends_at IS NULL OR ends_at > ?)
       ) AS eligible`,
      userId,
      at.toISOString(),
      at.toISOString(),
    );
    return row?.eligible === 1;
  }

  async response(eventId: string, userId: string) {
    if (!this.responseCache.has(userId)) {
      this.responseCache.set(userId, this.responsesForUser(userId));
    }
    return (await this.responseCache.get(userId)!).get(eventId) ?? null;
  }

  async save(
    eventId: string,
    userId: string,
    version: number,
    answers: EvaluationAnswer[],
    now: Date,
  ) {
    const current = await this.transaction.first<{ id: string; version: number }>(
      `SELECT id, version FROM evaluation_responses
       WHERE event_id = ? AND portal_user_id = ?`,
      eventId,
      userId,
    );
    const nowIso = now.toISOString();
    if (version === 0) {
      if (current) throw new AccessError("CONFLICT", "Response already exists");
      const responseId = crypto.randomUUID();
      this.transaction.enqueue(
        `INSERT INTO evaluation_responses
          (id, event_id, portal_user_id, version, submitted_at, updated_at)
         VALUES (?, ?, ?, 1, ?, ?)`,
        responseId,
        eventId,
        userId,
        nowIso,
        nowIso,
      );
      for (const answer of answers) this.enqueueAnswer(responseId, answer);
      return;
    }
    if (!current || current.version !== version) {
      throw new AccessError("CONFLICT", "Response changed");
    }
    this.transaction.enqueueCheckedMutation(
      `UPDATE evaluation_responses
       SET version = version + 1, updated_at = ?
       WHERE id = ? AND version = ?`,
      nowIso,
      current.id,
      version,
    );
    this.transaction.enqueue(
      "DELETE FROM evaluation_answers WHERE response_id = ?",
      current.id,
    );
    for (const answer of answers) this.enqueueAnswer(current.id, answer);
  }

  async window(id: string, version: number, closed: boolean, closesAt: Date) {
    this.transaction.enqueueCheckedMutation(
      `UPDATE event_evaluation_windows
       SET closed = ?, closes_at = ?, version = version + 1
       WHERE event_id = ? AND version = ?`,
      closed ? 1 : 0,
      closesAt.toISOString(),
      id,
      version,
    );
  }

  async templates() {
    const rows = await this.transaction.all<{
      id: string;
      version: number;
      questions: string;
    }>(
      `SELECT id, version, questions FROM evaluation_template_versions
       ORDER BY version DESC`,
    );
    return rows.map(({ id, version, questions }) => ({
      id,
      version,
      questions: JSON.parse(questions) as EvaluationQuestion[],
    }));
  }

  async createTemplate(questions: EvaluationQuestion[]) {
    const latest = await this.transaction.first<{ version: number | null }>(
      "SELECT MAX(version) AS version FROM evaluation_template_versions",
    );
    const previousVersion = latest?.version ?? 0;
    const version = previousVersion + 1;
    this.transaction.enqueueGuard(
      `SELECT MAX(version) FROM evaluation_template_versions
       HAVING COALESCE(MAX(version), 0) = ?`,
      previousVersion,
    );
    this.transaction.enqueue(
      `INSERT INTO evaluation_template_versions (id, version, questions, created_at)
       VALUES (?, ?, ?, ?)`,
      crypto.randomUUID(),
      version,
      JSON.stringify(questions),
      this.transaction.occurredAt.toISOString(),
    );
  }

  async count(id: string) {
    const row = await this.transaction.first<{ count: number }>(
      "SELECT COUNT(*) AS count FROM evaluation_responses WHERE event_id = ?",
      id,
    );
    return row?.count ?? 0;
  }

  async results(
    id: string,
    attributable: boolean,
    questions: EvaluationQuestion[],
  ): Promise<EvaluationResults> {
    const rows = await this.transaction.all<{
      response_id: string;
      full_name: string | null;
      email: string | null;
      position: number | null;
      rating: number | null;
      comment: string | null;
    }>(
      `SELECT r.id AS response_id,
              ${attributable ? "u.full_name" : "NULL"} AS full_name,
              ${attributable ? "u.email" : "NULL"} AS email,
              a.position, a.rating, a.comment
       FROM evaluation_responses AS r
       LEFT JOIN evaluation_answers AS a ON a.response_id = r.id
       ${attributable ? "JOIN portal_users AS u ON u.id = r.portal_user_id" : ""}
       WHERE r.event_id = ?
       ORDER BY a.position ASC, r.id ASC`,
      id,
    );
    const byResponse = new Map<string, {
      fullName: string | null;
      email: string | null;
      answers: EvaluationAnswer[];
    }>();
    for (const row of rows) {
      const response = byResponse.get(row.response_id) ?? {
        email: row.email,
        fullName: row.full_name,
        answers: [],
      };
      if (row.position !== null) {
        response.answers.push({
          comment: row.comment,
          position: row.position,
          rating: row.rating,
        });
      }
      byResponse.set(row.response_id, response);
    }
    const responses = [...byResponse.values()];
    const ratings = questions.flatMap((question, position) => {
      if (question.kind !== "RATING" || responses.length === 0) return [];
      return [{
        position,
        average: responses.reduce(
          (sum, response) => sum + (response.answers.find((answer) => answer.position === position)?.rating ?? 0),
          0,
        ) / responses.length,
      }];
    });
    const comments = responses
      .flatMap((response) => response.answers.flatMap((answer) =>
        answer.comment ? [{ position: answer.position, comment: answer.comment }] : [],
      ))
      .sort((left, right) => left.position - right.position || left.comment.localeCompare(right.comment));

    return {
      comments,
      count: responses.length,
      disclosure: attributable ? "ATTRIBUTABLE" : "ANONYMOUS",
      questions,
      ratings,
      responses: attributable
        ? responses.map((response) => ({
            answers: response.answers,
            email: response.email!,
            fullName: response.fullName!,
          }))
        : [],
    };
  }

  async expireResponses(now: Date) {
    const cutoff = new Date(now);
    cutoff.setUTCFullYear(cutoff.getUTCFullYear() - 2);
    const expired = await this.transaction.first<{ count: number }>(
      `SELECT COUNT(*) AS count FROM evaluation_responses WHERE submitted_at < ?`,
      cutoff.toISOString(),
    );
    const count = expired?.count ?? 0;
    this.transaction.enqueueCheckedMutationWithCount(
      `DELETE FROM evaluation_responses WHERE submitted_at < ?`,
      count,
      cutoff.toISOString(),
    );
    return count;
  }

  private async responsesForUser(userId: string) {
    const rows = await this.transaction.all<{
      event_id: string;
      version: number;
      position: number | null;
      rating: number | null;
      comment: string | null;
    }>(
      `SELECT r.event_id, r.version, a.position, a.rating, a.comment
       FROM evaluation_responses AS r
       LEFT JOIN evaluation_answers AS a ON a.response_id = r.id
       WHERE r.portal_user_id = ? ORDER BY r.event_id, a.position`,
      userId,
    );
    const results = new Map<string, { version: number; answers: EvaluationAnswer[] }>();
    for (const row of rows) {
      const response = results.get(row.event_id) ?? { answers: [], version: row.version };
      if (row.position !== null) {
        response.answers.push({
          comment: row.comment,
          position: row.position,
          rating: row.rating,
        });
      }
      results.set(row.event_id, response);
    }
    return results;
  }

  private enqueueAnswer(responseId: string, answer: EvaluationAnswer) {
    this.transaction.enqueue(
      `INSERT INTO evaluation_answers (response_id, position, rating, comment)
       VALUES (?, ?, ?, ?)`,
      responseId,
      answer.position,
      answer.rating,
      answer.comment,
    );
  }
}

function toSubject(row: EvaluationRow): EvaluationSubject {
  return {
    closed: row.closed === 1,
    closesAt: new Date(row.closes_at),
    endsAt: new Date(row.ends_at),
    id: row.id,
    kind: row.kind,
    opensAt: new Date(row.opens_at),
    ownerUniversityId: row.owner_university_id,
    questions: JSON.parse(row.questions) as EvaluationQuestion[],
    status: row.status,
    templateVersion: row.template_version,
    title: row.title,
    version: row.version,
  };
}
