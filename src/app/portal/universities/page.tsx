import { cookies } from "next/headers";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import {
  AccessError,
  sessionCookieName,
} from "@/features/access/server";
import { MemberUniversityAdmin } from "@/features/directory/ui/member-university-admin";
import {
  withMemberUniversityFeature,
  withUniversityAdminInvitationFeature,
} from "@/features/directory/server";

export const dynamic = "force-dynamic";

export default async function MemberUniversitiesPage() {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  let universities;
  let invitations;

  try {
    [universities, invitations] = await Promise.all([
      withMemberUniversityFeature((feature) =>
        feature.list({
          correlationId: crypto.randomUUID(),
          input: { includeArchived: true },
          sessionToken,
        }),
      ),
      withUniversityAdminInvitationFeature((feature) =>
        feature.listPending({
          correlationId: crypto.randomUUID(),
          input: {},
          sessionToken,
        }),
      ),
    ]);
  } catch (error) {
    if (error instanceof AccessError && error.code === "AUTHENTICATION_REQUIRED") {
      redirect("/sign-in");
    }

    if (error instanceof AccessError && error.code === "NOT_FOUND_OR_FORBIDDEN") {
      notFound();
    }

    throw error;
  }

  return (
    <main className="min-h-svh bg-background px-4 py-8 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-primary/20 pb-6">
          <div>
            <Link
              className="text-sm font-bold text-primary underline-offset-4 hover:underline"
              href="/portal"
            >
              ← Confederation workspace
            </Link>
            <p className="mt-5 mb-0 text-xs font-extrabold tracking-[0.14em] text-primary uppercase">
              Portal administration
            </p>
            <h1 className="mt-2 mb-0 font-serif text-4xl font-medium tracking-[-0.04em] sm:text-5xl">
              Member University directory
            </h1>
          </div>
          <span className="rounded-full border border-primary/15 bg-card px-4 py-2 text-xs font-bold tracking-[0.08em] text-primary uppercase">
            Super Admin
          </span>
        </header>

        <section className="py-9 sm:py-12">
          <p className="mb-8 max-w-3xl text-base leading-7 text-muted-foreground">
            Keep the Confederation directory current. Archived entries stay in the
            record and can be restored when a Member University returns.
          </p>
          <MemberUniversityAdmin invitations={invitations} universities={universities} />
        </section>
      </div>
    </main>
  );
}
