# Software Requirements Specification (Simple)
## Unyon Mindanao Portal

**Status:** Draft v0.1
**Last updated:** 2026-08-04
**Author:** Gabrielle

---

## 1. Overview

The Unyon Mindanao Portal is a web system for the Unyon ng mga Estudyante sa Mindanao (Mindanao Confederation of College and University Student Governments). It serves as a shared hub for the confederation and its member university student governments — centralizing events, announcements, evaluations, and financial reporting in one place.

## 2. Purpose

Give the confederation and its member schools a single portal to coordinate activities, track shared dates, evaluate events, and stay transparent about finances — replacing scattered group chats, Facebook posts, and spreadsheets.

## 3. Users

- **Confederation admin** — Unyon officers who manage content, post events, publish financial reports, and review evaluations.
- **Member university representative** — student government officers from member universities who view content and may submit evaluations.
- **(Possibly) Public / general student viewer** — see [[#7. Open Questions]] on whether the portal is public or member-only.

## 4. Features

### 4.1 Confederation Calendar
A shared calendar showing confederation-wide dates: assemblies, deadlines, congresses, member-hosted events.

### 4.2 Birthdays
A list or calendar view of birthdays — likely of officers/delegates in the confederation.

### 4.3 Shortcuts
Quick links out to the official Unyon website and official social media page(s).

### 4.4 Events
Event listings with details (title, date, location/host, description). Likely connected to the Calendar feature.

### 4.5 Evaluation
A way to collect feedback/ratings on events or officers/member schools after they happen.

### 4.6 Financial Report
A place to publish and view the confederation's financial reports (income, expenses, liquidation) for transparency to member schools.

## 5. Non-Goals (for this version)

Keeping this SRS simple — the following are explicitly **out of scope** until decided otherwise:

- Payment processing / dues collection
- Messaging or chat between users
- Mobile app (assume responsive web only, unless stated otherwise)

## 6. Assumptions

- This is an internal-facing tool primarily for the confederation and its member university officers.
- Content (events, financial reports) is managed by a small admin team, not self-service by every member school.

## 7. Open Questions

These need to be resolved with the Unyon officers/stakeholders before or during design. Answers should be filled in here as they're confirmed.

### Access & Users
- Who exactly can log in — confederation officers only, or also every member university's student government officers?
- Is any part of the portal public (viewable without login), e.g. events or financial reports for transparency?
- Do member universities need their own accounts/roles, or just view access?
- How many member universities/schools are in the confederation currently?

### Confederation Calendar
- Who can add/edit calendar entries — admin only, or can member schools submit their own events for approval?
- Should it sync with Google Calendar or another external calendar?

### Birthdays
- Whose birthdays — confederation officers only, or all member school officers/delegates?
- Who inputs this data, and how is it kept updated (manual entry vs. profile self-edit)?
- Any notification/reminder needed (e.g., email or dashboard alert on the day)?

### Shortcuts
- What exact links are needed beyond the official website and official page (e.g. Instagram, specific socials)?
- Are shortcuts fixed/hardcoded or admin-editable?

### Events
- Is this distinct from the Calendar, or the same data shown differently (list vs. calendar view)?
- Do events need registration/RSVP, or just informational listing?
- Can member universities submit their own hosted events, or only Unyon admins?

### Evaluation
- What is being evaluated — events, officers, member schools, or all three?
- Who fills out evaluations (member reps only? general students?) and are responses anonymous?
- What happens with results — just stored, or aggregated into visible reports/scores?

### Financial Report
- What format — uploaded documents (PDF) vs. structured data (line items, tables)?
- Who can view financial reports — all member schools, or admin/officers only?
- How often are reports published (per event, quarterly, per term)?
- Who approves/uploads reports?

### General
- Any existing branding/visual identity to follow (colors, logo)?
- Target timeline or launch date?
- Hosting/budget constraints?

## 8. Next Steps

1. Review open questions with Unyon officers.
2. Fill in answers above.
3. Expand this into a fuller SRS (data model, user flows, wireframes) once scope is confirmed.
