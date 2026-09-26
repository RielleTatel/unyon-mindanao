import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";

import { SignInForm } from "@/features/access/ui/sign-in-form";
import { UnyonMark } from "@/shared/ui/unyon-mark";

export default function SignInPage() {
  return (
    <main className="auth-page">
      <section className="auth-card">
        <div className="auth-card__brand">
          <Link
            className="inline-flex w-fit items-center gap-2 text-sm font-semibold text-primary-foreground/75 no-underline hover:text-primary-foreground"
            href="/"
          >
            <ArrowLeft aria-hidden="true" size={17} />
            Portal home
          </Link>
          <div>
            <UnyonMark className="mb-7" />
            <p className="mb-3 text-xs font-extrabold tracking-[0.18em] text-accent uppercase">
              Private Confederation portal
            </p>
            <h1 className="m-0 max-w-md font-serif text-4xl leading-[1.04] font-medium tracking-[-0.04em] sm:text-5xl">
              Welcome back to the current.
            </h1>
            <p className="mt-5 max-w-sm text-sm leading-6 text-primary-foreground/60">
              A secure workspace for Unyon Mindanao and every participating Member University.
            </p>
          </div>
        </div>
        <div className="auth-card__content">
          <div className="mb-8 flex items-start gap-3">
            <span className="mt-0.5 inline-grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-muted text-primary">
              <ShieldCheck aria-hidden="true" size={20} />
            </span>
            <div>
              <p className="m-0 text-xs font-extrabold tracking-[0.14em] text-primary uppercase">
                Authorized access
              </p>
              <h2 className="mt-2 mb-0 font-serif text-3xl font-medium">Sign in</h2>
              <p className="mt-2 mb-0 text-sm leading-6 text-muted-foreground">
                Use the verified email issued for your active Appointment.
              </p>
            </div>
          </div>
          <SignInForm />
          <p className="mt-7 mb-0 border-t border-border pt-6 text-xs leading-5 text-muted-foreground">
            Access is invite-only. Accounts without an active Appointment are denied.
          </p>
        </div>
      </section>
    </main>
  );
}
