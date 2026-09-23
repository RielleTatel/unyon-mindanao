import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AccessError, sessionCookieName, withSessionService } from "@/features/access/server";
import { withEventFeature } from "@/features/events/server";
import type { EventUniversityChoice } from "@/features/events/server";
import { EventWorkspace } from "@/features/events/ui/event-workspace";

export const dynamic = "force-dynamic";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string }>;
}) {
  const token = (await cookies()).get(sessionCookieName)?.value ?? "";
  let actor;

  try {
    actor = await withSessionService((sessions) => sessions.require(token, crypto.randomUUID()));
  } catch {
    redirect("/sign-in");
  }

  const query = await searchParams;
  const view = query.view === "calendar" ? "calendar" : "list";
  const dateParts = new Intl.DateTimeFormat("en-CA", {
    month: "2-digit", timeZone: "Asia/Manila", year: "numeric",
  }).formatToParts(new Date());
  const dateValues = Object.fromEntries(dateParts.map(({ type, value }) => [type, value]));
  const currentMonth = `${dateValues.year}-${dateValues.month}`;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/u.test(query.month ?? "") ? query.month! : currentMonth;
  const managesAnyEvent = actor.appointments.some(({ role }) => role === "SUPER_ADMIN" || role === "UNIVERSITY_ADMIN");
  const ownerUniversityIds = actor.appointments
    .filter(({ role, universityId }) => role === "UNIVERSITY_ADMIN" && universityId)
    .map(({ universityId }) => universityId!);
  let events;
  let universityChoices: EventUniversityChoice[] = [];

  try {
    events = await withEventFeature((feature) => feature.list({
      correlationId: crypto.randomUUID(),
      input: { includeArchived: false, search: "", upcomingOnly: false },
      sessionToken: token,
    }));
    if (managesAnyEvent) {
      universityChoices = await withEventFeature((feature) => feature.universityChoices({
        correlationId: crypto.randomUUID(),
        input: {},
        sessionToken: token,
      }));
    }
  } catch (error) {
    if (error instanceof AccessError && error.code === "AUTHENTICATION_REQUIRED") redirect("/sign-in");
    if (error instanceof AccessError && error.code === "NOT_FOUND_OR_FORBIDDEN") notFound();
    throw error;
  }

  return (
    <main className="min-h-svh bg-background px-4 py-7 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-7xl">
        <header className="mb-8 flex flex-wrap items-end justify-between gap-5 border-b border-primary/20 pb-6">
          <div>
            <Link className="text-sm font-bold text-primary underline-offset-4 hover:underline" href="/portal">← Workspace</Link>
            <p className="mt-5 mb-0 text-xs font-extrabold tracking-[0.14em] text-primary uppercase">Events</p>
            <h1 className="mt-2 mb-0 font-serif text-4xl font-medium tracking-[-0.04em] sm:text-5xl">Gather across Mindanao.</h1>
            <p className="mt-3 mb-0 max-w-2xl text-sm leading-6 text-muted-foreground">One calendar for Confederation and Member University events. Dates and times appear in Philippine time.</p>
          </div>
          <span className="rounded-full border border-primary/15 bg-card px-4 py-2 text-xs font-bold text-primary">Private portal calendar</span>
        </header>

        <EventWorkspace
          allowConfederation={actor.appointments.some(({ role }) => role === "SUPER_ADMIN")}
          canCreate={managesAnyEvent}
          events={events}
          month={month}
          ownerUniversityIds={ownerUniversityIds}
          universityChoices={universityChoices}
          view={view}
        />
      </div>
    </main>
  );
}
