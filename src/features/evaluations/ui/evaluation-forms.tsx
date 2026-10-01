"use client";

import { createContext, useActionState, useContext, type ReactNode } from "react";
import { evaluationAction } from "@/app/portal/evaluations/actions";
import type { EvaluationRecord } from "../contracts";

const ActionContext = createContext<{ action: (form: FormData) => void; pending: boolean } | null>(null);

export function EvaluationActions({ children }: { children: ReactNode }) {
  const [state, action, pending] = useActionState(evaluationAction, { message: "" });
  return <ActionContext.Provider value={{ action, pending }}><div className="space-y-8"><p role="status">{state.message}</p>{children}</div></ActionContext.Provider>;
}

function useEvaluationAction() {
  const context = useContext(ActionContext);
  if (!context) throw new Error("Evaluation actions unavailable");
  return context;
}

export function EvaluationTemplateForm() {
  const { action, pending } = useEvaluationAction();
  return <details className="border-b py-5"><summary className="cursor-pointer font-semibold">Create Evaluation Template version</summary><form action={action} className="mt-4 grid gap-4"><input type="hidden" name="intent" value="template" /><p className="text-sm">Newly published Events use the newest template. Existing Event snapshots stay unchanged.</p><label>Required rating questions (one per line)<textarea className="block w-full border p-2" name="ratings" required /></label><label>Optional comment prompts (one per line)<textarea className="block w-full border p-2" name="comments" /></label><button disabled={pending} className="border px-4 py-2">Save new template version</button></form></details>;
}

export function EvaluationResponseForm({ record }: { record: Pick<EvaluationRecord, "eventId" | "questions" | "response"> }) {
  const { action, pending } = useEvaluationAction();
  return <form action={action} className="grid gap-4"><input type="hidden" name="intent" value="submit" /><input type="hidden" name="id" value={record.eventId} /><input type="hidden" name="version" value={record.response?.version ?? 0} />
    {record.questions.map((question, position) => { const answer = record.response?.answers.find((item) => item.position === position); return <label key={position}>{question.label}{question.kind === "RATING" ? <select className="ml-3 border p-2" name={`rating-${position}`} required defaultValue={answer?.rating ?? ""}><option value="">Choose 1–5</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating}>{rating}</option>)}</select> : <textarea className="block w-full border p-2" name={`comment-${position}`} maxLength={2000} defaultValue={answer?.comment ?? ""} />}</label>; })}<button disabled={pending} className="w-fit border px-4 py-2">{record.response ? "Update response" : "Submit evaluation"}</button>
  </form>;
}

export function EvaluationWindowForm({ record }: { record: Pick<EvaluationRecord, "eventId" | "version" | "closesAt" | "closed"> }) {
  const { action, pending } = useEvaluationAction();
  return <details><summary className="cursor-pointer">Manage evaluation window</summary><form action={action} className="mt-4 flex flex-wrap items-end gap-4"><input type="hidden" name="intent" value="window" /><input type="hidden" name="id" value={record.eventId} /><input type="hidden" name="version" value={record.version} /><label>Closes at (Manila)<input className="block border p-2" type="datetime-local" name="closesAt" required defaultValue={new Date(new Date(record.closesAt).getTime() + 8 * 3600000).toISOString().slice(0, 16)} /></label><label><input type="checkbox" name="closed" defaultChecked={record.closed} /> Closed by administrator</label><button disabled={pending} className="border px-4 py-2">Save window</button></form></details>;
}
