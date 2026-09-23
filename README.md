# Unyon Mindanao Portal

Private portal for Unyon ng mga Estudyante sa Mindanao and its Member Universities. The application is being built as a modular monolith with Next.js, PostgreSQL, Firebase Authentication, and a Cloudflare Workers runtime.

**Project status (September 21, 2026):** the branded application shell, access foundation, Member University directory, and University Admin invitation workflow are implemented and verified locally. The MVP remains in progress; Event publishing, Representative turnover, evaluations, communications, birthdays, financial reports, and private files remain future work. No production deployment has been made.

## Progress so far

- **Application shell:** branded responsive sign-in and protected portal shell. Standard Next.js and Vinext/Cloudflare Worker development and build paths are available.
- **Access foundation:** Firebase verifies identity and email; PostgreSQL is the authority for Portal Users, roles, Appointments, and current access. Secure sessions, typed protected operations, audit records, and local Super Admin bootstrap are implemented.
- **Member University directory — latest update:** Super Admins can create, edit, archive, restore, list, and inspect Member Universities. PostgreSQL enforces normalized name and slug constraints. Mutations and redacted audit records share a transaction, and other roles are denied access to directory operations.
- **University Admin invitations — latest verified update:** Super Admins can issue and revoke seven-day invitations. Acceptance verifies the Firebase email, consumes the one-time token, creates or links the Portal User, and creates an Appointment transactionally. The email adapter uses Resend.
- **Runtime coverage:** documented local verification includes module and PostgreSQL integration tests, desktop and mobile browser journeys, standard Next.js builds, Workers builds and local Wrangler/Workerd previews, and a deployment dry run. See [Runtime Proof](docs/unyon/RUNTIME_PROOF.md) for milestone details.

The invitation update was verified on September 21, 2026. Validation passed for lint, strict type checking, Prisma validation, 37 module tests, 12 PostgreSQL integration tests, 10 desktop/mobile E2E cases on standard Next.js, and 10 on the generated Worker. Standard and Workers builds completed, and `pnpm deploy:check` completed without deploying. The Resend adapter was tested with a mocked provider response; no email was sent.

## Run locally

Requirements: Node.js 22 or later, pnpm 11, and Docker with Compose.

Copy `.env.example` to `.env.local` and change `LOCAL_SUPER_ADMIN_PASSWORD` before starting local services. Then run:

```sh
pnpm install
pnpm db:up
pnpm db:migrate
pnpm auth:emulator
```

Keep the Firebase Auth Emulator running. In a second terminal, prepare the dedicated integration-test database and bootstrap the local Super Admin:

```sh
pnpm db:test:prepare
pnpm bootstrap:local
pnpm dev
```

The app is available at `http://localhost:3000`. The local emulator account defaults to `admin@unyon.local`; its password is set in `.env.local`. Integration-test preparation recreates the configured test database and refuses hosts other than localhost or database names that do not end in `_test`.

For the Workers-compatible development runtime, use `pnpm dev:worker`. To exercise a built Worker locally, run `pnpm build:worker` followed by `pnpm preview:worker`. The E2E suite for that runtime is `pnpm test:e2e:worker`.

## Verification commands

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm build:worker
pnpm deploy:check
```

Environment configuration can be checked independently for each tier:

```sh
pnpm env:check:local
NEXT_PUBLIC_APP_ORIGIN=https://preview.example.test pnpm env:check:preview
NEXT_PUBLIC_APP_ORIGIN=https://portal.example.test pnpm env:check:production
```

`pnpm deploy:check` validates the Cloudflare package without deploying it.

University Admin invitation email delivery requires `RESEND_API_KEY` and a verified `INVITATION_FROM_EMAIL` sender. Production and preview environment checks require both values. Local invitation sending also requires them; no invitation token is written to logs or the database.

## Architecture

Routes in `src/app/` adapt HTTP and rendering concerns to feature interfaces. Product workflows live in `src/features/`; privileged integrations live in `src/platform/`; reusable browser-safe code lives in `src/shared/`. Each feature exposes its server interface from `server/index.ts`. Browser code must not import Prisma, Firebase administration, server-only modules, or raw Cloudflare bindings.

Firebase proves identity and verified email. PostgreSQL owns portal roles, Appointments, authorization state, and audit records. Cloudflare Workers deployment uses Vinext, while standard Next.js development and builds remain available. Prisma generates separate Node.js and Workerd clients behind one server-only adapter; do not import generated clients outside the database platform adapter and typed persistence boundary.

## Project documents

- [Domain language](CONTEXT.md) — canonical roles, organizations, and workflows.
- [Software requirements](docs/unyon/SRS.md) — MVP behavior and acceptance criteria.
- [Implementation plan](docs/unyon/IMPLEMENTATION_PLAN.md) — architecture, phases, and delivery strategy.
- [Runtime proof](docs/unyon/RUNTIME_PROOF.md) — dated implementation and verification record.
- [Architecture decisions](docs/adr/) — accepted decisions for identity, hosting, database access, and private storage.
