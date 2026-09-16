---
status: accepted
---

# Store private files in Cloudflare R2

Cloudflare R2 will store event images, Financial Report PDFs, and encrypted database backups instead of Supabase Storage. R2's larger free allowance and direct Workers integration reduce cost and remove cross-provider storage authorization; feature modules still authorize domain records before issuing short-lived access, and PostgreSQL tracks staged object state because R2 cannot share a database transaction.
