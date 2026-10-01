# Portal Performance Audit

- Date: 2026-09-30
- Audited snapshot: `daaf41a`, including the pre-existing local working-tree changes.
- Historical reference: `0c4293f` (`cd45980^`), before the D1 persistence and portal refresh.
- Deliverable: measured findings and an [implementation specification](./PORTAL_OPTIMIZATION_SPEC.md).
- Implementation ticket: [GitHub issue #18](https://github.com/RielleTatel/unyon-mindanao/issues/18), labeled `ready-for-agent` and attached to the project map.
- Applied implementation and verification: [Optimization Results](./PORTAL_OPTIMIZATION_RESULTS.md), recorded on 2026-10-01.
- Measurements use synthetic fixtures and local build artifacts. No production records or credentials are included.

## Findings

The highest-value changes are reducing repeated calendar work and database calls, narrowing data projections, and avoiding eager Firebase loading. Adding React hooks throughout the portal would leave the most expensive initial-load work in place.

| Priority | Finding | Evidence | Proposed change |
| --- | --- | --- | --- |
| P1 | Calendar preparation repeatedly scans every Event and creates a formatter for every comparison. | With 1,000 synthetic Events, the current calculation took a median 1,094.64 ms; an equivalent one-pass experiment took 2.19 ms. | Group Events by their Manila start date once, reuse date formatters, and render the calendar on the server. |
| P1 | Evaluation listing performs a separate eligibility query for each open, visible window. | 100 open windows caused 104 read calls and one two-statement guard batch. The eligibility loop awaits each query sequentially. | Calculate eligibility in a set-based database projection; provide a narrow dashboard summary. |
| P1 | Ordinary protected reads perform guard writes. | Each protected list/choice operation commits an assertion INSERT and DELETE, even when the feature changes no business data. | Distinguish ordinary reads from mutations and audited reads, retaining current authority checks and atomic write guards. |
| P1 | Dashboard limits are applied after full feature collections are loaded. | The fixture fetched 1,000 Events to display four and 1,000 Announcements to display three. Their JSON DTO representations totaled 1,727,782 bytes before summarization. | Add authorized summary selectors that filter and limit inside the owning features. |
| P2 | The portal header eagerly imports Firebase Auth. | The production Worker build emits a 105,949-byte Firebase chunk, 31,500 bytes with local gzip. The sign-out chunk statically imports it. | Import the Firebase client on the identity action that needs it; preserve both portal-session revocation and Firebase sign-out. |
| P2 | Shortcut move buttons each serialize the complete ordering array. | At 100 Shortcuts, the enabled buttons contain 772,398 bytes of raw JSON order values before HTML escaping or compression. | Send a compact, versioned move intent and derive the order once on the server. |
| P2 | Entire workspaces enter the client graph although much of their content is static. | Events, Communications, Evaluations, and Financial Reports combine display content with interactive controls. The Event workspace chunk alone is 12,740 bytes raw / 3,774 gzip. | Keep display content in Server Components and place client boundaries around forms and controls. |
| P2 | Some individual resource lookups load the whole collection; primary lists are unbounded. | Evaluation `get` calls `list().find(...)`; Financial Report `get` calls `list(true).find(...)`. Event list and calendar share an unrestricted collection. | Query requested IDs directly; add bounded list pages and a month-scoped calendar projection. |
| P2 | Page composition repeats actor lookups and serializes independent feature reads. | The administrator Events-page composition performed 10 reads and two batches: 12 logical database calls, including four guard writes. | Return one authorized workspace DTO where appropriate; parallelize only independent reads. |

These priorities reflect measured algorithm and query costs plus confirmed import/data-flow behavior. They are not a ranking of measured production route latency.

## Measurement Method

The build was produced with `pnpm build:worker`, using Vinext's production pipeline. Chunk sizes came from the emitted client JavaScript; gzip sizes were computed locally with Node's zlib defaults. They describe individual chunks, not total route transfer sizes or a browser waterfall.

The chunk measurements use the default production environment. Local Worker browser verification uses a separate production-pipeline rebuild with the local environment supplied explicitly, so compiled public Firebase settings match the local Auth Emulator and Worker bindings. The first browser attempt used mismatched build-time identity settings and is not a valid authentication baseline. Verification runs on isolated port 3017 to avoid another project's development server, with the build-time and runtime application origins also set to that port so generated Invitation links reach the tested Worker.

The calendar experiment ran on Node `v24.4.1`. It extracted the current Calendar's preparation statements and date helpers, omitting JSX. Both implementations received the same Event arrays and a 31-day month. Three repetitions were measured, with garbage collection between runs. The comparison checked deep equality of the complete day-to-Event projection, including UTC dates that move to the following Manila day.

| Synthetic Events | Current median | One-pass experiment median | Current date-key calculations | One-pass date-key calculations |
| --- | --- | --- | --- | --- |
| 100 | 98.06 ms | 0.31 ms | 3,100 | 100 |
| 1,000 | 1,094.64 ms | 2.19 ms | 31,000 | 1,000 |

This isolates calendar preparation. It excludes React rendering, hydration, browser parsing, network latency, and deployed Workers CPU. The experiment has not been applied to application code.

The database experiment used the existing feature factories and D1 repositories against the repository's in-memory SQLite fixture. An instrumented database counted `first`, `all`, and `batch` calls. The Events-page and dashboard compositions replayed the same public feature calls and layout/page actor resolutions used by the routes. Local SQLite batches were serialized to model atomic D1 batches correctly.

The fixture contained 1,000 upcoming Events (500 published and 500 drafts), 1,000 Announcements with the same split, and 100 additional past published Events with deliberately extended open Evaluation windows. All identities, titles, and descriptions were synthetic. It stress-tests collection growth and simultaneous open windows; it does not describe the production database.

| Replayed operation | Reads | Batch calls | Batch statements | Relevant output |
| --- | --- | --- | --- | --- |
| Administrator Events-page composition | 10 | 2 | 4 | 1,100 Event records returned |
| Evaluation listing | 104 | 1 | 2 | 600 windows returned; 100 eligible open windows |
| Dashboard composition | 117 | 4 | 8 | 1,000 Events → 4; 1,000 Announcements → 3; 600 windows → 100 open eligible summaries |

These are logical D1 binding-call counts. In-memory elapsed times are not estimates of remote D1 latency. The DTO byte counts describe server-side materialization, not bytes actually transferred to the browser by the dashboard.

Shortcut values were calculated by executing the existing ordering helper for each enabled move button with synthetic UUIDs:

| Shortcuts | Raw JSON in enabled order-button values |
| --- | --- |
| 50 | 191,198 bytes |
| 100 | 772,398 bytes |
| 1,000 | 77,923,998 bytes |

The growth is quadratic because each of roughly two buttons per row carries every ID. Escaping, compression, and the rest of the HTML were not measured.

## Source Evidence

- [Event workspace](../../src/features/events/ui/event-workspace.tsx): client boundary, Calendar preparation, and per-comparison date formatter.
- [Event date formatting](../../src/features/events/format.ts): constructs a new formatter for every displayed Event range.
- [Dashboard projection](../../src/features/dashboard/server/index.ts): loads full feature collections, then filters and slices.
- [Evaluation feature](../../src/features/evaluations/server/evaluations.ts): sequential per-window eligibility checks.
- [D1 Evaluation repository](../../src/features/evaluations/server/d1-evaluation-repository.ts): eligibility query, transaction-local response cache, and whole-list ID lookup.
- [D1 transaction runner](../../src/features/access/server/d1-transaction-runner.ts): unconditional guard staging and commit for protected queries.
- [D1 session repository](../../src/features/access/server/d1-session-repository.ts), [portal layout](../../src/app/portal/layout.tsx), and [Events route](../../src/app/portal/events/page.tsx): repeated time/actor resolution and page composition.
- [Sign-out button](../../src/features/access/ui/sign-out-button.tsx) and [Firebase client](../../src/features/access/client/firebase-auth.ts): eager identity SDK import.
- [Communications workspace](../../src/features/communications/ui/communications-workspace.tsx): full ordering JSON for each Shortcut move button; closed details still mount their editors.
- [D1 Financial Report repository](../../src/features/financial-reports/server/d1-financial-report-repository.ts): whole-list ID lookup.
- [D1 schema](../../database/d1/migrations/0003_events_and_files.sql): Event status/start and owner/status/start indexes already exist.

## React and Loading Decisions

| Technique | Decision for this portal |
| --- | --- |
| `useMemo` | Do not add it to the current calendar as the primary fix. It cannot reduce the expensive initial render. The calendar has no local interactive state, and the draft form keeps its state in a separate child. First change the algorithm and component boundary. Add memoization only if profiling later shows expensive repeated client calculations with stable dependencies. |
| `useCallback` / `React.memo` | Do not wrap the small navigation calculations or ordinary event handlers by default. Use them only where an expensive child receives stable props and repeated renders are measured. |
| Native dynamic `import()` | Use for Firebase actions from already-authenticated portal pages. Preserve pending, error, retry, and complete sign-out behavior. Sign-in remains an identity-critical path. |
| `React.lazy` / `next/dynamic` | Consider only substantial optional client editors that render after the user opens them. Splitting a component that renders immediately still loads it immediately. Moving static content to the server is the first step. |
| Server Components | Use for Event cards/calendar and publication display content. Retain client islands for action state, owner selection, uploads, identity confirmation, and downloads that require client interaction. |
| Reused `Intl.DateTimeFormat` | Use for fixed locale/time-zone formats. A formatter holds no Portal User authority or private result data. |
| Request memoization | Consider only verified request-scoped actor resolution in both Next.js and Vinext. Each protected operation and mutation must continue checking canonical authority. Never cache private DTOs or roles across requests. |
| React Compiler | Not configured in the current Next.js or Vite configuration. Adoption requires its own compatibility/profiling evidence; it is not a substitute for bounded queries or better algorithms. |
| Streaming/loading UI | Add an accessible loading state where a slow protected route benefits from it. Measure perceived improvement separately from completion time; a loading state does not reduce database work. |
| Database indexes | Use query plans and rows-read evidence before adding indexes. The existing indexes are a useful starting point; small month-scoped Birthday reads are not the first optimization target. |

React documents that `useMemo` helps skip repeated calculations and does not speed the first render. [React useMemo](https://react.dev/reference/react/useMemo). Lazy loading delays a component's code until it is first rendered. [React lazy](https://react.dev/reference/react/lazy).

The installed Next.js guide was also consulted: Server Components are already split automatically; dynamic importing a Client Component from a Server Component currently does not provide automatic client splitting. Defer optional client components from a client boundary when that yields a measured benefit. [Next.js lazy loading](https://nextjs.org/docs/app/guides/lazy-loading).

## Implementation Order

1. Capture repeatable Worker build, browser, and query-count baselines using synthetic data.
2. Replace repeated calendar scans/formatter construction, keep static Events content on the server, and scope the calendar query to its month.
3. Remove Evaluation eligibility round trips and add narrow feature-owned dashboard summary projections.
4. Introduce an ordinary-read execution path with primary authority validation while preserving mutation and audited-read guards. This change requires revocation and concurrency regression coverage before adoption.
5. Defer Firebase identity code from portal entry and replace Shortcut ordering payloads with compact protected intents.
6. Bound list queries and individual lookups, then profile remaining client updates before introducing manual memoization or optional editor loading.

Public feature interfaces and local Worker browser journeys are the agreed verification seams. Existing authorization and audit contracts remain requirements of every optimization.

## Runtime and Capacity Constraints

The SRS design ceilings are 50 Member Universities, 500 active Portal Users, 500 Events per year, and 1,000 Evaluation responses per Event. A two-year Event fixture and a high-open-window fixture help expose costs that the current three sample drafts cannot reveal.

D1's `first-primary` session mode routes the first query to the primary, and writes use the primary. Do not switch private authority checks to potentially stale replicas as a shortcut. [D1 read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/).

Use `EXPLAIN QUERY PLAN` and D1's rows-read/rows-written metadata when checking changes to query shape or indexes. [D1 indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/).

The current Workers Free CPU limit is 10 ms per invocation. A local wall-clock benchmark does not establish compliance with that CPU limit; deployed measurements are a separate release check. [Workers limits](https://developers.cloudflare.com/workers/platform/limits/).

## Verification

- Worker production build: passed with the default production configuration; matched local-environment verification rebuilds also passed.
- Lint: passed.
- Type checking: passed.
- Unit tests: 32 files, 86 tests passed.
- Standard Next.js browser suite: 18 passed, 10 D1-specific journeys skipped.
- Worker browser suite: all 28 desktop/mobile journeys passed in the final complete run, using matched local identity settings and application origin on isolated port 3017.
- PostgreSQL integration suite: blocked before test execution because the configured local role cannot create the disposable test database (`permission denied to create database`, SQLSTATE `42501`). Database privileges were not changed.
- Cloudflare package check: passed via the deployment dry run; no deployment was performed.
- Calendar experiment: equivalent projections for both fixture sizes.
- Database replay: completed with synthetic in-memory data.

This audit does not certify production latency or implement the proposed runtime changes. The accompanying specification defines those changes and their completion criteria.
