import Link from "next/link";
import type { EvaluationRecord } from "../contracts";
import { EvaluationActions, EvaluationResponseForm, EvaluationTemplateForm, EvaluationWindowForm } from "./evaluation-forms";

const formatter = new Intl.DateTimeFormat("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" });

export function EvaluationsWorkspace({ records, canManage }: { records: EvaluationRecord[]; canManage: boolean }) {
  return <EvaluationActions>
    {canManage && <EvaluationTemplateForm />}
    {!records.length && <p>Evaluations appear after an Event is published and open when it ends.</p>}
    {records.map((record) => <article key={record.eventId} className="space-y-4 border-b py-6"><h2 className="font-serif text-2xl">{record.title}</h2><p className="text-sm text-muted-foreground">Template {record.templateVersion} · {formatter.format(new Date(record.opensAt))} – {formatter.format(new Date(record.closesAt))} · {record.closed ? "Closed by administrator" : "Scheduled window"}</p>
      {record.canRespond ? <EvaluationResponseForm record={{ eventId: record.eventId, questions: record.questions, response: record.response }} /> : <p className="text-sm">{record.response ? "Your response is saved. Editing is closed." : "Not currently open for your response."}</p>}
      {record.canViewResults && <Link className="inline-block underline" href={`/portal/evaluations/${record.eventId}/results`}>View results</Link>}
      {canManage && <EvaluationWindowForm record={{ eventId: record.eventId, version: record.version, closesAt: record.closesAt, closed: record.closed }} />}
    </article>)}
  </EvaluationActions>;
}
