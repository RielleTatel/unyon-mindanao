import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AccessError, sessionCookieName } from "@/features/access/server";
import { withEventFeature } from "@/features/events/server";
import { manilaDateKey } from "@/features/events/format";
import { EventWorkspace } from "@/features/events/ui/event-workspace";

export const dynamic = "force-dynamic";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string; page?: string; pageSize?: string }>;
}) {
  const token = (await cookies()).get(sessionCookieName)?.value ?? "";
  const query = await searchParams;
  const view = query.view === "calendar" ? "calendar" : "list";
  const currentMonth = manilaDateKey(new Date().toISOString()).slice(0, 7);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/u.test(query.month ?? "") ? query.month! : currentMonth;
  let workspace;

  try {
    workspace = await withEventFeature((feature) => feature.workspace({
      correlationId: crypto.randomUUID(),
      input: { includeArchived: false, search: "", upcomingOnly: false, view, month,
        page: Number(query.page ?? 0), pageSize: Number(query.pageSize ?? 50) },
      sessionToken: token,
    }));
  } catch (error) {
    if (error instanceof AccessError && error.code === "AUTHENTICATION_REQUIRED") redirect("/sign-in");
    if (error instanceof AccessError && ["NOT_FOUND_OR_FORBIDDEN", "INVALID_INPUT"].includes(error.code)) notFound();
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
          {...workspace}
          month={month}
          view={view}
        />
      </div>
    </main>
  );
}
