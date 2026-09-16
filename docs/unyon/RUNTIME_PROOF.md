# Runtime Proof

## Application shell — Issue #2

Verified locally on September 16, 2026:

- `pnpm dev` served the strict TypeScript Next.js App Router shell.
- Vitest rendering tests, ESLint, strict type checking, and environment checks passed.
- Playwright passed the shell journey in desktop Chromium and a Pixel 7 viewport.
- `pnpm build` produced the standard Next.js production output.
- `pnpm build:worker` produced the Vinext Cloudflare output, and `pnpm preview` served that output locally.
- `pnpm deploy:check` completed without deploying.

A one-time Cloudflare temporary preview was smoke-tested before the local-first workflow was requested. It ran as version `944104fa-0b8d-4477-b64a-3f355e7e7a41` on Cloudflare's temporary account infrastructure; it was not a production deployment. No OpenNext fallback was required for the shell. Firebase Admin, Prisma, PostgreSQL, and private-object-storage compatibility remain explicit proof points for their implementation tickets.
