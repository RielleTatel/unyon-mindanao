---
status: accepted
superseded-by: 0005-cloudflare-d1-persistence
---

# Keep database access behind server-side feature modules

Browser code will not query the portal database directly. Feature modules validate input, authorize typed intents, and keep persistence ordering behind protected query and mutation interfaces rather than duplicating checks in routes or UI code. The Prisma/PostgreSQL implementation is superseded by the native D1 adapter decision in [ADR 0005](./0005-cloudflare-d1-persistence.md).
