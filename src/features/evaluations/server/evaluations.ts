import "server-only";
import { z } from "zod";
import { AccessError, createProtectedOperationFactory, retryDatabaseTransactions, type PortalActor, type SessionService, type TransactionRunner } from "@/features/access/server";
import type { EvaluationAnswer, EvaluationQuestion, EvaluationRecord, EvaluationResults } from "../contracts";

export interface EvaluationSubject {
  id: string; kind: "EventEvaluation"; title: string; status: string; ownerUniversityId: string | null;
  endsAt: Date; opensAt: Date; closesAt: Date; closed: boolean; version: number;
  templateVersion: number; questions: EvaluationQuestion[];
}
export interface EvaluationRepository {
  list(): Promise<EvaluationSubject[]>;
  get(id: string): Promise<EvaluationSubject | null>;
  eligible(userId: string, at: Date): Promise<boolean>;
  response(eventId: string, userId: string): Promise<EvaluationRecord["response"]>;
  save(eventId: string, userId: string, version: number, answers: EvaluationAnswer[], now: Date): Promise<void>;
  window(id: string, version: number, closed: boolean, closesAt: Date): Promise<void>;
  templates(): Promise<{ id: string; version: number; questions: EvaluationQuestion[] }[]>;
  createTemplate(questions: EvaluationQuestion[]): Promise<void>;
  count(id: string): Promise<number>;
  results(id: string, attributable: boolean, questions: EvaluationQuestion[]): Promise<EvaluationResults>;
}
const idInput = z.object({ id: z.string().uuid() });
const questions = z.array(z.object({ label: z.string().trim().min(1).max(300), kind: z.enum(["RATING", "COMMENT"]) })).min(1).max(30).refine((items) => items.some(({ kind }) => kind === "RATING"));
const admin = (actor: PortalActor) => actor.appointments.some(({ role }) => role === "SUPER_ADMIN");
const resultsAllowed = (actor: PortalActor, subject: EvaluationSubject) => admin(actor) || actor.appointments.some(({ role, universityId }) => role === "UNIVERSITY_ADMIN" && universityId !== null && universityId === subject.ownerUniversityId);
const visible = (actor: PortalActor, subject: EvaluationSubject) => admin(actor) || ["PUBLISHED", "COMPLETED"].includes(subject.status) || resultsAllowed(actor, subject);
const isOpen = (subject: EvaluationSubject, now: Date) => !subject.closed && ["PUBLISHED", "COMPLETED"].includes(subject.status) && subject.opensAt <= now && subject.closesAt > now;

export function createEvaluationFeature(dependencies: { sessions: Pick<SessionService, "hashSessionToken">; transactions: TransactionRunner<{ evaluations: EvaluationRepository }> }) {
  const factory = createProtectedOperationFactory({ ...dependencies, transactions: retryDatabaseTransactions(dependencies.transactions) });
  const results = factory.query({ intent: "evaluation.results", input: idInput, resolveSubject: ({ transaction }, input) => transaction.capabilities.evaluations.get(input.id),
    authorize: ({ actor, subject }) => resultsAllowed(actor, subject),
    execute: async ({ actor, subject, transaction }): Promise<EvaluationResults> => {
      if (!admin(actor) && await transaction.capabilities.evaluations.count(subject.id) < 5) return { disclosure: "WITHHELD" };
      return transaction.capabilities.evaluations.results(subject.id, admin(actor), subject.questions);
    },
  });
  return {
    results,
    async exportCsv(request: { input: unknown; sessionToken: string; correlationId: string }) {
      const disclosure = await results(request);
      if (disclosure.disclosure === "WITHHELD") throw new AccessError("NOT_FOUND_OR_FORBIDDEN", "Results not available");
      const rows: (string | number)[][] = disclosure.disclosure === "ATTRIBUTABLE"
        ? [["Full name", "Email", ...disclosure.questions.map(({ label }) => label)], ...disclosure.responses.map((response) => [response.fullName, response.email, ...disclosure.questions.map((_, position) => { const answer = response.answers.find((item) => item.position === position); return answer?.rating ?? answer?.comment ?? ""; })])]
        : [["Question", "Average rating", "Anonymous comment"], ...disclosure.ratings.map((rating) => [disclosure.questions[rating.position].label, rating.average, ""]), ...disclosure.comments.map((comment) => [disclosure.questions[comment.position].label, "", comment.comment])];
      return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
    },
    list: factory.query({ intent: "evaluation.list", input: z.object({}), resolveSubject: async () => ({ id: "evaluations", kind: "EvaluationDirectory" }), authorize: () => true,
      execute: async ({ actor, transaction, occurredAt }): Promise<EvaluationRecord[]> => {
        const repository = transaction.capabilities.evaluations; const records: EvaluationRecord[] = [];
        for (const subject of await repository.list()) {
          if (!visible(actor, subject)) continue;
          records.push({ eventId: subject.id, title: subject.title, questions: subject.questions, templateVersion: subject.templateVersion, opensAt: subject.opensAt.toISOString(), closesAt: subject.closesAt.toISOString(), closed: subject.closed, version: subject.version, canRespond: isOpen(subject, occurredAt) && await repository.eligible(actor.portalUserId, subject.endsAt), canViewResults: resultsAllowed(actor, subject), response: await repository.response(subject.id, actor.portalUserId) });
        }
        return records;
      },
    }),
    submit: factory.mutation({ intent: "evaluation.submit", action: "evaluation.response_saved", input: idInput.extend({ version: z.number().int().min(0), answers: z.array(z.object({ position: z.number().int().min(0), rating: z.number().int().min(1).max(5).nullable(), comment: z.string().trim().max(2000).nullable() })).max(30) }),
      resolveSubject: async ({ transaction, actor, occurredAt }, input) => {
        const subject = await transaction.capabilities.evaluations.get(input.id);
        return subject ? { ...subject, eligible: isOpen(subject, occurredAt) && await transaction.capabilities.evaluations.eligible(actor.portalUserId, subject.endsAt) } : null;
      },
      authorize: ({ subject }) => subject.eligible,
      execute: async ({ transaction, subject, actor, occurredAt }, input) => {
        if (input.answers.length !== subject.questions.length || new Set(input.answers.map(({ position }) => position)).size !== subject.questions.length || subject.questions.some((question, position) => {
          const answer = input.answers.find((item) => item.position === position);
          return !answer || (question.kind === "RATING" ? answer.rating === null || answer.comment !== null : answer.rating !== null || answer.comment === null);
        })) throw new AccessError("INVALID_INPUT", "Answer every rating question using the assigned template");
        await transaction.capabilities.evaluations.save(subject.id, actor.portalUserId, input.version, input.answers, occurredAt);
        return { saved: true };
      },
    }),
    updateWindow: factory.mutation({ intent: "evaluation.window", action: "evaluation.window_updated", input: idInput.extend({ version: z.number().int().positive(), closed: z.boolean(), closesAt: z.iso.datetime({ offset: true }) }),
      resolveSubject: ({ transaction }, input) => transaction.capabilities.evaluations.get(input.id), authorize: ({ actor }) => admin(actor),
      execute: async ({ transaction, subject, occurredAt }, input) => {
        const closesAt = new Date(input.closesAt);
        if (closesAt <= subject.opensAt || (!input.closed && closesAt <= occurredAt) || subject.status === "CANCELLED") throw new AccessError("INVALID_INPUT", "Choose a future closing time for a non-cancelled Event");
        await transaction.capabilities.evaluations.window(subject.id, input.version, input.closed, closesAt); return { saved: true };
      },
    }),
    templates: factory.query({ intent: "evaluation.templates", input: z.object({}), resolveSubject: async () => ({ id: "templates", kind: "EvaluationTemplateDirectory" }), authorize: ({ actor }) => admin(actor), execute: ({ transaction }) => transaction.capabilities.evaluations.templates() }),
    createTemplate: factory.mutation({ intent: "evaluation.template.create", action: "evaluation.template_created", input: z.object({ questions }), resolveSubject: async () => ({ id: "templates", kind: "EvaluationTemplateDirectory" }), authorize: ({ actor }) => admin(actor), execute: async ({ transaction }, input) => { await transaction.capabilities.evaluations.createTemplate(input.questions); return { saved: true }; } }),
  };
}
function csvCell(value: string | number) { const text = String(value); return `"${(/^[\s]*[=+@\-]/u.test(text) ? "'" + text : text).replaceAll('"', '""')}"`; }
