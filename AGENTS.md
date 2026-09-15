# Repository Guidelines

## Project Structure & Module Organization

This repository is currently a documentation-first project for the Unyon Mindanao Portal. The active material is under `docs/unyon/`, which is organized as an Obsidian vault:

- `docs/unyon/SRS.md` — draft software requirements and open product questions.
- `docs/unyon/Welcome.md` — default vault welcome note; replace or remove when the documentation structure is established.

There is no application source, test directory, asset directory, or generated build output yet. Keep new planning documents close to the feature or decision they describe, and use relative Markdown links for cross-references.

## Build, Test, and Development Commands

No build or test commands are configured at this stage. For documentation changes, review Markdown in an Obsidian-compatible viewer and inspect the diff with:

```sh
git diff --check
git diff -- docs/unyon/
```

When implementation begins, document the canonical install, development, build, lint, and test commands here and in the project README.

## Coding Style & Naming Conventions

Use Markdown with one top-level `#` heading per document and descriptive `##` sections. Keep prose concise, use bullets for requirements, and preserve the numbering and terminology already used in `docs/unyon/SRS.md`. Name files in `PascalCase.md` for standalone notes (for example, `DataModel.md`) and use descriptive lowercase directory names. Use Obsidian wikilinks only when linking to notes within the vault; use standard Markdown links for external resources.

## Testing Guidelines

No automated testing or coverage requirements exist. Before submitting documentation changes, check links, headings, spelling, and formatting, and run `git diff --check`. Future code should add tests alongside the relevant feature and record its framework and naming convention here.

## Commit & Pull Request Guidelines

The repository has no existing commits, so no established commit convention can be inferred. Use short, imperative subjects such as `docs: clarify evaluation requirements`. Pull requests should explain the scope, identify unresolved requirements or assumptions, link related issues when available, and include screenshots when a rendered document or UI is changed.

## Security & Configuration Tips

Do not commit credentials, private stakeholder data, unpublished financial records, or local editor metadata. Keep unresolved product decisions in the SRS until confirmed with Unyon stakeholders, and update its status and “Last updated” date when requirements change.
