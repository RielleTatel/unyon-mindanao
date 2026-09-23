import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AccessError, sessionCookieName, withSessionService } from "@/features/access/server";
import { withUniversityAdminInvitationFeature, withRepresentativeAppointmentFeature } from "@/features/directory/server";
import { RepresentativeAppointments } from "@/features/directory/ui/representative-appointments";
import { RepresentativeAccess } from "@/features/directory/ui/representative-access";

export const dynamic = "force-dynamic";

export default async function UniversityTeamPage() {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  let invitations;
  let universities;
  let appointments;
  let actor;

  try {
    actor = await withSessionService((sessions) => sessions.require(sessionToken, crypto.randomUUID()));
    appointments = await withRepresentativeAppointmentFeature((feature) => feature.list({ correlationId: crypto.randomUUID(), input: {}, sessionToken }));
    [invitations, universities] = await withUniversityAdminInvitationFeature((feature) => Promise.all([
      feature.listPendingRepresentatives({ correlationId: crypto.randomUUID(), input: {}, sessionToken }),
      feature.managedUniversities({ correlationId: crypto.randomUUID(), input: {}, sessionToken }),
    ]));
  } catch (error) {
    if (error instanceof AccessError && error.code === "AUTHENTICATION_REQUIRED") redirect("/sign-in");
    if (error instanceof AccessError && error.code === "NOT_FOUND_OR_FORBIDDEN") notFound();
    throw error;
  }

  return (
    <main className="min-h-svh bg-background px-4 py-7 sm:px-8 sm:py-10">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 border-b border-primary/20 pb-6">
          <Link className="text-sm font-bold text-primary underline-offset-4 hover:underline" href="/portal">← Confederation workspace</Link>
          <p className="mt-5 mb-0 text-xs font-extrabold tracking-[0.14em] text-primary uppercase">University Administration</p>
          <h1 className="mt-2 mb-0 font-serif text-4xl font-medium tracking-[-0.04em] sm:text-5xl">Build your team.</h1>
          <p className="mt-3 mb-0 max-w-2xl text-sm leading-6 text-muted-foreground">Invite verified Representatives for Member Universities attached to your active Appointment. Every invitation is scoped to one university.</p>
        </header>
        <RepresentativeAccess invitations={invitations} universities={universities} />
        <RepresentativeAppointments appointments={appointments} actorEmail={actor.email} />
      </div>
    </main>
  );
}
