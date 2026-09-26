---
status: accepted
superseded-by: 0005-cloudflare-d1-persistence
---

# Use Firebase for identity and a portal-owned database for authorization

Firebase Authentication proves a user's verified email and identity, while the portal database remains authoritative for Portal Users, time-bounded Appointments, roles, and resource ownership. This avoids synchronizing mutable university authority into Firebase custom claims and keeps authorization decisions consistent with portal history. The initial PostgreSQL choice is superseded by [ADR 0005](./0005-cloudflare-d1-persistence.md), which selects Cloudflare D1.
