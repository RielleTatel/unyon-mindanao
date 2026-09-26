---
status: accepted
---

# Store private files in Cloudflare R2

Cloudflare R2 will store event images, Financial Report PDFs, and encrypted database backups instead of Supabase Storage. R2's direct Workers integration reduces cross-provider coupling; feature modules still authorize domain records before issuing short-lived access, and D1 tracks staged object state because R2 cannot share a database transaction. Database persistence is updated by [ADR 0005](./0005-cloudflare-d1-persistence.md).
