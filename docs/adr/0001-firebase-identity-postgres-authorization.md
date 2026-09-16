---
status: accepted
---

# Use Firebase for identity and PostgreSQL for authorization

Firebase Authentication proves a user's verified email and identity, while PostgreSQL remains authoritative for Portal Users, time-bounded Appointments, roles, and resource ownership. This avoids synchronizing mutable university authority into Firebase custom claims and keeps authorization decisions consistent with portal history, at the cost of resolving current access from PostgreSQL on protected requests.
