import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AccessError, sessionCookieName } from "@/features/access/server";
import { withEventFeature } from "@/features/events/server";
import { EventControls, StatusPill } from "@/features/events/ui/event-workspace";
import { formatEventRange } from "@/features/events/format";
import { FileUpload, PrivateImage } from "@/features/private-files/ui/private-file-controls";
import { EventDetailsForm } from "@/features/events/ui/event-details-form";

export const dynamic = "force-dynamic";

export default async function EventDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const token = (await cookies()).get(sessionCookieName)?.value ?? "";
  let event;

  try {
    event = await withEventFeature((feature) => feature.get({
      correlationId: crypto.randomUUID(),
      input: { id },
      sessionToken: token,
    }));
  } catch (error) {
    if (error instanceof AccessError && error.code === "AUTHENTICATION_REQUIRED") redirect("/sign-in");
    if (error instanceof AccessError && (error.code === "NOT_FOUND_OR_FORBIDDEN" || error.code === "INVALID_INPUT")) notFound();
    throw error;
  }

  return (
    <main className="min-h-svh bg-background px-4 py-7 sm:px-8 sm:py-10">
      <article className="mx-auto max-w-4xl rounded-[2rem] border border-primary/15 bg-card p-6 shadow-[0_20px_60px_rgba(24,59,44,0.07)] sm:p-10">
        <Link className="text-sm font-bold text-primary underline-offset-4 hover:underline" href="/portal/events">← Events calendar</Link>
        <div className="mt-8 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="m-0 text-xs font-extrabold tracking-[0.14em] text-primary uppercase">{event.category} · {event.ownerUniversityName}</p>
            <h1 className="mt-3 mb-0 max-w-3xl font-serif text-4xl font-medium tracking-[-0.04em] sm:text-6xl">{event.title}</h1>
          </div>
          <StatusPill status={event.status} />
        </div>
        <p className="mt-7 whitespace-pre-line text-base leading-8 text-muted-foreground">{event.description}</p>
        {event.coverObjectId && <PrivateImage objectId={event.coverObjectId} alt={`${event.title} cover`} />}
        <dl className="mt-8 grid gap-4 rounded-2xl bg-[#f2f4e9] p-5 sm:grid-cols-2 sm:p-6">
          <div><dt className="text-xs font-extrabold tracking-[0.1em] text-primary uppercase">Date and time</dt><dd className="mt-2 mb-0 text-sm font-semibold">{formatEventRange(event)}</dd></div>
          <div><dt className="text-xs font-extrabold tracking-[0.1em] text-primary uppercase">Venue</dt><dd className="mt-2 mb-0 text-sm font-semibold">{event.location ?? "Online"}</dd></div>
          {event.onlineUrl ? <div><dt className="text-xs font-extrabold tracking-[0.1em] text-primary uppercase">Online access</dt><dd className="mt-2 mb-0 text-sm font-semibold"><a className="break-all text-primary underline" href={event.onlineUrl} rel="noreferrer" target="_blank">Join online ↗</a></dd></div> : null}
          {event.contactPerson ? <div><dt className="text-xs font-extrabold tracking-[0.1em] text-primary uppercase">Contact</dt><dd className="mt-2 mb-0 text-sm font-semibold">{event.contactPerson}</dd></div> : null}
          <div><dt className="text-xs font-extrabold tracking-[0.1em] text-primary uppercase">Co-hosts</dt><dd className="mt-2 mb-0 text-sm font-semibold">{event.coHosts.length ? event.coHosts.map(({ name }) => name).join(", ") : "No co-hosts listed"}</dd></div>
        </dl>
        {event.manageable ? <div className="mt-7 border-t border-primary/10 pt-6"><p className="mb-3 text-xs font-extrabold tracking-[0.12em] text-primary uppercase">Manage event</p><EventControls event={event} /></div> : null}
        {event.manageable && event.status !== "ARCHIVED" && <div className="mt-6"><h2 className="mb-3 font-semibold">Event cover</h2><FileUpload purpose="EVENT_COVER" resourceId={event.id} /></div>}
        {event.manageable && ["DRAFT", "PUBLISHED"].includes(event.status) && <EventDetailsForm key={`${event.id}-${event.version}`} event={event} />}
      </article>
    </main>
  );
}
