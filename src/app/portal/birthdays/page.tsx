import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccessError, sessionCookieName, withSessionService } from "@/features/access/server";
import { withBirthdayFeature } from "@/features/directory/server";
import { BirthDateAdministration } from "@/features/directory/ui/birth-date-administration";

export const dynamic = "force-dynamic";
const monthNames = Array.from({ length: 12 }, (_, index) => new Intl.DateTimeFormat("en", { month: "long", timeZone: "UTC" }).format(new Date(Date.UTC(2000, index, 1))));

export default async function BirthdaysPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const params = await searchParams;
  const currentMonth = Number(new Intl.DateTimeFormat("en", { month: "numeric", timeZone: "Asia/Manila" }).format(new Date()));
  const candidate = Number(params.month);
  const month = Number.isInteger(candidate) && candidate >= 1 && candidate <= 12 ? candidate : currentMonth;
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  const request = (input: unknown) => ({ input, sessionToken, correlationId: crypto.randomUUID() });
  let actor;
  let birthdays;
  let people;
  let canManage = false;
  try {
    actor = await withSessionService((sessions) => sessions.require(sessionToken, crypto.randomUUID()));
    canManage = actor.appointments.some(({ role }) => role === "SUPER_ADMIN" || role === "UNIVERSITY_ADMIN");
    [birthdays, people] = await withBirthdayFeature((feature) => Promise.all([
      feature.list(request({ month })), canManage ? feature.manageablePeople(request({})) : Promise.resolve([]),
    ]));
  } catch (error) {
    if (error instanceof AccessError && error.code === "AUTHENTICATION_REQUIRED") redirect("/sign-in");
    throw error;
  }
    return <main className="min-h-svh bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-5xl">
        <Link href="/portal" className="text-sm font-bold text-primary">← Confederation workspace</Link>
        <h1 className="mb-3 font-serif text-5xl">Birthdays</h1>
        <p className="text-muted-foreground">Celebrate officers with active Appointments across the Confederation.</p>
        <form className="my-6 flex flex-wrap items-end gap-3">
          <label className="text-sm font-semibold">Month<select name="month" defaultValue={month} className="ml-3 min-h-11 rounded-xl border border-primary/20 bg-card px-3">{monthNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}</select></label>
          <button className="min-h-11 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground" type="submit">Show birthdays</button>
        </form>
        <h2 className="font-serif text-3xl">{monthNames[month - 1]}</h2>
        {birthdays.length === 0 ? <p className="rounded-2xl border border-dashed border-primary/20 p-6">No birthdays recorded for this month.</p> : <ul className="grid list-none gap-4 p-0 sm:grid-cols-2">
          {birthdays.map((person) => <li key={person.portalUserId} className="rounded-2xl border border-primary/15 bg-card p-5">
            <p className="m-0 text-sm font-bold text-primary">{monthNames[person.month - 1]} {person.day}</p>
            <h3 className="my-2 text-xl font-semibold">{person.fullName}</h3>
            {person.appointments.map((appointment, index) => <p className="my-1 text-sm text-muted-foreground" key={index}>{appointment.universityName} · {appointment.role.replaceAll("_", " ")}</p>)}
          </li>)}
        </ul>}
        {canManage ? <BirthDateAdministration people={people} actorEmail={actor.email} canApplyRetention={actor.appointments.some(({ role }) => role === "SUPER_ADMIN")} /> : null}
      </div>
    </main>;
}
