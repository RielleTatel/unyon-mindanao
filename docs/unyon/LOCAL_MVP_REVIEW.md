# Local MVP review

This prototype stays on the developer's computer. No preview or production deployment is authorized.

## Start and review the D1 prototype

1. Copy `.env.example` to `.env.local` if needed, and change `LOCAL_SUPER_ADMIN_PASSWORD` to a local-only value.
2. Start `pnpm auth:emulator` in a separate terminal and leave it running.
3. Run `pnpm d1:migrate:local`, then `pnpm bootstrap:local:d1`. These commands use only Wrangler's local D1 persistence and the local Firebase Auth Emulator.
4. Run `pnpm build:worker`, then `pnpm preview:worker:d1:local`. Open `http://localhost:3000` and sign in with the local credentials from `.env.local`.
5. Review the minimal public landing page and dashboard; Universities and invitations; Team turnover; Announcements and Shortcuts; Birthdays; Profile photos and Event covers; PDF Financial Reports; Event Evaluations; and the Super Admin-only Account administration and recent audit activity pages.

The PostgreSQL-backed standard Next.js path remains available for comparison, but it is not the D1 migration target. The D1 preview runs on loopback with `PERSISTENCE_PROVIDER=d1`, Firebase Auth Emulator, and local Wrangler storage. Do not use `pnpm deploy` during local review.

Local Next development stores private files in `.local-private-files`. Local Workerd uses its own persisted R2 simulation under `.wrangler`. Their object stores are deliberately separate: a PDF uploaded through Next is not available through Workerd until uploaded there. Database records remain shared. Keep Workerd as the canonical review runtime and upload review files there.

## Verification

- `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm test:integration`.
- `pnpm test:e2e` exercises the PostgreSQL-backed Next path on desktop and mobile. Three journeys that seed D1 directly (events, evaluations, and university-admin invitations) are skipped here; they run in the Worker suite. The Next suite includes axe WCAG 2.2 A/AA checks on the public pages and 12 authenticated Super Admin screens, plus landing-page keyboard focus and reduced-motion checks. Automated checks do not replace a manual screen-reader and cross-browser review before a real pilot.
- For the D1 journeys, run `pnpm bootstrap:local:d1` and then, after building, `pnpm test:e2e:worker`; this starts the local Workerd preview with the D1 configuration. Do not overlap either browser suite with a Next production build.
- `pnpm d1:backup:local` writes an AES-256-GCM-encrypted snapshot of all 17 D1 application tables, including sessions. Set `D1_BACKUP_ENCRYPTION_KEY` to a separately generated 32-byte base64 key. `pnpm d1:restore:verify:local -- <archive-name>` restores into a fresh temporary local D1 database and reconciles row counts and content. Never use the same key as `D1_MIGRATION_ENCRYPTION_KEY`.
- `pnpm d1:migrate:export:postgres` is a read-only, verified-TLS, repeatable-read export to an encrypted archive (`SOURCE_DATABASE_URL` and `D1_MIGRATION_ENCRYPTION_KEY` are required; optionally set `SOURCE_DATABASE_SSL_CA_PATH` to the provider CA file). It does not include Portal Sessions. `pnpm d1:migrate:import:local -- <archive-name> --persist-to .wrangler/<new-empty-directory>` imports only to a fresh local D1 directory; it has no remote-import mode. Do not run the export against a live source until the migration mapping/archive is explicitly approved.
- `pnpm backup:verify:local` encrypts a consistent logical PostgreSQL snapshot with AES-256-GCM, restores into a newly named disposable database, compares every table's row count, then removes only that disposable database. The encrypted archive and local key remain in ignored `.local-backups` with owner-only permissions. This is a database recovery proof, not an R2 file backup.
- `pnpm health:local` reports database reachability, host/database clock skew, database/file sizes, pending-upload cleanup backlog, and identifiable Evaluation response retention backlog. Optional `LOCAL_DATABASE_BUDGET_BYTES` and `LOCAL_FILE_BUDGET_BYTES` enable 70% warning and 85% action-required thresholds. Missing budgets are reported as unavailable, not healthy zero usage.
- On Account administration, a Super Admin can confirm their current password and run the local retention/cleanup operation. It removes only birth dates past their one-year post-Appointment limit, identifiable Evaluation responses older than two years, and expired or failed staged uploads. The operation is safe to repeat and records counts in the audit log; it does not remove published files or business history.

## Before any real pilot

Remote deployment, invitation email delivery, provider quotas, scheduled retention, encrypted off-site backups, seven-daily/four-weekly rotation, quarterly restore scheduling, maintenance alerts, and cross-browser/accessibility audit require separate operational completion. The local encryption key being beside the archive is acceptable only for this recovery prototype; a pilot must keep keys separately protected. No unattended remote jobs or email sends have been configured.

Do not treat local mock PDFs, test officers, or repeated browser-journey fixtures as stakeholder content. No production/private stakeholder data is required for review.
