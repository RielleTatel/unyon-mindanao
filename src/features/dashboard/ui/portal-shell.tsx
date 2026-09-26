import { ArrowUpRight, CalendarDays, FileCheck2, Megaphone } from "lucide-react";
import Link from "next/link";

import { portalMessages } from "@/shared/i18n/en";
import { UnyonMark } from "@/shared/ui/unyon-mark";

const featureIcons = [CalendarDays, Megaphone, FileCheck2];

export function PortalShell() {
  const messages = portalMessages.shell;

  return (
    <main className="public-shell">
      <header className="public-header">
        <Link aria-label={messages.homeLabel} className="public-brand" href="/">
          <UnyonMark />
          <span className="public-brand__copy">
            <strong>Unyon Mindanao</strong>
            <span>Confederation portal</span>
          </span>
        </Link>
        <Link className="public-sign-in" href="/sign-in">
          {messages.signIn}
          <ArrowUpRight aria-hidden="true" size={16} />
        </Link>
      </header>

      <section className="public-hero">
        <div className="public-hero__copy">
          <p className="eyebrow">{messages.heroEyebrow}</p>
          <h1>
            One private space. <em>One shared current.</em>
          </h1>
          <p className="public-hero__summary">{messages.heroSummary}</p>
          <div className="public-hero__actions">
            <Link className="public-sign-in" href="/sign-in">
              Enter the portal
              <ArrowUpRight aria-hidden="true" size={16} />
            </Link>
            <span className="public-hero__note">{messages.invitationNote}</span>
          </div>
        </div>

        <div aria-hidden="true" className="public-hero__art">
          <div className="brand-pattern">
            {Array.from({ length: 9 }, (_, index) => <span key={index} />)}
          </div>
          <div className="public-hero__seal">
            <strong>Private</strong>
            <span>For authorized Confederation officers</span>
          </div>
        </div>
      </section>

      <div className="public-band">
        <section aria-labelledby="portal-areas-title" className="public-section">
          <div className="public-section__heading">
            <div>
              <p className="eyebrow">{messages.areasEyebrow}</p>
              <h2 id="portal-areas-title">{messages.areasTitle}</h2>
            </div>
            <p>{messages.networkNote}</p>
          </div>
          <div className="public-features">
            {messages.areas.map(({ label, description }, index) => {
              const Icon = featureIcons[index];
              return (
                <article className="public-feature" key={label}>
                  <div className="public-feature__number">
                    <span>0{index + 1}</span>
                    <Icon aria-hidden="true" size={22} strokeWidth={1.5} />
                  </div>
                  <h3>{label}</h3>
                  <p>{description}</p>
                </article>
              );
            })}
          </div>
        </section>
      </div>

      <footer className="public-footer">
        <span>{messages.organizationName}</span>
        <span>{messages.accessNotice}</span>
      </footer>
    </main>
  );
}
