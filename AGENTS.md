# Repository Guidelines

## Project Context

This repository plans the Unyon Mindanao Portal. Consult the authoritative document for each change:

- `CONTEXT.md` defines canonical domain language. Read it before naming models, roles, or workflows.
- `docs/unyon/SRS.md` defines MVP behavior and acceptance criteria.
- `docs/unyon/IMPLEMENTATION_PLAN.md` defines module seams, planned layout, phases, and verification.
- `docs/adr/` records hard-to-reverse technology and architecture decisions. Read the relevant ADR before changing authentication, hosting, persistence, or storage.
- `branding/` contains visual references; the evergreen/olive/gold identity is enduring, while “Year 5” campaign copy is not assumed permanent.

## Project Structure

The repository is documentation-first. The application will use a feature-based layout:

- `src/app/` — thin Next.js route adapters and layouts.
- `src/features/` — access, directory, events, evaluations, communications, financial reports, private files, and dashboard modules.
- `src/platform/` — Firebase, Prisma, R2, email, and observability adapters.
- `src/shared/` — shadcn/ui primitives and stable utilities.
- `prisma/` — schema, migrations, and seed logic.
- `tests/` — integration, end-to-end, and shared fixtures.

Each feature exposes its interface from `server/index.ts`. Import another feature through that interface; keep its implementation private.

## Development Commands

No application package exists yet. For documentation work, run:

```sh
git diff --check
git diff -- docs/ CONTEXT.md AGENTS.md
```

Phase 0 must add canonical `pnpm` scripts for development, Workers preview, build, lint, type-checking, tests, Prisma migrations, backup, and restore verification. Use those scripts once present instead of ad hoc commands.

## Coding and Architecture Conventions

Use strict TypeScript, two-space indentation, `PascalCase` for React modules/types, `camelCase` for functions, and kebab-case feature directories. Keep routes thin and business behavior inside deep feature modules. Browser code must not import Prisma, Firebase administration, server-only modules, or raw R2 bindings. Every protected operation uses a typed authorization intent; PostgreSQL owns roles and Appointments.

## Testing Guidelines

Test through feature interfaces. Use Vitest for module behavior, disposable PostgreSQL for Prisma integration, Firebase Auth Emulator for identity scenarios, and Playwright for critical journeys. Cover every role, expired Appointment, wrong-university, co-host, restricted birth-year, and evaluation-disclosure case.

## Commits and Pull Requests

Use short imperative subjects such as `docs: record storage decision` or `feat(events): publish university event`. Pull requests must identify the SRS requirement, describe authorization and data implications, include UI screenshots when relevant, and report lint, type-check, test, migration, and Workers-preview results.

## Security

Never commit credentials, tokens, production data, unrestricted file URLs, or private stakeholder records. Preserve user-owned files and unrelated changes.

## Agent skills

### Issue tracker

Issues and specifications are tracked in GitHub Issues for this repository. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five canonical triage labels defined in `docs/agents/triage-labels.md`.

### Domain docs

This repository uses a single-context domain layout with `CONTEXT.md` and `docs/adr/`. See `docs/agents/domain.md`.
