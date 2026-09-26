---
status: accepted
---

# Host the full-stack application on Cloudflare Workers through Vinext

The portal will remain a standard Next.js App Router project and use Vinext as its Cloudflare Workers deployment path. Because Vinext is beta and Workers has strict free-tier CPU limits, the local runtime proof must exercise Firebase sessions, D1, R2, Server Actions, and representative rendering before any production deployment; OpenNext is the fallback if that proof fails.
