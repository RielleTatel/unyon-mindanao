import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AccessError, sessionCookieName, withSessionService } from "@/features/access/server";
import { SignOutButton } from "@/features/access/ui/sign-out-button";
import { PortalNavigation } from "@/features/dashboard/ui/portal-navigation";
import { UnyonMark } from "@/shared/ui/unyon-mark";

export const dynamic = "force-dynamic";

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const sessionToken = (await cookies()).get(sessionCookieName)?.value ?? "";
  let actor;

  try {
    actor = await withSessionService((sessions) =>
      sessions.require(sessionToken, crypto.randomUUID()),
    );
  } catch (error) {
    if (error instanceof AccessError && error.code === "AUTHENTICATION_REQUIRED") {
      redirect("/sign-in");
    }

    throw error;
  }

  const isSuperAdmin = actor.appointments.some(({ role }) => role === "SUPER_ADMIN");
  const isUniversityAdmin = actor.appointments.some(
    ({ role }) => role === "UNIVERSITY_ADMIN",
  );

  return (
    <div className="portal-frame">
      <header className="portal-header">
        <div className="portal-header__topline" />
        <div className="portal-header__inner">
          <div className="portal-header__primary">
            <Link aria-label="Unyon Mindanao portal home" className="portal-brand" href="/portal">
              <UnyonMark />
              <span className="portal-brand__copy">
                <strong>Unyon Mindanao</strong>
                <span>Confederation portal</span>
              </span>
            </Link>
            <div className="portal-session">
              <span className="portal-session__identity">
                <span aria-hidden="true" className="portal-session__avatar">
                  {actor.email.charAt(0).toUpperCase()}
                </span>
                <span>
                  <span>Signed in</span>
                  <strong>{actor.email}</strong>
                </span>
              </span>
              <SignOutButton />
            </div>
          </div>
          <PortalNavigation
            isSuperAdmin={isSuperAdmin}
            isUniversityAdmin={isUniversityAdmin}
          />
        </div>
      </header>
      <div className="portal-content">{children}</div>
      <footer className="portal-footer">
        <span>Unyon ng mga Estudyante sa Mindanao</span>
        <span>Authorized access only</span>
      </footer>
    </div>
  );
}
