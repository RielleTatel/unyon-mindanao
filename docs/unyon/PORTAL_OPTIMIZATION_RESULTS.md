# Portal Optimization Implementation and Results

- Date: 2026-10-01
- Implementation baseline: local documentation commit `b4d5350`.
- Local implementation commits: `18fc5cd` (protected reads) and `66a1e37` (portal queries, rendering, loading, and regression coverage).
- Specification: [Portal Optimization Spec](./PORTAL_OPTIMIZATION_SPEC.md), tracked in [issue #18](https://github.com/RielleTatel/unyon-mindanao/issues/18).
- Historical measurements: [Portal Performance Audit](./PORTAL_PERFORMANCE_AUDIT.md).
- All measurements and verification use synthetic data and local environments. Implementation commits stay local.
- Verification covers the current working tree, including pre-existing local changes. Only optimization files are included in these commits; unrelated work is preserved.

## Implemented Changes

### Calendar and rendering

The Events calendar groups Events by their Manila start date once and reuses fixed locale/time-zone formatters. Its protected workspace query selects only the requested Manila month, using UTC bounds that handle midnight and leap-day boundaries. Calendar cells, Event cards, Announcement display content, Evaluation display content, and Financial Report display content now render on the server.

Client components retain action state, owner selection, Evaluation answers and window controls, report publication controls, private uploads, password confirmation, and sign-out. Event lifecycle controls receive only their ID, version, status, and completion flag. Evaluation and Report action providers preserve the existing shared pending state and feedback while accepting server-rendered display content as children.

### Feature projections and pages

The dashboard calls feature-owned summary selectors. Publication filters precede database limits: four upcoming published Events and three recent published Announcements are materialized. Evaluation summaries select only open, historically eligible windows and the current user's submitted state. They omit template questions and answer content. Existing Birthday privacy remains enforced by its owning feature.

Evaluation lists compute historical eligibility in one set-based query and load the current user's responses only for the selected page. Response batches finish before their transaction returns, including empty pages. Evaluation and Financial Report resource lookups query the requested ID directly. PostgreSQL attributable results fetch respondents in a batch, replacing the per-response user lookup; anonymous results still omit respondent identities.

Events, Announcements, Evaluations, and Financial Reports have server-driven pages: 50 entities by default, a validated maximum of 100, and stable ordering with an ID tie-breaker. An extra entity determines whether another page exists. Visibility filters and entity limits precede co-host and revision joins, preserving all permitted associated records. Calendar views remain scoped to their month. Administrative directory queries and complete Shortcut ordering retain their existing interfaces.

Protected workspace/page results provide canonical management flags and choices, removing separate page-level actor lookups from Events, Announcements, Evaluations, Reports, and Shortcuts. The portal layout still performs its own access check.

### Read authority and atomic writes

Ordinary protected D1 queries use a read execution mode. They resolve authority on the primary before feature work, then use a fresh primary session for a final authority gate before releasing the private result. The gate rechecks session expiration/revocation, active user status, and captured Appointment IDs, roles, university scopes, and current validity. A failed gate discards the result and retains denial auditing.

Successful ordinary reads no longer stage assertion INSERT/DELETE statements. Queries that intentionally append an audit continue through an atomic guarded batch. Mutations retain in-batch authority guards, optimistic state checks, and atomic audits. PostgreSQL retains its existing serializable transactions.

### Identity loading and Shortcut moves

Authenticated identity actions load Firebase when used. Portal entry has no eager dependency on the Firebase Auth chunk. Sign-in and Invitation acceptance retain their immediate identity dependencies. Sign-out still attempts portal-session revocation and Firebase sign-out and navigates successfully only when both succeed.

The Worker browser failure test exposed Chromium caching a failed native module request. The identity loader now permits up to three explicit requests using a fresh query parameter on the validated, same-origin Firebase chunk URL. A recovered module is reused. This addresses the tested Firebase chunk fetch failure; it does not provide an unlimited recovery loop or replace normal action errors. Both bundlers retain the literal initial import.

Shortcut move buttons send one ID, its version, and a direction. The feature derives the complete ordering once. Captured versions, positions, and membership are checked during the atomic commit, so stale and concurrent changes produce a conflict without persisting a reorder audit.

## Measurements

### Applied calendar preparation

The repeatable [benchmark](../../scripts/benchmark-portal-performance.ts) extracts preparation statements from the baseline and current calendar, omitting JSX. It checks complete projection equality and measures five repetitions on Node `v24.4.1`, with garbage collection between repetitions. Both versions receive identical Events, including UTC-to-Manila date rollovers. Additional comparisons cover leap days, year boundaries, and empty months.

| Synthetic Events | Baseline median | Applied median | Reduction in preparation time |
| --- | --- | --- | --- |
| 100 | 102.37 ms | 0.28 ms | 364.8× |
| 1,000 | 1,020.37 ms | 2.41 ms | 423.4× |

These measure local calendar preparation. They exclude React rendering, hydration, network time, and deployed Workers CPU. The implementation exceeds the specification's tenfold preparation improvement criterion.

### Protected feature calls and projections

The current in-memory D1 fixture contains 50 Member Universities, 500 active Portal Users plus historical inactive respondents, 1,000 future Events split evenly between published/draft, 1,000 Announcements with the same split, 100 past published Events with extended open Evaluation windows, and 1,000 responses to one Event. Historical comparison values come from the audit's smaller university/user fixture with the same Event/Announcement/window counts.

| Operation | Historical baseline | Current result |
| --- | --- | --- |
| Administrator Events-page composition | 10 reads + 2 batches; 1,100 Events | 7 reads, no batches; 50 Events and continuation |
| 100 eligible open Evaluation windows | 104 reads + 1 batch; 600 windows materialized | 5 reads, no batches; selected page contains 100 eligible open windows |
| Dashboard composition | 117 reads + 4 batches | 20 reads, no batches |
| Dashboard Event/Announcement entities | 1,000 + 1,000 before selecting 4 + 3 | 4 + 3 materialized directly |
| Event/Announcement DTO JSON combined | 1,727,782 bytes before summarization | 1,742 bytes of summary DTOs |
| Ordinary-read assertion writes | Two guard statements per protected query | Zero |
| Results for 1,000 responses | No historical comparison collected | 5 reads, no batches; 1,000 attributable responses |

The Evaluation comparison preserves newest-first ordering: 500 future windows precede the 100 open windows, which are selected with `page=5&pageSize=100`. Dashboard summaries still return all 100 currently eligible open windows.

Counts describe logical D1 binding calls, not remote latency or D1 rows-scanned billing. DTO JSON bytes describe server materialization, not browser transfer. The capacity fixture is deliberately synthetic; 100 simultaneous open windows is a stress case.

### Client build and browser requests

Sizes below come from the final default production-pipeline Worker build, with Node's default local gzip settings.

| Client code | Raw bytes | Gzip bytes |
| --- | --- | --- |
| Deferred Firebase Auth chunk | 106,042 | 31,528 |
| Shared identity loader | 531 | 387 |
| Event forms and lifecycle controls | 6,000 | 1,914 |
| Evaluation forms/action provider | 3,489 | 1,251 |
| Report forms/action provider | 2,338 | 875 |
| Communications editors | 2,208 | 784 |

The Event workspace previously emitted 12,740 bytes raw / 3,774 gzip. Events, Communications, Evaluations, and Report display workspaces now emit no client workspace chunk. These are individual chunk measurements; they are not a total route JavaScript budget.

Desktop and mobile Worker checks create a fresh browser context using only portal cookies, with no Firebase browser storage or warm script cache. Initial authenticated entry requests no Firebase Auth chunk. Clicking sign-out requests it, displays pending feedback, reports an injected fetch failure, then successfully retries before navigating to sign-in. Static import-graph inspection independently confirms the sign-out and password-control dependency graphs have no eager Firebase path.

## Hook and Lazy-loading Decisions

- **`useMemo` / `React.memo`:** no blanket memoization was added. The expensive calendar calculation now runs once on the server with a better algorithm. Remaining form calculations operate on small bounded inputs; no measured expensive repeated client calculation justified a new memoization boundary.
- **Native dynamic import:** retained for Firebase, whose approximately 31.5 KB gzip cost is absent from fresh portal entry. Browser request and failure-recovery checks accompany the split.
- **Optional editor lazy loading:** a prototype was removed after measurement. Its loader cost 918 bytes gzip while the entire Communications editor chunk cost about 785 bytes gzip. Small editors keep direct client imports; their display content stays on the server.
- **Private caching:** no cross-request role, session, private DTO, or download-URL cache was introduced. The identity loader caches browser module code, and reusable formatters contain no authority or private result data.

Native module loading and evaluation have distinct caching behavior; actual browser fetch behavior was verified rather than inferred solely from chunk creation. [MDN dynamic import](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/import).

## Verification

| Check | Result |
| --- | --- |
| `pnpm lint` | Passed |
| `pnpm typecheck` | Passed |
| `pnpm test` | 33 files, 102 tests passed |
| `pnpm test:integration` | 10 files, 39 tests passed on a disposable PostgreSQL 14.18 instance |
| `pnpm test:e2e` | 20 passed; 12 Worker-specific checks skipped |
| `pnpm test:e2e:worker` | All 32 desktop/mobile journeys passed |
| `pnpm build:worker` | Default production configuration and matched local verification builds passed |
| `pnpm deploy:check` | Passed the CLI configuration dry run; the command reports no build or deployment |
| Calendar/feature benchmark | Equivalent projections; structural budgets passed |

The original local PostgreSQL role could not create the test database. Verification used a separate instance on port 55437 and did not alter that role. The disposable instance uses UTC: initializing it with the host's Manila timezone exposed an eight-hour timestamp normalization mismatch through the existing Prisma adapter; aligning the test instance with UTC produced the passing run. PostgreSQL rollback environments must retain UTC with this adapter.

Worker verification uses isolated port 3017, with local public Firebase settings supplied explicitly during the production-pipeline build and matching runtime application origin. Next.js verification uses port 3018. No existing project server was stopped. Next.js development emitted “destination stream closed early” messages during rapid navigation; the assertions passed, and the earlier Evaluation transaction error was absent after the fix.

Authorization regression coverage includes published visibility, owning-university drafts, co-host restrictions, session revocation, deactivation, Appointment expiry, role/scope changes during reads, atomic audited reads, stale Shortcut versions, concurrent ordering changes, Evaluation disclosure, and private publication/download journeys.

## Reproducing the Benchmark

From the repository root:

```sh
node --conditions=react-server --expose-gc --import tsx scripts/benchmark-portal-performance.ts b4d5350
```

The benchmark uses an in-memory database and synthetic identifiers; it does not read or modify production records. Browser and integration suites continue using the canonical package scripts and existing fixture interfaces.

## Release Checks

This work establishes local algorithm, query-count, visibility, pagination, atomicity, and deferred-loading results. Production route latency, remote D1 rows-read metadata/query plans, deployed Workers CPU, and route-specific browser render budgets require an authorized release measurement. No production performance certification is claimed.

The cancelled dark-mode/background requests are excluded from this implementation. Theme/background work, pushes, and deployments are outside these local commits.
