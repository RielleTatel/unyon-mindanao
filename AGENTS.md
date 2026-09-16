# Repository Guidelines

## Project Context

This repository implements the Unyon Mindanao Portal. Consult the authoritative document for each change:

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

Treat `package.json` scripts as canonical. Start locally with `pnpm dev`; use `pnpm dev:worker` for Workers-compatible development and `pnpm preview` after `pnpm build:worker` to exercise the Vinext production output. Run `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration`, and `pnpm test:e2e` before handoff. `pnpm deploy:check` validates the Cloudflare package without deploying it.

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

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
