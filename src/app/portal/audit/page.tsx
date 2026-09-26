import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { AccessError, sessionCookieName, withAuditHistory } from "@/features/access/server";
export const dynamic = "force-dynamic";
export default async function AuditPage() {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  let records;
  try { records = await withAuditHistory((feature) => feature.recent({ input: {}, sessionToken, correlationId: crypto.randomUUID() })); }
  catch (error) { if (error instanceof AccessError && error.code === "AUTHENTICATION_REQUIRED") redirect("/sign-in"); if (error instanceof AccessError) notFound(); throw error; }
  return <main className="mx-auto min-h-svh max-w-4xl px-5 py-10"><Link href="/portal">← Confederation workspace</Link><h1 className="mt-6 font-serif text-4xl">Recent audit activity</h1><p className="my-4 text-sm text-muted-foreground">The latest 100 entries. Credentials, birth dates, Evaluation comments and signed links are never shown here.</p><ol className="divide-y divide-primary/10">{records.map((record) => <li key={record.id} className="grid gap-1 py-4 text-sm sm:grid-cols-[11rem_1fr]"><time className="text-muted-foreground" dateTime={record.occurredAt}>{new Date(record.occurredAt).toLocaleString("en-PH", { timeZone: "Asia/Manila", dateStyle: "medium", timeStyle: "short" })}</time><div><strong>{record.action.replaceAll(/[._]/gu, " ")}</strong><p>{record.actorName} · {record.resourceType}</p></div></li>)}</ol></main>;
}
