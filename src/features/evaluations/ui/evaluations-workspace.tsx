"use client";
import { useActionState } from "react";
import Link from "next/link";
import { evaluationAction } from "@/app/portal/evaluations/actions";
import type { EvaluationRecord } from "../contracts";

export function EvaluationsWorkspace({ records, canManage }: { records: EvaluationRecord[]; canManage: boolean }) {
  const [state, action, pending] = useActionState(evaluationAction, { message: "" });
  return <div className="space-y-8"><p role="status">{state.message}</p>
    {canManage && <details className="border-b py-5"><summary className="cursor-pointer font-semibold">Create Evaluation Template version</summary><form action={action} className="mt-4 grid gap-4"><input type="hidden" name="intent" value="template" /><p className="text-sm">Newly published Events use the newest template. Existing Event snapshots stay unchanged.</p><label>Required rating questions (one per line)<textarea className="block w-full border p-2" name="ratings" required /></label><label>Optional comment prompts (one per line)<textarea className="block w-full border p-2" name="comments" /></label><button disabled={pending} className="border px-4 py-2">Save new template version</button></form></details>}
    {!records.length && <p>Evaluations appear after an Event is published and open when it ends.</p>}
    {records.map((record) => <article key={record.eventId} className="space-y-4 border-b py-6"><h2 className="font-serif text-2xl">{record.title}</h2><p className="text-sm text-muted-foreground">Template {record.templateVersion} · {format(record.opensAt)} – {format(record.closesAt)} · {record.closed ? "Closed by administrator" : "Scheduled window"}</p>
      {record.canRespond ? <form action={action} className="grid gap-4"><input type="hidden" name="intent" value="submit" /><input type="hidden" name="id" value={record.eventId} /><input type="hidden" name="version" value={record.response?.version ?? 0} />
        {record.questions.map((question, position) => { const answer = record.response?.answers.find((item) => item.position === position); return <label key={position}>{question.label}{question.kind === "RATING" ? <select className="ml-3 border p-2" name={`rating-${position}`} required defaultValue={answer?.rating ?? ""}><option value="">Choose 1–5</option>{[1, 2, 3, 4, 5].map((rating) => <option key={rating}>{rating}</option>)}</select> : <textarea className="block w-full border p-2" name={`comment-${position}`} maxLength={2000} defaultValue={answer?.comment ?? ""} />}</label>; })}<button disabled={pending} className="w-fit border px-4 py-2">{record.response ? "Update response" : "Submit evaluation"}</button>
      </form> : <p className="text-sm">{record.response ? "Your response is saved. Editing is closed." : "Not currently open for your response."}</p>}
      {record.canViewResults && <Link className="inline-block underline" href={`/portal/evaluations/${record.eventId}/results`}>View results</Link>}
      {canManage && <details><summary className="cursor-pointer">Manage evaluation window</summary><form action={action} className="mt-4 flex flex-wrap items-end gap-4"><input type="hidden" name="intent" value="window" /><input type="hidden" name="id" value={record.eventId} /><input type="hidden" name="version" value={record.version} /><label>Closes at (Manila)<input className="block border p-2" type="datetime-local" name="closesAt" required defaultValue={new Date(new Date(record.closesAt).getTime() + 8 * 3600000).toISOString().slice(0, 16)} /></label><label><input type="checkbox" name="closed" defaultChecked={record.closed} /> Closed by administrator</label><button disabled={pending} className="border px-4 py-2">Save window</button></form></details>}
    </article>)}
  </div>;
}
function format(value: string) { return new Date(value).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" }); }
