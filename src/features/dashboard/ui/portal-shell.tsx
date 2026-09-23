import Link from "next/link";
import { portalMessages } from "@/shared/i18n/en";

export function PortalShell() {
  const messages = portalMessages.shell;
  return <main className="min-h-svh bg-[#fafaf6] px-6 sm:px-10"><div className="mx-auto max-w-5xl">
    <header className="flex min-h-24 items-center justify-between gap-6 border-b border-primary/15"><Link href="/" aria-label={messages.homeLabel} className="text-sm font-bold tracking-[0.14em]">UNYON MINDANAO</Link><Link href="/sign-in" className="py-3 text-sm font-semibold hover:underline">{messages.signIn} <span aria-hidden="true">→</span></Link></header>
    <section id="top" className="max-w-3xl py-20 sm:py-28"><p className="mb-5 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">{messages.heroEyebrow}</p><h1 className="font-serif text-5xl leading-tight tracking-tight sm:text-7xl">{messages.heroTitle}</h1><p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">{messages.heroSummary}</p><Link href="/sign-in" className="mt-8 inline-block border-b border-primary py-2 font-semibold">{messages.signIn} <span aria-hidden="true">→</span></Link><p className="mt-4 text-sm text-muted-foreground">{messages.invitationNote}</p></section>
    <section aria-labelledby="portal-areas-title" className="border-t border-primary/15 py-10"><h2 id="portal-areas-title" className="mb-6 font-serif text-2xl">{messages.areasTitle}</h2><div className="divide-y divide-primary/10">{messages.areas.map(({ label, description }) => <article key={label} className="grid gap-2 py-5 sm:grid-cols-[12rem_1fr] sm:gap-8"><h3 className="font-semibold">{label}</h3><p className="max-w-xl text-sm leading-6 text-muted-foreground">{description}</p></article>)}</div></section>
    <footer className="flex flex-wrap justify-between gap-3 border-t border-primary/15 py-6 text-xs leading-5 text-muted-foreground"><span>{messages.organizationName}</span><span>{messages.accessNotice}</span></footer>
  </div></main>;
}
