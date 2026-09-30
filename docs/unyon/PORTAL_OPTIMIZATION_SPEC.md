# Optimize Portal Rendering, Data Access, and Client Loading

## Problem Statement

Portal Users need the Events calendar, dashboard, publications, and administrative controls to remain responsive as the Confederation's history grows. Current reads frequently load more records than the screen displays, Evaluation listing adds one database round trip per open window, and the calendar repeatedly reformats every Event for every day. These costs affect initial loads and will not be resolved by adding memoization hooks throughout the interface.

The portal also loads Firebase identity code on every authenticated page and embeds the complete Shortcut ordering in every move button. The implementation needs to reduce these costs while preserving private access, active Appointments, publication visibility, atomic mutations, and audit records. Implementation commits remain local until the user authorizes a push or deployment.

## Solution

Optimize the existing portal in measured stages. Prepare calendar data once, keep display content on the server, return bounded feature-owned projections, make Evaluation eligibility set-based, separate ordinary reads from writes and audited reads, and load optional client code when the corresponding interaction needs it. Introduce manual memoization only where profiling demonstrates repeated expensive work with stable inputs.

Use synthetic capacity fixtures and the existing feature interfaces and local Worker browser journeys to compare behavior, query counts, payloads, and rendering costs before and after each stage.

## User Stories

1. As a Portal User, I want the authenticated dashboard to load promptly, so that I can reach my current Confederation work.
2. As a Portal User, I want the dashboard to retrieve the summaries it displays efficiently, so that historical content does not delay my current work.
3. As a Portal User, I want upcoming Events and recent Announcements to retain their current ordering, so that optimization does not change which content I see first.
4. As a Portal User, I want dashboard summaries to lead to the full feature views, so that efficient previews do not hide accessible content.
5. As a Portal User, I want current-month birthdays to remain visible without birth years, so that performance improvements preserve privacy.
6. As a Representative, I want the dashboard to show only Evaluation windows for which I may respond, so that closed and future windows do not slow or clutter my current work.
7. As a Portal User, I want an accessible loading state during slower navigation, so that I know the portal is responding.
8. As a Portal User, I want empty and failed views to remain understandable, so that efficient loading does not obscure errors.
9. As a Portal User, I want the Event calendar to display a selected month promptly, so that I can plan without waiting for every historical Event to be processed.
10. As a Portal User, I want Events placed on their correct Manila start dates, so that UTC boundaries do not shift my calendar incorrectly.
11. As a Portal User, I want all-day, leap-day, month-end, and year-end Events to retain their current meaning, so that calendar optimization remains accurate.
12. As a Portal User, I want calendar overflow counts and Event links to remain usable, so that busy days still lead me to accessible Events.
13. As a Portal User, I want bounded Event-list pages, so that a growing archive does not produce an increasingly large initial page.
14. As a Portal User, I want pagination to retain applicable ordering and filters, so that I can traverse the accessible collection predictably.
15. As a Representative, I want published Confederation and University Events to remain readable, so that performance work preserves my portal access.
16. As a Representative, I want university drafts and administrative controls to remain private, so that optimization never expands my authority.
17. As a University Admin, I want to see drafts owned by my Member University promptly, so that I can prepare its Events efficiently.
18. As a University Admin, I want to publish my university's Events without prior approval, so that optimization preserves the current publication workflow.
19. As a University Admin, I want drafts belonging to other universities to remain inaccessible, so that performance changes preserve university scope.
20. As a Super Admin, I want to see and publish every University Event draft, so that Confederation-wide authority remains intact.
21. As a Super Admin, I want to manage Confederation Events efficiently, so that their administration does not require loading unrelated records.
22. As an Event co-host, I want attribution without additional editing authority, so that faster projections preserve the ownership rules.
23. As an eligible Portal User, I want Evaluation listing to avoid a separate eligibility request per Event, so that it remains responsive when multiple windows are open.
24. As an eligible Portal User, I want my saved responses and editing eligibility to remain correct, so that optimization does not lose my feedback.
25. As a Portal User, I want Evaluation eligibility to reflect my Appointment when the Event ended, so that efficient queries preserve the accepted rule.
26. As a Super Admin, I want Evaluation results to retain authorized attribution, so that efficient reads remain useful for oversight.
27. As a University Admin, I want anonymized results to retain the disclosure threshold, so that faster reporting does not expose respondents.
28. As a Portal User, I want individual Events, Evaluations, and Financial Reports loaded directly, so that one resource does not require processing the full collection.
29. As a Portal User, I want publication lists to remain responsive as history grows, so that I can reach older accessible content through bounded navigation.
30. As a Portal User, I want private downloads to retain their current authorization, so that client-loading changes do not expose unrestricted files.
31. As a Super Admin, I want to move a Shortcut without every button carrying the full ordering, so that management remains responsive as the list grows.
32. As a Super Admin, I want concurrent Shortcut changes to produce a clear conflict, so that compact move requests do not overwrite another change silently.
33. As a Portal User, I want Shortcuts to retain their intended order and external-link behavior, so that optimization does not change their meaning.
34. As a Portal User, I want authenticated page entry to avoid loading identity code before it is needed, so that initial browser work is smaller.
35. As a Portal User, I want sign-out to revoke both my portal session and Firebase identity state, so that lazy loading preserves complete sign-out.
36. As an administrator, I want recent-password confirmation and uploads to retain pending, error, and retry behavior, so that deferred code remains reliable.
37. As an invited Portal User, I want sign-in and Invitation acceptance to remain ready for identity operations, so that optional loading does not disrupt account access.
38. As a mobile Portal User, I want display content to require less hydration, so that the portal remains usable on slower devices.
39. As a keyboard or assistive-technology user, I want controls, focus, feedback, and loading states to remain accessible, so that performance improvements do not reduce usability.
40. As a deactivated Portal User, I want every new protected operation to deny access immediately, so that caching cannot retain former authority.
41. As a Portal User with an expired Appointment, I want the portal to stop granting scoped access, so that optimized reads respect time-bounded authority.
42. As a maintainer, I want ordinary protected reads to avoid unnecessary database writes, so that viewing content consumes fewer D1 resources.
43. As a maintainer, I want mutations and required audits to remain atomic, so that reduced read overhead does not weaken data integrity.
44. As a maintainer, I want measurements that distinguish database calls, browser work, payloads, wall time, and Workers CPU, so that optimizations address the actual constraint.
45. As a maintainer, I want memoization and lazy loading justified by profiling, so that additional complexity produces a measurable benefit.
46. As a maintainer, I want the existing feature interfaces to remain the verification seams, so that tests survive component and query refactors.
47. As a maintainer, I want optimization commits available locally for review, so that implementation can be evaluated before a push or deployment.

## Implementation Decisions

- Preserve the existing modular monolith, Next.js App Router, Vinext Worker, authoritative D1 persistence, Firebase identity, and private R2 storage. The temporary PostgreSQL rollback implementation remains supported by the existing checks.
- Preserve active Appointment enforcement, university ownership, co-host restrictions, lifecycle transitions, Evaluation disclosure rules, and audit requirements. Do not introduce a Super Admin approval gate for University Event publication.
- Implement in stages: establish repeatable baselines; optimize calendar preparation and projections; reduce Evaluation and dashboard database work; distinguish read execution; then reduce identity loading and Shortcut payloads, bound remaining collections, and profile remaining client updates.
- Keep routes thin. Add typed summary or workspace queries through the owning features' public interfaces rather than importing their repositories into the dashboard or routes.
- Keep permission decisions inside protected operations. A workspace DTO may include authorized management flags and university choices; callers do not supply trusted roles or authority flags.
- Prepare calendar data in one pass using reusable formatters with the fixed Manila time zone. Preserve Event placement by its Manila start day, existing blank cells, ordering, overflow labels, and links.
- Give the calendar a month-scoped query using correct UTC bounds for the Manila month. Do not load unrelated months merely to build one calendar grid.
- Render static Event cards, calendar cells, and publication content with Server Components. Retain client boundaries for forms, lifecycle controls, owner selection, uploads, identity confirmation, and other actual interactions.
- Add feature-owned published Event and Announcement summary selectors. Apply visibility and publication filters before limits. Retain the dashboard's existing four-Event and three-Announcement limits and return only fields needed by those summaries.
- Add an Evaluation dashboard summary that selects currently open, eligible windows and submitted state without loading unrelated windows, template questions, or answer content. Preserve the currently visible eligible items and links to the full view.
- Replace sequential per-window eligibility lookups with a set-based projection. Compute eligibility from canonical Appointment history at each Event's end, using operation database time for current window state. Continue checking submission authority during every mutation.
- Replace whole-collection individual-resource lookups with queries constrained to the requested ID. Do not cache private collections globally to compensate for an inefficient lookup.
- Distinguish ordinary queries from mutations and audited reads in protected execution. Ordinary successful reads must not stage assertion INSERT/DELETE writes solely for authority validation.
- Retain primary database authority resolution before the read and a final primary authority gate before returning a private DTO. Revalidate session revocation, active user status, and the captured active Appointments. Discard the result if authority no longer holds; preserve the current public errors and access-denial audit behavior.
- Keep atomic in-batch authority guards, optimistic state checks, and audit writes for mutations and required audited reads. Restricted birth-date access and other intentional read audits continue writing their required audit records.
- Remove duplicate page-level actor resolution where one protected workspace result can provide the required view flags. Any remaining actor coalescing must be confined to a verified rendering request in both Next.js and Vinext; no module-level cache of roles, sessions, private DTOs, or downloadable URLs is permitted.
- Parallelize only independent authorized reads. Keep dependent mutation, publication, file-commit, and audit steps in their required sequence.
- Load the Firebase client with native dynamic import from authenticated-page identity actions. Preserve complete sign-out, recent-password confirmation, Invitation identity operations, and pending/error/retry behavior. Ensure shared portal entry has no eager import path to the Firebase Auth chunk.
- Consider lazy client editors only when they are substantial and render after an existing user interaction. A closed native details element alone does not defer its child component. Preserve visible forms and accessible interaction behavior; do not create additional steps solely to manufacture a lazy-loading opportunity.
- Replace each Shortcut button's full ordering array with a compact protected move request containing the Shortcut identity, direction, and expected version. Derive the desired ordering once on the server, validate canonical authority and captured state, and update ordering with its audit in one atomic mutation.
- Add typed pagination to growing Event, Announcement, Evaluation, Financial Report, and administrative-directory lists as needed to keep initial collections bounded. Use 50 records by default and a validated maximum of 100; expose continuation metadata and accessible navigation so authorized records remain discoverable.
- Apply authorization and applicable filters before pagination. Limit entity identities before joining one-to-many co-hosts or revisions so a page does not truncate an entity's associated data. Use stable ordering with a unique final tie-breaker and retain the ordering/filter context in continuation tokens.
- Keep Birthdays month-scoped and preserve their public month/day projection. Do not add restricted birth years to an optimized list or summary.
- Add or adjust indexes only after query-plan and rows-read evidence on representative synthetic fixtures. Prefer the existing Event and Appointment indexes when they support the selected projection.
- Treat manual `useMemo`, `useCallback`, and `React.memo` as conditional profiling decisions. They must not be correctness requirements, replace bounded SQL, or mask excessive first-render work. Small navigation arrays and ordinary handlers do not justify them without evidence.
- Keep React Compiler adoption, dependency upgrades, and framework replacement outside this optimization. The current compiler configuration does not provide automatic memoization.
- Add accessible route loading or Suspense boundaries only where local Worker navigation benefits, and report perceived responsiveness separately from total completion time.
- Record before/after build chunks, initial route requests, narrow DTO sizes, D1 call counts, rows read/written, calendar preparation, browser rendering, and Worker CPU separately. Local SQLite or Node timings must not be labeled production latency or deployed CPU.
- Completion criteria include equivalent calendar output with at least a tenfold reduction in median preparation time on the fixed 1,000-Event fixture; at most six logical read calls for listing 100 open Evaluation windows; zero assertion writes for successful ordinary reads; at most four Event and three Announcement summary entities materialized for the dashboard; no eager Firebase Auth dependency from portal entry; compact Shortcut move payloads whose size does not grow with the full collection; and bounded entity pages with unchanged authorized visibility.
- Capture an authenticated Worker browser baseline before setting route-specific TTFB, hydration, or render budgets. A local algorithm improvement is not sufficient evidence to declare a browser or Workers CPU budget passed.
- Keep implementation commits local. Publishing this specification to the issue tracker is the documentation operation requested through `to-spec`; it does not authorize a code push or production deployment.

## Testing Decisions

- The user confirmed existing protected feature interfaces and local Worker browser journeys as the verification seams. Prefer these surfaces over new lower-level application APIs.
- Test visible results, authorization, navigation, lifecycle behavior, conflicts, and audit outcomes. Do not assert the presence of a particular hook, private helper name, formatter construction count, or component hierarchy.
- Extend the existing D1 feature-interface tests for Events, Evaluations, Communications, Directory, Financial Reports, and Access. Their fixture pattern already exercises prepared SQL and atomic batches with synthetic state.
- Verify Super Admin access to every draft, owning University Admin access and publication without prior approval, Representative published-event access, wrong-university denial, co-host restrictions, expired Appointments, user deactivation, and indistinguishable missing/forbidden resources.
- Verify authority revocation between initial resolution and result release. Verify mutation authority and optimistic-state changes between preparation and batch commit. Prove ordinary-read optimization cannot release private results after its final gate rejects authority.
- Verify required audits still occur for denied access, restricted birth-date reads, lifecycle changes, ordering changes, and other existing audited operations. Successful ordinary reads must not consume guard writes.
- Test calendar output across Manila midnight, leap days, all-day Events, month/year boundaries, empty months, repeated start dates, overflow counts, stable Event links, and the existing start-day treatment of multi-day Events.
- Test pagination with mixed publication states, multiple universities, duplicate display sort values, multiple co-hosts/revisions, first/last pages, and invalid continuation inputs. Assert no unauthorized records, omitted associated data, or repeated records during a stable traversal.
- Verify summary selection filters published content before limiting it. Fixtures with many drafts must still return the correct four upcoming published Events and three recent published Announcements.
- Verify Evaluation summaries and full views preserve eligibility at Event end, window boundaries, cancellations, saved response state, template snapshots, and the minimum disclosure threshold.
- Verify direct resource reads and private downloads return the same permitted data while remaining scoped to the requested resource.
- Extend existing desktop/mobile Worker journeys for calendar/list navigation, drafting and publishing, Representative viewing, complete sign-out, recent-password confirmation, Shortcut ordering, and publication access. Use existing accessible-control queries and axe checks as prior art.
- Test deferred identity/editor imports for pending feedback, successful actions, load failure, retry, and accessible focus. Confirm both portal and Firebase sign-out happen before the success navigation.
- Test compact Shortcut moves for first/last-row boundaries, preserved ordering, stale versions, concurrent changes, authority denial, and atomic audit persistence.
- Use isolated synthetic performance fixtures reflecting 50 Member Universities, 500 active Portal Users, 500 Events per year, and up to 1,000 responses per Event. Include accumulated multi-year history and a deliberately high number of simultaneous open windows.
- Keep timing comparisons in a repeatable benchmark rather than fragile unit-test millisecond assertions. Use deterministic query/payload counters for structural acceptance and collect repeated production-build browser measurements for interaction costs.
- Inspect the actual initial JavaScript request graph in a fresh authenticated browser context; chunk creation alone does not prove code is deferred. Compare cold and warm behavior separately and disclose device/network conditions.
- Before local Worker browser comparisons, verify that compiled public Firebase settings match the runtime identity environment. Supply the local environment explicitly to the production build and align build-time and runtime application origins with the isolated test port so generated Invitation links reach the tested Worker. Do not treat mismatched identity settings or link origins as application performance regressions.
- Measure deployed Workers CPU separately during an authorized release check; local wall time includes different costs. Compare provider quotas using current official documentation and the actual account plan.
- Run lint, type checking, module tests, persistence integration tests, standard and Worker browser journeys, the production Worker build, and the Cloudflare package dry run before handing off implementation. Report unavailable prerequisites or failures accurately.

## Out of Scope

- A formal two-axis review of the historical diff.
- New Event approval workflows or changes to which roles may publish University Events.
- Publishing the existing sample drafts, changing production Appointments, or adding further production seed data.
- New MVP features, recurrence, RSVP, registration, calendar synchronization, or changes to Evaluation disclosure policy.
- Blanket hook insertion, global caching of private data, unconditional component lazy loading, React Compiler adoption, dependency upgrades, and hosting/persistence-provider changes.
- Adding missing dashboard product sections merely because a historical ticket mentions them.
- Paid-plan upgrades, production instrumentation, a code push, or a production deployment during this documentation task.

## Further Notes

The local audit measured the current calendar preparation at approximately 1.1 seconds for 1,000 Events; an equivalent one-pass experiment took approximately 2.2 ms. Evaluation listing performed 104 reads for 100 open windows. The dashboard replay performed 117 reads and four batches, and fetched 1,000 Events and 1,000 Announcements before selecting seven displayed summaries. These are synthetic local observations, not production latency measurements.

This work supports the existing [Event publication](https://github.com/RielleTatel/unyon-mindanao/issues/11), [Event calendar](https://github.com/RielleTatel/unyon-mindanao/issues/12), [dashboard](https://github.com/RielleTatel/unyon-mindanao/issues/15), and [pilot release verification](https://github.com/RielleTatel/unyon-mindanao/issues/17) requirements.

React recommends memoization for measured repeated calculations; it does not accelerate an initial render. [React useMemo](https://react.dev/reference/react/useMemo). Component lazy loading begins when that component is first rendered. [React lazy](https://react.dev/reference/react/lazy). Follow the installed framework's server/client and dynamic-import rules and verify the resulting request graph. [Next.js lazy loading](https://nextjs.org/docs/app/guides/lazy-loading).

D1 authority consistency and query-cost validation remain part of the optimization contract. [D1 read replication](https://developers.cloudflare.com/d1/best-practices/read-replication/), [D1 indexes](https://developers.cloudflare.com/d1/best-practices/use-indexes/).
