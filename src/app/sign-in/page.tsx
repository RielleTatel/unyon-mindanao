import { ArrowLeft, ShieldCheck, Waves } from "lucide-react";
import Link from "next/link";

import { SignInForm } from "@/features/access/ui/sign-in-form";

export default function SignInPage() {
  return (
    <main className="relative grid min-h-svh place-items-center overflow-hidden bg-background px-4 py-12 before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_72%_12%,rgba(230,208,151,0.62),transparent_30%)] before:content-['']">
      <section className="relative z-10 grid w-full max-w-5xl overflow-hidden rounded-[2rem] border border-primary/20 bg-card/85 shadow-[0_30px_90px_rgba(24,59,44,0.14)] backdrop-blur md:grid-cols-[0.9fr_1.1fr]">
        <div className="flex min-h-72 flex-col justify-between bg-primary p-8 text-primary-foreground sm:p-11">
          <Link
            className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-primary-foreground/80 no-underline hover:text-primary-foreground"
            href="/"
          >
            <ArrowLeft size={17} aria-hidden="true" />
            Back to portal home
          </Link>
          <div>
            <span className="mb-6 inline-grid h-12 w-12 place-items-center rounded-2xl bg-primary-foreground/12">
              <Waves size={24} aria-hidden="true" />
            </span>
            <p className="mb-3 text-xs font-extrabold tracking-[0.18em] text-accent uppercase">
              Private Confederation portal
            </p>
            <h1 className="m-0 max-w-md font-serif text-4xl leading-tight font-medium tracking-[-0.035em] sm:text-5xl">
              Welcome back to Unyon Mindanao.
            </h1>
          </div>
        </div>
        <div className="p-8 sm:p-11 md:p-14">
          <div className="mb-8 flex items-start gap-3">
            <span className="mt-0.5 inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-primary">
              <ShieldCheck size={20} aria-hidden="true" />
            </span>
            <div>
              <h2 className="m-0 text-xl">Sign in</h2>
              <p className="mt-1 mb-0 text-sm leading-6 text-muted-foreground">
                Use the verified email account issued for your portal appointment.
              </p>
            </div>
          </div>
          <SignInForm />
          <p className="mt-7 mb-0 border-t border-border pt-6 text-xs leading-5 text-muted-foreground">
            Access is invite-only. Accounts without an active appointment are denied.
          </p>
        </div>
      </section>
    </main>
  );
}
