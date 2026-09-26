---
status: accepted
date: 2026-09-25
---

# Use Cloudflare D1 for portal persistence

## Decision

Use Cloudflare D1 as the portal's authoritative database, with server-only feature adapters using prepared SQLite statements. Keep Firebase as the identity provider and R2 as private object storage. Provision separate D1 databases for preview and production. Do not deploy or cut over production as part of this decision; keep Supabase available as a rollback source until the full MVP migration and restore checks pass.

## Context

The portal is hosted on Cloudflare Workers and requires database state in protected workflows. The existing implementation uses Prisma/PostgreSQL transactions to couple authority checks, feature mutations, and audit records. Prisma's D1 adapter does not provide the interactive transaction behavior this code currently relies on. Replacing only the connection would weaken those guarantees.

## Consequences

- Feature modules will use native D1 SQL adapters behind their existing server interfaces; browser and route code remain database-agnostic.
- Writes and their audit records must be submitted in one atomic D1 `batch()`. Because authorization reads occur before that batch, the batch must recheck current session/Appointments and use checked conditional mutations for mutable state.
- SQLite schema constraints, indexes, and triggers will replace PostgreSQL-specific types and constraints. Timestamps will use normalized UTC ISO-8601 strings and JSON fields will be validated JSON text.
- D1 integration tests must run against a local Worker-compatible D1 database, in addition to feature-interface tests.
- Prisma/PostgreSQL remains in the repository temporarily as the rollback and migration source. The Worker runtime must not switch to D1 until every in-scope feature has a D1 adapter and its critical tests pass.
- Data export/import, backup/restore, quota checks, and environment bindings are separate migration tasks; no Supabase project or data is deleted by this ADR.

This decision supersedes the PostgreSQL persistence choices in ADRs 0001 and 0003, and updates the metadata-store portion of ADR 0004. Firebase identity, Cloudflare hosting, and R2 object storage remain unchanged.
