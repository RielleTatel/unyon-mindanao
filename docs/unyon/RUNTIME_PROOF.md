# Runtime Proof

## Application shell — Issue #2

Verified locally on September 16, 2026:

- `pnpm dev` served the strict TypeScript Next.js App Router shell.
- Vitest rendering tests, ESLint, strict type checking, and environment checks passed.
- Playwright passed the shell journey in desktop Chromium and a Pixel 7 viewport.
- The shell uses Tailwind CSS utilities over centralized brand tokens; full-page desktop and mobile screenshots were inspected after conversion.
- `pnpm build` produced the standard Next.js production output.
- `pnpm build:worker` produced the Vinext Cloudflare output; `pnpm test:e2e:worker` served it through local Wrangler/Workerd and passed in desktop and mobile Chromium.
- `pnpm deploy:check` completed without deploying.

A one-time Cloudflare temporary preview was smoke-tested before the local-first workflow was requested. It ran as version `944104fa-0b8d-4477-b64a-3f355e7e7a41` on Cloudflare's temporary account infrastructure; it was not a production deployment. No OpenNext fallback was required for the shell. Firebase Admin, Prisma, PostgreSQL, and private-object-storage compatibility remain explicit proof points for their implementation tickets.

## Access foundation — Issue #3

Verified locally on September 17, 2026:

- Firebase Auth Emulator created and email-verified an email/password identity; controlled bootstrap linked its UID to one active PostgreSQL Super Admin Appointment.
- PostgreSQL migrations enforce appointment scope and non-overlapping time ranges, session expiry, and append-only audit records, including protection from update, delete, and truncate operations.
- Integration tests recreate a dedicated local `*_test` database for every run. They cover idempotent bootstrap, hashed sessions, transaction-bound mutations and rollback, current-access checks, deactivation, audit redaction and immutability, and overlapping-Appointment rejection.
- Vitest passes 27 module tests, and the six-test PostgreSQL integration suite passes on consecutive clean database runs.
- Standard Next.js and local Wrangler/Workerd each passed six Playwright cases across desktop Chromium and Pixel 7: private-shell rendering, protected-route redirect, allowed Super Admin sign-in/sign-out, post-sign-out denial, and denial of a verified Firebase identity without an Appointment.
- Prisma uses separate generated Node.js and Workerd clients behind the same server-only adapter. Workerd loads Prisma's precompiled WASM module and uses request-scoped clients; no OpenNext fallback was required.
- Sign-in, protected portal, denial, and sign-out UI is implemented with Tailwind CSS utilities and shared brand tokens. No production deployment was performed.

## Member University directory — Issue #4

Verified locally on September 21, 2026:

- Super Admins can create, edit, archive, restore, list, and inspect Member Universities through the protected directory interface. Other roles are denied for reads and all mutations.
- PostgreSQL enforces normalized name and slug uniqueness, slug format, and Appointment references. Archive and restore preserve the directory record and its history.
- Directory mutations and their redacted audit records share one database transaction. List and detail results are purpose-built DTOs.
- The shared protected-operation factory requires a typed authorization intent, and each directory operation passes its intent through the policy callback.
- ESLint, strict type checking, Prisma validation, and all 30 module tests passed. Both PostgreSQL integration files passed all eight tests against migrations applied to a recreated local `*_test` database.
- Playwright passed all eight desktop/mobile cases against standard Next.js and all eight against the generated Worker through local Wrangler/Workerd. The directory journey creates, edits, archives, and restores a Member University.
- Standard Next.js and Workers builds completed, and `pnpm deploy:check` completed without deploying. No production deployment was performed.

## University Admin invitations — Issue #7

Implemented the Super Admin invitation controls, hashed seven-day tokens, email delivery adapter, invitation-specific Firebase account creation and verification flow, transactional Portal User/Appointment acceptance, and revocation.

Verified locally on September 21, 2026:

- Prisma schema validation, ESLint, strict TypeScript, and all 37 module tests passed.
- The invitation migration applied to the disposable PostgreSQL database. All 12 PostgreSQL integration tests passed, covering hashed token persistence, seven-day expiry, email matching, replay, revocation, archived universities, account linking, Appointment creation, and audit records.
- Playwright passed all 10 desktop/mobile cases against standard Next.js and all 10 against the generated Worker through local Wrangler/Workerd. The invitation journey creates and verifies a Firebase identity, accepts the invitation, creates the Appointment, and enters the scoped portal.
- Standard Next.js and Vinext Workers builds completed; `pnpm deploy:check` completed without deploying.
- The Resend adapter passed provider-request tests with a mocked HTTP response. No real email was sent. Configure `RESEND_API_KEY` and `INVITATION_FROM_EMAIL` before using the adapter in preview or production.
- No production deployment was performed.

## Events vertical slice — prototype

Verified locally on September 21, 2026:

- University Admins can draft and publish events for their own Member University. Super Admins can publish Confederation events. Co-hosts receive attribution without mutation authority.
- Representatives can view published events in a list, Manila-time calendar, and detail page. The signed-in workspace shows upcoming published events.
- University Admins can issue and revoke scoped Representative invitations. Both invitation roles use verified Firebase email, one-time hashed tokens, seven-day expiry, appointment creation, and audit records.
- PostgreSQL integration coverage verifies event persistence, co-host attribution, audit records, Representative read access, Super Admin read access, and co-host mutation denial. All 13 integration tests passed after recreating the dedicated local `_test` database.
- ESLint, strict type checking, and all 43 Vitest tests passed. Standard Next.js and Vinext Worker builds passed. Playwright passed all 12 desktop/mobile tests on both Next.js and the generated Worker through Wrangler/Workerd, including the complete University Admin → published Event → Representative journey.
- `pnpm deploy:check` completed as a dry run without deploying. No production deployment or real email delivery was performed. Set `RESEND_API_KEY` and `INVITATION_FROM_EMAIL` for live invitation delivery.

The prototype covers the access, directory, invitation, and event workflows. Event cover-image staging through R2, Announcements, Shortcuts, birthdays, Financial Reports, Event Evaluations, backups, and pilot hardening remain planned work.

The pre-existing local development database reported a checksum mismatch for the already-applied `20260916233000_harden_access_invariants` migration. To preserve its data, the Event migration SQL was applied directly and marked applied; the database was not reset. The disposable `_test` database applies the complete migration history from scratch successfully.
