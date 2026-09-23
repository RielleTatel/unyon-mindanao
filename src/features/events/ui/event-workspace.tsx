"use client";

import Link from "next/link";
import { useActionState, useState } from "react";

import { eventAction, type EventActionState } from "@/app/portal/events/actions";
import type { EventRecord, EventUniversityChoice } from "../contracts";
import { formatEventRange } from "../format";

const initialState: EventActionState = { error: null, message: null };
const fieldClass =
  "mt-1 block min-h-11 w-full rounded-xl border border-primary/20 bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const primaryButton =
  "inline-flex min-h-10 items-center justify-center rounded-xl bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60";
const secondaryButton =
  "inline-flex min-h-10 items-center justify-center rounded-xl border border-primary/25 px-4 py-2 text-sm font-bold text-primary transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-wait disabled:opacity-60";

export function EventWorkspace({
  canCreate,
  events,
  month,
  ownerUniversityIds,
  allowConfederation,
  universityChoices,
  view,
}: {
  canCreate: boolean;
  events: EventRecord[];
  month: string;
  ownerUniversityIds: string[];
  allowConfederation: boolean;
  universityChoices: EventUniversityChoice[];
  view: "list" | "calendar";
}) {
  const countLabel = `${events.length} ${events.length === 1 ? "event" : "events"}`;

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
      <section aria-labelledby="events-heading">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="m-0 text-xs font-extrabold tracking-[0.14em] text-primary uppercase">Confederation calendar</p>
            <h2 className="mt-2 mb-0 font-serif text-3xl font-medium tracking-[-0.03em]" id="events-heading">
              {view === "calendar" ? formatMonth(month) : "All events"}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <span className="mr-1 text-xs font-semibold text-muted-foreground">{countLabel}</span>
            <Link className={view === "list" ? primaryButton : secondaryButton} href="/portal/events?view=list">List</Link>
            <Link className={view === "calendar" ? primaryButton : secondaryButton} href={`/portal/events?view=calendar&month=${month}`}>Calendar</Link>
          </div>
        </div>

        {view === "calendar" ? (
          <Calendar events={events} month={month} />
        ) : events.length === 0 ? (
          <div className="rounded-3xl border border-dashed border-primary/25 bg-card/70 px-6 py-14 text-center">
            <p className="m-0 font-serif text-2xl">Your calendar is ready.</p>
            <p className="mt-3 mb-0 text-sm text-muted-foreground">Published events will appear here. Administrators can draft the first one.</p>
          </div>
        ) : (
          <ul className="m-0 grid list-none gap-4 p-0">
            {events.map((event) => <li key={event.id}><EventCard event={event} /></li>)}
          </ul>
        )}
      </section>

      {canCreate ? (
        <EventDraftForm allowConfederation={allowConfederation} ownerUniversityIds={ownerUniversityIds} universityChoices={universityChoices} />
      ) : (
        <aside className="h-fit rounded-3xl border border-primary/15 bg-[#f2f4e9] p-6">
          <p className="m-0 text-xs font-extrabold tracking-[0.14em] text-primary uppercase">Your access</p>
          <h2 className="mt-3 mb-3 font-serif text-2xl font-medium">View and evaluate</h2>
          <p className="m-0 text-sm leading-6 text-muted-foreground">Published Confederation and Member University events are visible to your active Appointment.</p>
        </aside>
      )}
    </div>
  );
}

function EventDraftForm({
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

function EventCard({ event }: { event: EventRecord }) {
  return (
    <article className="rounded-3xl border border-primary/15 bg-card p-5 shadow-[0_14px_40px_rgba(24,59,44,0.05)] sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="m-0 text-xs font-extrabold tracking-[0.12em] text-primary uppercase">{event.category} · {event.ownerUniversityName}</p>
          <h3 className="mt-2 mb-0 text-xl font-bold"><Link className="text-foreground underline-offset-4 hover:text-primary hover:underline" href={`/portal/events/${event.id}`}>{event.title}</Link></h3>
        </div>
        <StatusPill status={event.status} />
      </div>
      <p className="mt-3 mb-0 max-w-3xl text-sm leading-6 text-muted-foreground">{event.description}</p>
      <div className="mt-5 grid gap-2 border-t border-primary/10 pt-4 text-sm sm:grid-cols-2">
        <p className="m-0"><span className="font-semibold">When:</span> {formatEventRange(event)}</p>
        <p className="m-0"><span className="font-semibold">Where:</span> {event.location ?? "Online"}</p>
        {event.coHosts.length ? <p className="m-0 sm:col-span-2"><span className="font-semibold">Co-hosted with:</span> {event.coHosts.map(({ name }) => name).join(", ")}</p> : null}
      </div>
      {event.manageable ? <EventControls event={event} /> : null}
    </article>
  );
}

export function EventControls({ event }: { event: EventRecord }) {
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

function TransitionForm({ event, intent, label }: { event: EventRecord; intent: string; label: string }) {
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

function Calendar({ events, month }: { events: EventRecord[]; month: string }) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year!, monthNumber! - 1, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
  const cells = Array.from({ length: Math.ceil((firstDay + dayCount) / 7) * 7 }, (_, index) => {
    const day = index - firstDay + 1;
    if (day < 1 || day > dayCount) return null;
    const key = `${month}-${String(day).padStart(2, "0")}`;
    return { day, events: events.filter((event) => manilaDateKey(event.startsAt) === key) };
  });
  const previous = shiftMonth(month, -1);
  const next = shiftMonth(month, 1);

  return (
    <div className="overflow-hidden rounded-3xl border border-primary/15 bg-card">
      <div className="flex items-center justify-between border-b border-primary/10 px-4 py-3">
        <Link aria-label="Previous month" className={secondaryButton} href={`/portal/events?view=calendar&month=${previous}`}>←</Link>
        <p className="m-0 font-semibold">{formatMonth(month)}</p>
        <Link aria-label="Next month" className={secondaryButton} href={`/portal/events?view=calendar&month=${next}`}>→</Link>
      </div>
      <div className="grid grid-cols-7 border-b border-primary/10 bg-[#f2f4e9] text-center text-[0.68rem] font-bold text-primary sm:text-xs">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <div className="py-2" key={day}>{day}</div>)}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((cell, index) => (
          <div className="min-h-20 border-r border-b border-primary/10 p-1.5 sm:min-h-28 sm:p-2" key={`${month}-${index}`}>
            {cell ? <>
              <span className="text-xs font-semibold text-muted-foreground">{cell.day}</span>
              <div className="mt-1 grid gap-1">
                {cell.events.slice(0, 3).map((event) => <Link className="truncate rounded-md bg-[#e7efdc] px-1.5 py-1 text-[0.65rem] font-semibold leading-tight text-primary no-underline hover:bg-[#dce8cd] sm:text-xs" href={`/portal/events/${event.id}`} key={event.id}>{event.title}</Link>)}
                {cell.events.length > 3 ? <span className="text-[0.65rem] text-muted-foreground">+{cell.events.length - 3} more</span> : null}
              </div>
            </> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

export function StatusPill({ status }: { status: EventRecord["status"] }) {
  const styles: Record<EventRecord["status"], string> = {
    ARCHIVED: "bg-muted text-muted-foreground",
    CANCELLED: "bg-red-100 text-red-800",
    COMPLETED: "bg-[#e7efdc] text-primary",
    DRAFT: "bg-[#f4ecd6] text-[#785d22]",
    PUBLISHED: "bg-[#dcefe8] text-[#205d46]",
  };
  return <span className={`rounded-full px-3 py-1 text-xs font-bold ${styles[status]}`}>{status.toLowerCase()}</span>;
}

function ActionFeedback({ error, message }: EventActionState) {
  if (error) return <p className="m-0 text-sm font-semibold text-destructive" role="alert">{error}</p>;
  if (message) return <p className="m-0 text-sm font-semibold text-primary" role="status">{message}</p>;
  return null;
}

function formatMonth(month: string) {
  const date = new Date(`${month}-01T00:00:00+08:00`);
  return new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "Asia/Manila" }).format(date);
}

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, monthNumber! - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function manilaDateKey(isoDate: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit", month: "2-digit", timeZone: "Asia/Manila", year: "numeric",
  }).formatToParts(new Date(isoDate));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}
