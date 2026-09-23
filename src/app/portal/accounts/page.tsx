import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AccessError, sessionCookieName, withSessionService } from "@/features/access/server";
import { withAccountFeature } from "@/features/directory/server";
import { AccountControl } from "@/features/directory/ui/account-controls";
export const dynamic = "force-dynamic";
export default async function AccountsPage() {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  let actor; let records;
  try { actor = await withSessionService((sessions) => sessions.require(sessionToken, crypto.randomUUID())); records = await withAccountFeature((feature) => feature.list({ input: {}, sessionToken, correlationId: crypto.randomUUID() })); }
  catch (error) { if (error instanceof AccessError && error.code === "AUTHENTICATION_REQUIRED") redirect("/sign-in"); if (error instanceof AccessError) notFound(); throw error; }
  return <main className="mx-auto min-h-svh max-w-4xl space-y-6 px-5 py-10"><Link href="/portal">← Confederation workspace</Link><h1 className="font-serif text-4xl">Account administration</h1><p className="text-sm">Disabling an account removes access and revokes sessions without deleting Appointments or historical attribution. Restoring an account still requires an active Appointment and a new sign-in.</p><h2 className="text-2xl">Portal Users</h2><ul className="divide-y">{records.people.map((person) => <li key={person.id} className="py-4"><p>{person.fullName} · {person.email} · {person.status}</p>{person.id !== actor.portalUserId && <AccountControl id={person.id} status={person.status} email={actor.email} />}</li>)}</ul><h2 className="text-2xl">University Admin Appointments</h2><ul className="divide-y">{records.appointments.map((appointment) => <li key={appointment.id} className="py-4"><p>{appointment.portalUser.fullName} · {appointment.university?.name}</p><p className="text-sm">{appointment.endsAt ? `Ends ${new Date(appointment.endsAt).toLocaleDateString("en-PH", { timeZone: "Asia/Manila" })}` : "Ongoing"}</p>{new Date(appointment.startsAt) <= new Date() && (!appointment.endsAt || new Date(appointment.endsAt) > new Date()) && <AccountControl id={appointment.id} email={actor.email} />}</li>)}</ul></main>;
}
