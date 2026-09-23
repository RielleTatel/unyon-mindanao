import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { AccessError, sessionCookieName, withSessionService } from "@/features/access/server";
import { withCommunicationsFeature } from "@/features/communications/server";
import { ShortcutsWorkspace } from "@/features/communications/ui/communications-workspace";

export const dynamic = "force-dynamic";
export default async function ShortcutsPage() {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  let actor; let records;
  try {
    actor = await withSessionService((sessions) => sessions.require(sessionToken, crypto.randomUUID()));
    records = await withCommunicationsFeature((feature) => feature.listShortcuts({ sessionToken, input: {}, correlationId: crypto.randomUUID() }));
  } catch (error) {
    if (error instanceof AccessError && error.code === "AUTHENTICATION_REQUIRED") redirect("/sign-in");
    throw error;
  }
  return <main className="min-h-svh bg-background px-4 py-8 sm:px-8"><div className="mx-auto max-w-5xl"><Link className="text-sm font-bold text-primary" href="/portal">← Confederation workspace</Link><h1 className="font-serif text-5xl">Shortcuts</h1><p className="mb-8 text-muted-foreground">Useful destinations outside the portal. Links open in a new tab.</p><ShortcutsWorkspace records={records} canManage={actor.appointments.some(({ role }) => role === "SUPER_ADMIN")} /></div></main>;
}
