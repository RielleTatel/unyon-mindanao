# Issue tracker: GitHub

Issues and specifications for this repository live as GitHub issues. Use the `gh` CLI for all operations and infer the repository from `git remote -v`.

## Conventions

- Create an issue: `gh issue create --title "..." --body "..."`.
- Read an issue: `gh issue view <number> --comments` and include its labels.
- List issues: `gh issue list --state open --json number,title,body,labels,comments` with appropriate label and state filters.
- Comment: `gh issue comment <number> --body "..."`.
- Apply or remove labels: `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- Close an issue: `gh issue close <number> --comment "..."`.

## Pull requests as a triage surface

**PRs as a request surface: no.** External pull requests are not included in routine triage discovery. An explicitly named pull request may still be inspected directly.

## Skill operations

When a skill says to publish to the issue tracker, create a GitHub issue. When it says to fetch a ticket, run `gh issue view <number> --comments`.

For wayfinding, use one map issue and link its tickets as GitHub sub-issues when available. Represent blockers with GitHub issue dependencies; if unavailable, add `Blocked by: #<number>` to the child issue. Claim work by assigning the issue to the authenticated user.
