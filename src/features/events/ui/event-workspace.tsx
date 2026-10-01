import Link from "next/link";

import type { EventRecord, EventUniversityChoice } from "../contracts";
import { formatEventRange, manilaDateKey } from "../format";
import { EventControls, EventDraftForm } from "./event-forms";
import { primaryButton, secondaryButton } from "./event-styles";
import { Pagination } from "@/shared/ui/pagination";
import type { PageMetadata } from "@/shared/pagination";

const monthFormatter = new Intl.DateTimeFormat("en-PH", { month: "long", year: "numeric", timeZone: "Asia/Manila" });

export function EventWorkspace({
  canCreate,
  events,
  month,
  ownerUniversityIds,
  allowConfederation,
  universityChoices,
  view,
  pagination,
}: {
  canCreate: boolean;
  events: EventRecord[];
  month: string;
  ownerUniversityIds: string[];
  allowConfederation: boolean;
  universityChoices: EventUniversityChoice[];
  view: "list" | "calendar";
  pagination: PageMetadata;
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
        {view === "list" ? <Pagination href="/portal/events?view=list" pagination={pagination} /> : null}
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
      {event.manageable ? <EventControls event={{ id: event.id, version: event.version, status: event.status, canComplete: event.canComplete }} /> : null}
    </article>
  );
}

function Calendar({ events, month }: { events: EventRecord[]; month: string }) {
  const [year, monthNumber] = month.split("-").map(Number);
  const firstDay = new Date(Date.UTC(year!, monthNumber! - 1, 1)).getUTCDay();
  const dayCount = new Date(Date.UTC(year!, monthNumber!, 0)).getUTCDate();
  const eventsByDate = new Map<string, EventRecord[]>();
  for (const event of events) {
    const key = manilaDateKey(event.startsAt);
    if (!key.startsWith(`${month}-`)) continue;
    const dayEvents = eventsByDate.get(key);
    if (dayEvents) dayEvents.push(event);
    else eventsByDate.set(key, [event]);
  }
  const cells = Array.from({ length: Math.ceil((firstDay + dayCount) / 7) * 7 }, (_, index) => {
    const day = index - firstDay + 1;
    if (day < 1 || day > dayCount) return null;
    const key = `${month}-${String(day).padStart(2, "0")}`;
    return { day, events: eventsByDate.get(key) ?? [] };
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

function formatMonth(month: string) {
  const date = new Date(`${month}-01T00:00:00+08:00`);
  return monthFormatter.format(date);
}

function shiftMonth(month: string, offset: number) {
  const [year, monthNumber] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, monthNumber! - 1 + offset, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
