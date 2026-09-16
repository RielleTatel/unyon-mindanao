# Unyon Mindanao Portal

Private portal for Unyon ng mga Estudyante sa Mindanao and its Member Universities.

## Development

```sh
pnpm install
pnpm dev
```

Use `pnpm dev:worker` when behavior must be checked in the Workers-compatible Vinext runtime.
After `pnpm build:worker`, use `pnpm preview:worker` for the generated Worker or `pnpm test:e2e:worker` for its browser checks.

## Verification

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm test:e2e
pnpm build
pnpm build:worker
pnpm deploy:check
```

Environment validation is explicit for each deployment tier:

```sh
pnpm env:check:local
NEXT_PUBLIC_APP_ORIGIN=https://preview.example.test pnpm env:check:preview
NEXT_PUBLIC_APP_ORIGIN=https://portal.example.test pnpm env:check:production
```

## Architecture

Routes adapt HTTP and rendering concerns to feature interfaces. Product workflows belong to feature modules, privileged integrations belong to platform adapters, and reusable browser-safe code belongs to shared modules. Client modules must not import database, Firebase administration, or Cloudflare binding adapters.

Cloudflare Workers deployment uses Vinext while the standard Next.js development and build paths remain available. See the accepted architecture decisions before changing authentication, hosting, database access, or private storage.
