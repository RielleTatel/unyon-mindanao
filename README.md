# Unyon Mindanao Portal

Private portal for Unyon ng mga Estudyante sa Mindanao and its Member Universities. The application is a modular monolith with a Cloudflare Workers runtime, Firebase Authentication, and a local D1 persistence target; the existing PostgreSQL path remains available during migration review.

**Project status (September 25, 2026):** the local MVP includes the portal workflows listed below and has been exercised in Workerd with D1 and the Firebase Auth Emulator. All 31 unit-test files (84 tests), lint, strict type checking, and the Cloudflare deployment dry-run check pass. PostgreSQL-to-D1 export/import and encrypted D1 backup/restore tooling are implemented and have passed synthetic-only local drills. No remote database was read or changed, and no production deployment or cutover has been made.

## Progress so far

- **Application shell:** branded responsive sign-in and protected portal shell. Standard Next.js and Vinext/Cloudflare Worker development and build paths are available.
- **Access foundation:** Firebase verifies identity and email; the D1 runtime stores Portal Users, roles, Appointments, sessions, and current access. Secure sessions, typed protected operations, audit records, and local Super Admin bootstrap are implemented. The PostgreSQL runtime remains available during migration review.
- **Member University directory — latest update:** Super Admins can create, edit, archive, restore, list, and inspect Member Universities. Database constraints enforce normalized name and slug rules. Mutations and redacted audit records are persisted together, and other roles are denied access to directory operations.
- **University Admin invitations — latest verified update:** Super Admins can issue and revoke seven-day invitations. Acceptance verifies the Firebase email, consumes the one-time token, creates or links the Portal User, and creates an Appointment transactionally. The email adapter uses Resend.
- **Runtime coverage:** documented local verification includes module and PostgreSQL integration tests, desktop and mobile browser journeys, standard Next.js builds, Workers builds and local Wrangler/Workerd previews, and a deployment dry run. See [Runtime Proof](docs/unyon/RUNTIME_PROOF.md) for milestone details.

The D1 feature update was verified locally on September 25, 2026. Wrangler applied all five D1 migrations in an isolated local database; 24 desktop/mobile browser journeys passed against local Workerd, D1, and Firebase Auth Emulator. The current unit suite passes 84 tests. The PostgreSQL export/import utility intentionally omits Portal Sessions; D1 backups preserve sessions and have passed row-count and content reconciliation in a separate local restore. Neither drill used production records.

## Review the D1-target prototype

Requirements: Node.js 22 or later, pnpm 11, and the Firebase Auth Emulator.

Copy `.env.example` to `.env.local`, change `LOCAL_SUPER_ADMIN_PASSWORD`, then start `pnpm auth:emulator` in one terminal. In another terminal run:

```sh
pnpm d1:migrate:local
pnpm bootstrap:local:d1
pnpm build:worker
pnpm preview:worker:d1:local
```

Open `http://localhost:3000`. Wrangler, Firebase, and D1 use local-only configuration. See [Local MVP review](docs/unyon/LOCAL_MVP_REVIEW.md) for the review checklist, encrypted backup/restore commands, and migration guardrails. No command above deploys or contacts a remote D1 database.

## PostgreSQL-backed Next.js reference path

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

University Admin invitation email delivery requires `RESEND_API_KEY` and a verified `INVITATION_FROM_EMAIL` sender. Production requires both values; preview may omit both, in which case invitation delivery remains unavailable. If configured, both values must be valid together. Local invitation sending also requires them; no invitation token is written to logs or the database.

## Architecture

Routes in `src/app/` adapt HTTP and rendering concerns to feature interfaces. Product workflows live in `src/features/`; privileged integrations live in `src/platform/`; reusable browser-safe code lives in `src/shared/`. Each feature exposes its server interface from `server/index.ts`. Browser code must not import Prisma, Firebase administration, server-only modules, or raw Cloudflare bindings.

Firebase proves identity and verified email. In the current local target, D1 owns Portal Users, Appointments, authorization state, and audit records; PostgreSQL remains in the repository as the existing reference/runtime until a reviewed migration and separately approved cutover. Cloudflare Workers uses Vinext, while standard Next.js development remains available. Keep database access behind server-only feature/persistence adapters.

## Project documents

- [Domain language](CONTEXT.md) — canonical roles, organizations, and workflows.
- [Software requirements](docs/unyon/SRS.md) — MVP behavior and acceptance criteria.
- [Implementation plan](docs/unyon/IMPLEMENTATION_PLAN.md) — architecture, phases, and delivery strategy.
- [Runtime proof](docs/unyon/RUNTIME_PROOF.md) — dated implementation and verification record.
- [Architecture decisions](docs/adr/) — accepted decisions for identity, hosting, database access, and private storage.
