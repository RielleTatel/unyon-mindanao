"use client";

import { useActionState, useState } from "react";
import { eventAction, type EventActionState } from "@/app/portal/events/actions";
import type { EventRecord, EventUniversityChoice } from "../contracts";
import { fieldClass, primaryButton, secondaryButton } from "./event-styles";

const initialState: EventActionState = { error: null, message: null };

export function EventDraftForm({
  allowConfederation,
  ownerUniversityIds,
  universityChoices,
}: {
  allowConfederation: boolean;
  ownerUniversityIds: string[];
  universityChoices: EventUniversityChoice[];
}) {
  const [state, formAction, isPending] = useActionState(eventAction, initialState);
  const [ownerUniversityId, setOwnerUniversityId] = useState(ownerUniversityIds[0] ?? "");
  const ownerChoices = universityChoices.filter(({ id }) => ownerUniversityIds.includes(id));

  return (
    <aside className="h-fit rounded-3xl border border-primary/15 bg-card p-6 shadow-[0_14px_40px_rgba(24,59,44,0.06)]">
      <p className="m-0 text-xs font-extrabold tracking-[0.14em] text-primary uppercase">Event management</p>
      <h2 className="mt-3 mb-2 font-serif text-2xl font-medium">Create a draft</h2>
      <p className="mt-0 mb-5 text-sm leading-6 text-muted-foreground">Dates use Manila time. Drafts are private to the Confederation or Owning University until published.</p>
      <form action={formAction} className="grid gap-3">
        <input name="intent" type="hidden" value="create" />
        <label className="block text-sm font-semibold">Event title<input className={fieldClass} maxLength={180} minLength={3} name="title" required /></label>
        <label className="block text-sm font-semibold">Category<input className={fieldClass} maxLength={80} name="category" placeholder="Assembly, forum, workshop…" required /></label>
        <label className="block text-sm font-semibold">Description<textarea className={`${fieldClass} min-h-24 resize-y`} maxLength={5000} name="description" required rows={3} /></label>
        <label className="block text-sm font-semibold">Starts<input className={fieldClass} name="startsAt" required type="datetime-local" /></label>
        <label className="block text-sm font-semibold">Ends<input className={fieldClass} name="endsAt" required type="datetime-local" /></label>
        <label className="block text-sm font-semibold">Physical venue<input className={fieldClass} maxLength={300} name="location" placeholder="Building or venue" /></label>
        <label className="block text-sm font-semibold">Online link <span className="font-normal text-muted-foreground">(optional)</span><input className={fieldClass} maxLength={2000} name="onlineUrl" placeholder="https://…" type="url" /></label>
        <label className="block text-sm font-semibold">Contact person <span className="font-normal text-muted-foreground">(optional)</span><input className={fieldClass} maxLength={160} name="contactPerson" /></label>
        <label className="block text-sm font-semibold">Owner
          <select className={fieldClass} onChange={(event) => setOwnerUniversityId(event.target.value)} value={ownerUniversityId} name="ownerUniversityId">
            {allowConfederation ? <option value="">Unyon Mindanao</option> : null}
            {ownerChoices.map(({ id, name }) => <option key={id} value={id}>{name}</option>)}
          </select>
        </label>
        {universityChoices.length > 0 ? (
          <fieldset className="rounded-xl border border-primary/15 px-3 py-2">
            <legend className="px-1 text-sm font-semibold">Co-hosts <span className="font-normal text-muted-foreground">(optional)</span></legend>
            <div className="grid max-h-36 gap-2 overflow-y-auto py-1">
              {universityChoices.filter(({ id }) => id !== ownerUniversityId).map(({ id, name }) => (
                <label className="flex items-center gap-2 text-sm" key={id}>
                  <input className="accent-primary" name="coHostUniversityIds" type="checkbox" value={id} />{name}
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}
        <label className="flex items-center gap-2 py-1 text-sm font-semibold"><input className="h-4 w-4 accent-primary" name="allDay" type="checkbox" />All-day event</label>
        <ActionFeedback error={state.error} message={state.message} />
        <button className={primaryButton} disabled={isPending} type="submit">{isPending ? "Saving…" : "Save event draft"}</button>
      </form>
      <p className="mt-4 mb-0 text-xs leading-5 text-muted-foreground">Co-hosts receive attribution on the event. Publishing and editing authority stay with its owner.</p>
    </aside>
  );
}

type EventControlRecord = Pick<EventRecord, "id" | "version" | "status" | "canComplete">;

export function EventControls({ event }: { event: EventControlRecord }) {
  const actions = event.status === "DRAFT"
    ? [{ intent: "publish", label: "Publish event" }]
    : event.status === "PUBLISHED"
      ? [
          ...(event.canComplete ? [{ intent: "complete", label: "Mark complete" }] : []),
          { intent: "cancel", label: "Cancel event" },
        ]
      : ["CANCELLED", "COMPLETED"].includes(event.status)
        ? [{ intent: "archive", label: "Archive event" }]
        : [];

  return actions.length ? (
    <div className="mt-5 flex flex-wrap gap-2">
      {actions.map(({ intent, label }) => <TransitionForm event={event} intent={intent} key={intent} label={label} />)}
    </div>
  ) : null;
}

function TransitionForm({ event, intent, label }: { event: EventControlRecord; intent: string; label: string }) {
  const [state, formAction, isPending] = useActionState(eventAction, initialState);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-2">
      <input name="intent" type="hidden" value={intent} />
      <input name="id" type="hidden" value={event.id} />
      <input name="version" type="hidden" value={event.version} />
      <button className={secondaryButton} disabled={isPending} type="submit">{isPending ? "Saving…" : label}</button>
      <ActionFeedback error={state.error} message={state.message} />
    </form>
  );
}

function ActionFeedback({ error, message }: EventActionState) {
  if (error) return <p className="m-0 text-sm font-semibold text-destructive" role="alert">{error}</p>;
  if (message) return <p className="m-0 text-sm font-semibold text-primary" role="status">{message}</p>;
  return null;
}
