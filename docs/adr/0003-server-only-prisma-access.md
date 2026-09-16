---
status: accepted
---

# Keep PostgreSQL access behind server-side feature modules

Browser code will not query PostgreSQL directly. Feature modules will validate input, authorize typed intents, and use Prisma through Supabase's serverless transaction pooler, concentrating policy and persistence ordering behind protected query and mutation interfaces rather than duplicating checks in routes or UI code.
