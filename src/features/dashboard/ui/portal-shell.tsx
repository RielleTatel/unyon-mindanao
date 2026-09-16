import {
  ArrowUpRight,
  CalendarDays,
  FileText,
  Megaphone,
  ShieldCheck,
  UsersRound,
  Waves,
} from "lucide-react";

import { buttonVariants } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";

const portalAreas = [
  {
    icon: CalendarDays,
    label: "Events",
    description: "One calendar for Confederation and university activities.",
  },
  {
    icon: Megaphone,
    label: "Announcements",
    description: "Official updates without the noise of scattered channels.",
  },
  {
    icon: FileText,
    label: "Shared records",
    description: "Governed reports and evaluations for authorized officers.",
  },
] as const;

export function PortalShell() {
  return (
    <main className="portal-shell">
      <div className="ambient ambient-top" aria-hidden="true" />
      <div className="ambient ambient-bottom" aria-hidden="true" />

      <header className="site-header">
        <a className="brand-lockup" href="#top" aria-label="Unyon Mindanao home">
          <span className="brand-mark" aria-hidden="true">
            <Waves size={22} strokeWidth={2.3} />
          </span>
          <span>
            <strong>UNYON</strong>
            <small>MINDANAO</small>
          </span>
        </a>

        <div className="header-meta">
          <span className="private-pill">
            <ShieldCheck size={15} aria-hidden="true" />
            Private portal
          </span>
          <a className={cn(buttonVariants(), "header-sign-in")} href="/sign-in">
            Sign in
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
      </header>

      <section className="hero" id="top">
        <div className="hero-copy">
          <p className="eyebrow">
            <span aria-hidden="true" />
            Confederation workspace
          </p>
          <h1>One private space for Unyon Mindanao</h1>
          <p className="hero-summary">
            Events, updates, and shared records—kept in one governed portal.
          </p>
          <div className="hero-actions">
            <a className={buttonVariants()} href="/sign-in">
              Sign in
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
            <p>Invite-only access for authorized student-government officers.</p>
          </div>
        </div>

        <aside className="network-card" aria-label="Portal membership">
          <div className="network-card-header">
            <span className="network-icon" aria-hidden="true">
              <UsersRound size={23} />
            </span>
            <span className="status-dot">Private by design</span>
          </div>
          <p className="network-kicker">Built for connection</p>
          <h2>The Confederation and every Member University, together.</h2>
          <div className="member-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="network-note">
            Authority stays clear. University work stays scoped. Shared work stays
            visible to the people who need it.
          </p>
        </aside>
      </section>

      <section className="portal-areas" aria-labelledby="portal-areas-title">
        <div className="section-heading">
          <p className="eyebrow">
            <span aria-hidden="true" />
            A calmer way to coordinate
          </p>
          <h2 id="portal-areas-title">The essentials, in one current.</h2>
        </div>

        <div className="area-grid">
          {portalAreas.map(({ icon: Icon, label, description }, index) => (
            <article className="area-card" key={label}>
              <div className="area-card-top">
                <span className="area-icon" aria-hidden="true">
                  <Icon size={20} />
                </span>
                <span className="area-number">0{index + 1}</span>
              </div>
              <h3>{label}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>

      <footer className="site-footer">
        <span>Unyon ng mga Estudyante sa Mindanao</span>
        <span>Authorized access only</span>
      </footer>
    </main>
  );
}
