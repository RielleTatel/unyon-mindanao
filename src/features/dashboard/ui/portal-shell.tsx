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
import { portalMessages } from "@/shared/i18n/en";

const portalAreaIcons = [CalendarDays, Megaphone, FileText] as const;
const pageSectionClassName =
  "relative z-10 mx-auto w-[min(1180px,calc(100%-2rem))]";
const eyebrowClassName =
  "flex items-center gap-[0.7rem] text-[0.73rem] font-extrabold tracking-[0.16em] text-[#56713d] uppercase";
const iconTileClassName =
  "inline-grid h-[2.8rem] w-[2.8rem] shrink-0 place-items-center rounded-[0.9rem] bg-muted text-primary";

export function PortalShell() {
  const messages = portalMessages.shell;

  return (
    <main className="relative min-h-svh overflow-hidden bg-background bg-[linear-gradient(rgba(23,83,55,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(23,83,55,0.045)_1px,transparent_1px)] bg-[size:42px_42px] before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_70%_15%,rgba(230,208,151,0.5),transparent_28%)] before:content-['']">
      <div
        className="pointer-events-none absolute -top-60 -right-32 z-0 h-96 w-96 rounded-full border-[5rem] border-[rgba(112,139,70,0.11)]"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute bottom-24 -left-68 z-0 h-96 w-96 rounded-full border-[5rem] border-[rgba(112,139,70,0.11)]"
        aria-hidden="true"
      />

      <header
        className={cn(
          pageSectionClassName,
          "flex min-h-26 items-center justify-between border-b border-[rgba(23,83,55,0.17)] max-[520px]:min-h-22",
        )}
      >
        <a
          className="flex items-center gap-3 no-underline"
          href="#top"
          aria-label={messages.homeLabel}
        >
          <span
            className="inline-grid h-11 w-11 shrink-0 -rotate-6 place-items-center rounded-[42%_58%_56%_44%] bg-primary text-primary-foreground [&_svg]:rotate-6"
            aria-hidden="true"
          >
            <Waves size={22} strokeWidth={2.3} />
          </span>
          <span>
            <strong className="block text-[0.9rem] tracking-[0.22em]">UNYON</strong>
            <small className="mt-[0.12rem] block text-[0.6rem] font-bold tracking-[0.22em] text-muted-foreground">
              MINDANAO
            </small>
          </span>
        </a>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-[0.45rem] text-[0.78rem] font-[650] text-muted-foreground max-[800px]:hidden">
            <ShieldCheck size={15} aria-hidden="true" />
            {messages.privacyLabel}
          </span>
          <a
            className={cn(
              buttonVariants(),
              "no-underline max-[520px]:min-h-[2.6rem] max-[520px]:px-4",
            )}
            href="/sign-in"
          >
            {messages.signIn}
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>
        </div>
      </header>

      <section
        className={cn(
          pageSectionClassName,
          "grid min-h-[37rem] grid-cols-[minmax(0,1.2fr)_minmax(20rem,0.8fr)] items-center gap-[clamp(2rem,7vw,7rem)] py-24 max-[800px]:grid-cols-1 max-[800px]:py-[4.5rem]",
        )}
        id="top"
      >
        <div className="max-w-[44rem]">
          <p className={cn(eyebrowClassName, "mb-[1.1rem]")}>
            <span className="h-0.5 w-[2.1rem] bg-ring" aria-hidden="true" />
            {messages.heroEyebrow}
          </p>
          <h1 className="m-0 max-w-[41rem] font-serif text-[clamp(3.25rem,7vw,6.3rem)] leading-[0.91] font-medium tracking-[-0.045em] max-[520px]:text-[clamp(2.8rem,15vw,4.1rem)]">
            {messages.heroTitle}
          </h1>
          <p className="mt-7 mb-0 max-w-[34rem] text-[clamp(1.05rem,2vw,1.25rem)] leading-[1.65] text-[#51614d]">
            {messages.heroSummary}
          </p>
          <div className="mt-[2.2rem] flex items-center gap-4 max-[520px]:flex-col max-[520px]:items-start">
            <a className={cn(buttonVariants(), "no-underline")} href="/sign-in">
              {messages.signIn}
              <ArrowUpRight size={17} aria-hidden="true" />
            </a>
            <p className="m-0 max-w-68 text-[0.78rem] leading-[1.45] text-muted-foreground">
              {messages.invitationNote}
            </p>
          </div>
        </div>

        <aside
          className="relative overflow-hidden rounded-[2rem] border border-[rgba(23,83,55,0.2)] bg-[rgba(251,248,233,0.82)] p-8 shadow-[0_28px_80px_rgba(40,66,39,0.12)] backdrop-blur-[14px] after:absolute after:-right-14 after:-bottom-18 after:h-44 after:w-44 after:rounded-full after:border-[2.5rem] after:border-[rgba(154,168,79,0.15)] after:content-[''] max-[800px]:max-w-[34rem]"
          aria-label={messages.membershipLabel}
        >
          <div className="flex items-center justify-between">
            <span className={iconTileClassName} aria-hidden="true">
              <UsersRound size={23} />
            </span>
            <span className="relative pl-[0.85rem] text-[0.72rem] font-bold text-muted-foreground before:absolute before:top-1/2 before:left-0 before:h-[0.45rem] before:w-[0.45rem] before:-translate-y-1/2 before:rounded-full before:bg-[#6f8737] before:content-['']">
              {messages.privacyStatus}
            </span>
          </div>
          <p className="mt-11 mb-[0.8rem] text-[0.72rem] font-extrabold tracking-[0.13em] text-[#8b6c2b] uppercase">
            {messages.networkKicker}
          </p>
          <h2 className="m-0 max-w-[25rem] font-serif text-[clamp(2rem,4vw,3.15rem)] leading-[1.02] font-medium tracking-[-0.045em]">
            {messages.networkTitle}
          </h2>
          <div className="my-8 grid gap-[0.55rem]" aria-hidden="true">
            <span className="h-[0.42rem] rounded-full bg-[linear-gradient(90deg,var(--secondary),rgba(154,168,79,0.08))]" />
            <span className="h-[0.42rem] w-[78%] rounded-full bg-[linear-gradient(90deg,var(--secondary),rgba(154,168,79,0.08))]" />
            <span className="h-[0.42rem] w-[55%] rounded-full bg-[linear-gradient(90deg,var(--secondary),rgba(154,168,79,0.08))]" />
          </div>
          <p className="relative z-10 m-0 text-[0.86rem] leading-[1.6] text-muted-foreground">
            {messages.networkNote}
          </p>
        </aside>
      </section>

      <section
        className={cn(
          pageSectionClassName,
          "border-t border-[rgba(23,83,55,0.17)] pt-10 pb-20",
        )}
        aria-labelledby="portal-areas-title"
      >
        <div className="mb-8 flex items-end justify-between gap-8 max-[800px]:block">
          <p className={cn(eyebrowClassName, "mb-[0.4rem]")}>
            <span className="h-0.5 w-[2.1rem] bg-ring" aria-hidden="true" />
            {messages.areasEyebrow}
          </p>
          <h2
            className="m-0 max-w-lg text-right font-serif text-[clamp(2rem,4vw,3.4rem)] leading-none font-medium tracking-[-0.045em] max-[800px]:text-left"
            id="portal-areas-title"
          >
            {messages.areasTitle}
          </h2>
        </div>

        <div className="grid grid-cols-3 gap-4 max-[800px]:grid-cols-1">
          {messages.areas.map(({ label, description }, index) => {
            const Icon = portalAreaIcons[index];

            return (
              <article
                className="min-h-60 rounded-[1.4rem] border border-[rgba(23,83,55,0.16)] bg-[rgba(251,248,233,0.62)] p-6 max-[800px]:min-h-0"
                key={label}
              >
                <div className="flex items-center justify-between">
                  <span className={iconTileClassName} aria-hidden="true">
                    <Icon size={20} />
                  </span>
                  <span className="font-serif text-[0.8rem] text-[#839162] italic">
                    0{index + 1}
                  </span>
                </div>
                <h3 className="mt-[2.7rem] mb-[0.65rem] text-[1.05rem]">
                  {label}
                </h3>
                <p className="m-0 max-w-80 text-[0.88rem] leading-[1.55] text-muted-foreground">
                  {description}
                </p>
              </article>
            );
          })}
        </div>
      </section>

      <footer
        className={cn(
          pageSectionClassName,
          "flex min-h-20 items-center justify-between border-t border-[rgba(23,83,55,0.17)] text-xs text-muted-foreground max-[520px]:flex-col max-[520px]:items-start max-[520px]:justify-center max-[520px]:gap-[0.3rem]",
        )}
      >
        <span>{messages.organizationName}</span>
        <span>{messages.accessNotice}</span>
      </footer>
    </main>
  );
}
