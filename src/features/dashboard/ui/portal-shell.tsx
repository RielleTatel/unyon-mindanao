import { ArrowUpRight } from "lucide-react";
import Link from "next/link";

import { portalMessages } from "@/shared/i18n/en";
import { UnyonLogo } from "@/shared/ui/unyon-logo";

export function PortalShell() {
  const messages = portalMessages.shell;

  return (
    <main className="public-shell">
      <header className="public-header">
        <Link aria-label={messages.homeLabel} className="public-brand" href="/">
          <UnyonLogo />
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

      <footer className="public-footer">
        <span>{messages.organizationName}</span>
        <span>{messages.accessNotice}</span>
      </footer>
    </main>
  );
}
