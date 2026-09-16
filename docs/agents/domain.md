# Domain Docs

This repository uses a single-context domain-documentation layout.

## Before exploring

Read the following sources when they are relevant to the task:

- `CONTEXT.md` for canonical domain terms and discouraged synonyms.
- `docs/adr/` for architectural decisions affecting the area being changed.

If either source is absent, continue without creating it preemptively.

## Layout

```text
/
├── CONTEXT.md
├── docs/adr/
└── src/
```

Use terms exactly as defined in `CONTEXT.md` when naming issues, models, tests, and implementation concepts. If a required concept is missing, note the gap for domain modeling instead of silently inventing conflicting language.

Surface any conflict with an existing ADR explicitly. Do not silently override a recorded decision.
