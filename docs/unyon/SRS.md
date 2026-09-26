# Software Requirements Specification

## Unyon Mindanao Portal

- **Status:** MVP scope approved for implementation planning (v0.2)
- **Last updated:** 2026-09-16
- **Author:** Gabrielle

## 1. Purpose and Scope

The Unyon Mindanao Portal is a private, responsive web application for the Unyon ng mga Estudyante sa Mindanao and its Member Universities. It centralizes events, announcements, birthdays, shortcuts, Event Evaluations, and Financial Reports for authorized student-government officers.

The MVP replaces fragmented group chats, social posts, and spreadsheets with one governed source of information. It is a pilot built for a small administrative team and a free-tier-first operating model.

Canonical domain terms are defined in [`../../CONTEXT.md`](../../CONTEXT.md).

## 2. Actors and Authority

| Actor | Authority |
| --- | --- |
| Super Admin | Manages the full portal, Member Universities, University Admins, shared content, all events, evaluations, and Financial Reports. |
| University Admin | Manages its Member University profile, Representatives, birthdays, and University Events. It may publish its events without prior approval. |
| Representative | Views published portal content and submits eligible Event Evaluations. |

A University Admin also has Representative capabilities. Authority comes from active, time-bounded Appointments stored by the portal, not from authentication-provider claims.

## 3. Functional Requirements

### 3.1 Authentication and Accounts

- The portal shall have no public content or public registration page.
- Invited users shall sign in through Firebase Authentication using a verified email and password.
- MFA is not required for the MVP; authenticator-app TOTP may be added later.
- A Super Admin shall invite University Admins. A University Admin may invite or deactivate Representatives only for its Member University.
- Invitations shall bind an email, role, Member University, inviter, and seven-day expiration.
- A verified Firebase account without an accepted Invitation and active Appointment shall have no portal access.
- Sessions shall use secure, HTTP-only cookies lasting up to five days. Sensitive account and data actions shall require recent password authentication.
- Ending a user's final active Appointment shall remove portal access while preserving historical attribution.

### 3.2 Member Universities and Portal Users

- Super Admins shall create, update, archive, and restore Member Universities.
- Portal Users may retain multiple historical Appointments but only one active Appointment for the same role and Member University.
- Profiles shall contain full name, verified email, full birth date, optional photograph, account status, and Appointment history.
- The portal shall not collect addresses, student numbers, gender, or phone numbers in the MVP.

### 3.3 Dashboard

The authenticated dashboard shall show upcoming events, recent Announcements, current-month birthdays, open Event Evaluations, and role-specific administrative tasks. Navigation shall include Dashboard, Events, Announcements, Birthdays, Financial Reports, Evaluations, Shortcuts, Profile, and authorized administration areas.

### 3.4 Events and Calendar

- One Event record shall power list, detail, and calendar views.
- Events shall be either Confederation Events or University Events.
- A University Event shall have one Owning University and may list co-host Member Universities. Co-host status shall not grant editing authority.
- Event fields shall include title, description, type, start/end, all-day status, physical location or online link, cover image, contact person, owner, co-hosts, and lifecycle timestamps.
- Event states shall be draft, published, cancelled, completed, and archived.
- Super Admins may manage any Event. University Admins may manage only Events owned by their Member University.
- Dates shall be stored in UTC and displayed in `Asia/Manila`.
- Recurrence, RSVP, registration, arbitrary attachments, and calendar synchronization are excluded from the MVP.

### 3.5 Announcements and Shortcuts

- Super Admins shall manage portal-wide Announcements in draft, published, or archived states.
- Super Admins shall manage ordered Shortcuts containing a label, external URL, and optional icon.
- External destinations shall open in a new tab and be identified as external links.
- University-specific Announcements and scheduled publishing are excluded from the MVP.

### 3.6 Birthdays

- Birthdays shall include Portal Users with active Appointments.
- Every Portal User may see a person's name, Member University, role, birth month, and birth day.
- Only Super Admins and the relevant University Admins may view or edit the birth year.
- Access to a full birth date shall be audited.
- Birthday email and push notifications are excluded from the MVP.

### 3.7 Event Evaluations

- The MVP shall evaluate Events only, not officers or Member Universities.
- A Super Admin shall manage a reusable, versioned Evaluation Template with required 1–5 rating questions and optional comments.
- Each Event shall retain a snapshot of the template version assigned to it.
- An evaluation shall open when its Event ends and close after seven days by default. A Super Admin may close, reopen, or extend it.
- A cancelled Event shall not accept responses.
- A Portal User with an active Appointment when the Event ends may submit one response and edit it until the window closes.
- Super Admins may inspect attributable responses and export them as CSV.
- The Owning University's University Admins may view or export anonymized aggregates and comments only after at least five responses exist.

### 3.8 Financial Reports

- Super Admins shall upload PDF Financial Reports with title, reporting period, description, publication date, and revision number.
- Draft reports shall be visible only to Super Admins; published reports shall be visible to every Portal User.
- Published files shall be immutable. Corrections shall create a new revision and mark the prior revision as superseded.
- Structured income, expense, and liquidation accounting is excluded from the MVP.

### 3.9 Files, Audit, and Administration

- Event cover images shall accept JPEG, PNG, or WebP files up to 5 MB.
- Financial Reports shall accept PDF files up to 25 MB.
- Files shall use private storage, validated file signatures, server-controlled paths, and short-lived authorized downloads.
- The portal shall audit administrative creation, publication, editing, archival, restoration, Appointment changes, and restricted birth-date access.
- Business records shall be archived or deactivated rather than permanently deleted.

## 4. Security and Privacy Requirements

- Firebase shall establish identity only; Cloudflare D1 shall remain authoritative for roles, Appointments, resource ownership, and authorization.
- Every protected read and mutation shall be authorized on the server using current database state.
- Browser code shall never receive database credentials, storage credentials, Firebase administrative credentials, or unrestricted file URLs.
- Scoped resources shall not reveal whether a forbidden record exists.
- Logs shall exclude credentials, tokens, full birth dates, evaluation comments, and signed URLs.
- Identifiable evaluation responses shall be retained for two years; anonymized aggregates may be retained indefinitely.
- Audit records shall be retained for five years. Full birth dates shall be removed one year after the final Appointment ends.

## 5. Quality and Experience Requirements

- The portal shall be responsive and meet WCAG 2.2 AA expectations for keyboard access, focus visibility, semantic structure, contrast, and reduced motion.
- The initial interface language shall be English, with interface text centralized for future translation.
- The UI shall use shadcn/ui and a restrained adaptation of the supplied Unyon branding: evergreen, olive, muted gold, cream, pale sage, organic geometry, and maritime motifs.
- “Year 5” and “Anchored in the Currents” shall be treated as campaign references, not permanent portal copy, unless stakeholders approve otherwise.
- The portal shall support the current and previous major versions of Chrome, Edge, Firefox, and Safari.

## 6. Platform and Operating Constraints

- The application shall use Next.js App Router with TypeScript and deploy as a full-stack Cloudflare Worker through Vinext, with OpenNext as the tested fallback.
- Server-only feature adapters shall access Cloudflare D1 using prepared SQLite statements and atomic batches; Prisma/PostgreSQL is not part of the target production data path.
- Cloudflare R2 shall store private images, PDFs, and encrypted database exports/backups.
- The pilot shall target free service tiers and monitor Workers, D1, and R2 usage; approaching a provider quota shall require archival, optimization, or an approved upgrade before service is affected.
- D1 backup and recovery shall include encrypted exports to R2 and periodic restore tests; the retention schedule shall be finalized with the D1 export/restore implementation.
- Free-tier pausing, quotas, and lack of an uptime SLA shall be disclosed to pilot stakeholders.

## 7. Capacity Assumptions

Design for up to 50 Member Universities, 10 active Portal Users per university, 500 Events per year, 1,000 Event Evaluation responses per Event, and moderate PDF publication. These are design ceilings, not guaranteed free-tier capacity; usage monitoring shall determine when an upgrade is required.

## 8. MVP Acceptance Criteria

The MVP is acceptable when:

1. An invited, verified Super Admin can establish a secure session and create a Member University and University Admin.
2. That University Admin can invite a Representative and publish a University Event.
3. Authorized Portal Users can view the Event in list and calendar views while unauthorized requests are rejected.
4. Eligible users can submit one Event Evaluation and authorized administrators see the correct attributable or anonymized result.
5. A Super Admin can publish an Announcement, Shortcut, birthday, and versioned Financial Report.
6. Authorization, audit, backup, restore, accessibility, and critical browser journeys pass automated or documented verification.

## 9. Explicit Non-Goals

- Public portal access
- Payment processing or dues collection
- Messaging or chat
- Native mobile applications
- RSVP, registration, or attendance tracking
- Google Calendar synchronization
- Birthday or event notifications
- Structured accounting
- Officer or university performance evaluations
