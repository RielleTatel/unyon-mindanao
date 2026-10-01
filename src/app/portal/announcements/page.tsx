import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { AccessError, sessionCookieName } from "@/features/access/server";
import { withCommunicationsFeature } from "@/features/communications/server";
import { AnnouncementsWorkspace } from "@/features/communications/ui/communications-workspace";
import { Pagination } from "@/shared/ui/pagination";

export const dynamic = "force-dynamic";
export default async function AnnouncementsPage({ searchParams }: { searchParams: Promise<{ page?: string; pageSize?: string }> }) {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  const query = await searchParams;
  let page;
  try {
    page = await withCommunicationsFeature((feature) => feature.announcementPage({ sessionToken, input: { page: Number(query.page ?? 0), pageSize: Number(query.pageSize ?? 50) }, correlationId: crypto.randomUUID() }));
  } catch (error) {
    if (error instanceof AccessError && error.code === "AUTHENTICATION_REQUIRED") redirect("/sign-in");
    if (error instanceof AccessError && error.code === "INVALID_INPUT") notFound();
    throw error;
  }
  return <main className="min-h-svh bg-background px-4 py-8 sm:px-8"><div className="mx-auto max-w-5xl"><Link className="text-sm font-bold text-primary" href="/portal">← Confederation workspace</Link><h1 className="font-serif text-5xl">Announcements</h1><p className="mb-8 text-muted-foreground">Updates from across the Confederation.</p><AnnouncementsWorkspace records={page.records} canManage={page.canManage} /><Pagination href="/portal/announcements" pagination={page} /></div></main>;
}
