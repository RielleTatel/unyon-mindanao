import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight, CalendarDays, ShieldCheck, UsersRound, Waves } from "lucide-react";

import { AccessError, sessionCookieName, withSessionService } from "@/features/access/server";
import { SignOutButton } from "@/features/access/ui/sign-out-button";
import { loadDashboard } from "@/features/dashboard/server";

export const dynamic = "force-dynamic";

export default async function PortalPage() {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value;
  let actor;

  try {
    actor = await withSessionService((sessions) => sessions.require(sessionToken ?? "", crypto.randomUUID()));
  } catch {
    redirect("/sign-in");
  }

  let dashboard;
  try {
    dashboard = await loadDashboard(sessionToken ?? "");
  } catch (error) {
    if (error instanceof AccessError && error.code === "AUTHENTICATION_REQUIRED") redirect("/sign-in");
    throw error;
  }

  const isSuperAdmin = actor.appointments.some(({ role }) => role === "SUPER_ADMIN");
  const isUniversityAdmin = actor.appointments.some(({ role }) => role === "UNIVERSITY_ADMIN");
  const upcomingEvents = dashboard.events;

  return (
    <main className="min-h-svh bg-[#fafaf6] px-4 py-5 sm:px-8 sm:py-8">
      <div className="mx-auto max-w-5xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-primary/15 pb-5">
          <Link className="flex items-center gap-3 text-foreground no-underline" href="/portal">
            <Waves aria-hidden="true" size={22} />
            <span><span className="block text-[0.65rem] font-bold tracking-[0.17em] text-primary">PRIVATE PORTAL</span><span className="text-sm font-extrabold tracking-[0.1em]">UNYON MINDANAO</span></span>
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <nav aria-label="Portal navigation" className="flex flex-wrap items-center gap-1">
              <Link className="rounded-lg bg-[#e7efdc] px-3 py-2 text-xs font-bold text-primary no-underline" href="/portal">Home</Link>
              <Link className="rounded-lg px-3 py-2 text-xs font-bold text-foreground no-underline hover:bg-muted" href="/portal/events">Events</Link>
              <Link className="rounded-lg px-3 py-2 text-xs font-bold text-foreground no-underline hover:bg-muted" href="/portal/birthdays">Birthdays</Link>
              <Link className="rounded-lg px-3 py-2 text-xs font-bold text-foreground no-underline hover:bg-muted" href="/portal/announcements">Announcements</Link>
              <Link className="rounded-lg px-3 py-2 text-xs font-bold text-foreground no-underline hover:bg-muted" href="/portal/shortcuts">Shortcuts</Link>
              <Link className="px-3 py-2 text-xs font-bold hover:underline" href="/portal/financial-reports">Financial Reports</Link>
              <Link className="px-3 py-2 text-xs font-bold hover:underline" href="/portal/profile">Profile</Link>
              <Link className="px-3 py-2 text-xs font-bold hover:underline" href="/portal/evaluations">Evaluations</Link>
              {isUniversityAdmin || isSuperAdmin ? <Link className="rounded-lg px-3 py-2 text-xs font-bold text-foreground no-underline hover:bg-muted" href="/portal/team">Team</Link> : null}
              {isSuperAdmin ? <Link className="rounded-lg px-3 py-2 text-xs font-bold text-foreground no-underline hover:bg-muted" href="/portal/universities">Directory</Link> : null}
              {isSuperAdmin ? <Link className="px-3 py-2 text-xs font-bold hover:underline" href="/portal/accounts">Accounts</Link> : null}
            </nav>
            <SignOutButton />
          </div>
        </header>

        <section className="grid gap-8 py-9 sm:py-14 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <div>
            <p className="mb-4 flex items-center gap-2 text-xs font-extrabold tracking-[0.15em] text-primary uppercase"><ShieldCheck aria-hidden="true" size={17} />Authorized portal session</p>
            <h1 className="m-0 max-w-3xl font-serif text-4xl leading-tight font-medium tracking-tight sm:text-5xl">Welcome to your Confederation workspace.</h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">Signed in as <span className="font-semibold text-foreground">{actor.email}</span>. Your current Appointment determines what you can manage and see.</p>
            <Link className="mt-7 inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 py-2 text-sm font-bold text-primary-foreground no-underline transition-colors hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring" href="/portal/events"><CalendarDays aria-hidden="true" size={17} />Open events calendar<ArrowUpRight aria-hidden="true" size={16} /></Link>
          </div>

          <aside className="h-fit border-t border-primary/15 pt-5 lg:border-t-0 lg:border-l lg:pl-6">
            <div className="flex items-center justify-between"><p className="m-0 text-xs font-extrabold tracking-[0.12em] text-primary uppercase">Your appointments</p><UsersRound aria-hidden="true" className="text-primary" size={18} /></div>
            <div className="mt-4 grid gap-3">
              {actor.appointments.map((appointment) => (
                <article className="py-2" key={appointment.id}>
                  <h2 className="m-0 text-sm font-extrabold tracking-[0.08em]">{appointment.role.replaceAll("_", " ")}</h2>
                  <p className="mt-2 mb-0 text-xs leading-5 text-muted-foreground">{appointment.universityId ? "Scoped to a Member University" : "Confederation-wide authority"}</p>
                </article>
              ))}
            </div>
            {isSuperAdmin ? <Link className="mt-4 inline-flex text-sm font-bold text-primary underline-offset-4 hover:underline" href="/portal/universities">Manage Member Universities <ArrowUpRight aria-hidden="true" className="ml-1" size={15} /></Link> : null}
          </aside>
        </section>
        <section className="border-t border-primary/15 py-8" aria-labelledby="recent-announcements"><div className="flex items-center justify-between gap-4"><h2 id="recent-announcements" className="font-serif text-3xl">Recent Announcements</h2><Link className="text-sm underline" href="/portal/announcements">View all</Link></div>{dashboard.announcements.length ? dashboard.announcements.map((announcement) => <article key={announcement.id} className="border-b border-primary/10 py-5"><h3 className="font-semibold">{announcement.title}</h3><p className="mt-2 text-sm leading-6 text-muted-foreground">{announcement.excerpt}</p></article>) : <p className="py-5 text-sm text-muted-foreground">No recent Announcements.</p>}</section>
        <section className="border-t border-primary/15 py-8" aria-labelledby="monthly-birthdays"><div className="flex items-center justify-between gap-4"><h2 id="monthly-birthdays" className="font-serif text-3xl">Birthdays this month</h2><Link className="text-sm underline" href="/portal/birthdays">Birthday calendar</Link></div>{dashboard.birthdays.length ? <ul className="divide-y divide-primary/10">{dashboard.birthdays.map((birthday) => <li key={birthday.portalUserId} className="flex gap-5 py-3"><span className="w-8 text-muted-foreground">{birthday.day}</span><span>{birthday.fullName}</span></li>)}</ul> : <p className="py-5 text-sm text-muted-foreground">No birthdays recorded this month.</p>}</section>
        <section className="border-t border-primary/15 py-8" aria-labelledby="open-evaluations"><div className="flex items-center justify-between gap-4"><h2 id="open-evaluations" className="font-serif text-3xl">Open Evaluations</h2><Link className="text-sm underline" href="/portal/evaluations">View Evaluations</Link></div>{dashboard.evaluations.length ? <ul className="divide-y divide-primary/10">{dashboard.evaluations.map((evaluation) => <li key={evaluation.eventId} className="py-4"><p className="font-semibold">{evaluation.title}</p><p className="text-sm text-muted-foreground">{evaluation.submitted ? "Response saved — you can still edit" : "Awaiting your feedback"} · Closes {formatEventStart(evaluation.closesAt, false)}</p></li>)}</ul> : <p className="py-5 text-sm text-muted-foreground">No Evaluations currently awaiting your feedback.</p>}</section>

        <section aria-labelledby="upcoming-events" className="border-t border-primary/15 py-8 sm:py-10">
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <div><p className="m-0 text-xs font-extrabold tracking-[0.14em] text-[#8b6c2b] uppercase">Across the network</p><h2 className="mt-2 mb-0 font-serif text-3xl font-medium tracking-[-0.03em]" id="upcoming-events">Upcoming events</h2></div>
            <Link className="text-sm font-bold text-primary underline-offset-4 hover:underline" href="/portal/events">View calendar →</Link>
          </div>
          {upcomingEvents.length ? (
            <div className="divide-y divide-primary/15">
              {upcomingEvents.map((event) => <Link className="group block py-5 text-foreground no-underline" href={`/portal/events/${event.id}`} key={event.id}>
                <p className="m-0 text-xs font-extrabold tracking-[0.12em] text-primary uppercase">{event.category} · {event.ownerUniversityName}</p>
                <h3 className="mt-2 mb-0 text-lg font-bold group-hover:text-primary">{event.title}</h3>
                <p className="mt-3 mb-0 text-sm text-muted-foreground">{formatEventStart(event.startsAt, event.allDay)}</p>
              </Link>)}
            </div>
          ) : (
            <p className="py-5 text-sm text-muted-foreground">No upcoming events yet. Published events will appear here.</p>
          )}
        </section>
      </div>
    </main>
  );
}

function formatEventStart(value: string, allDay: boolean) {
  return new Intl.DateTimeFormat("en-PH", {
    ...(allDay ? { dateStyle: "full" as const } : { dateStyle: "medium" as const, timeStyle: "short" as const }),
    timeZone: "Asia/Manila",
  }).format(new Date(value));
}
