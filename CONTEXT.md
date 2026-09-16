# Unyon Mindanao Portal

The shared language for the private portal used by the Unyon confederation and its participating universities.

## Organizations

**Confederation**:
Unyon ng mga Estudyante sa Mindanao, the organization that governs the portal across all participating universities.
_Avoid_: Unyon organization, central university

**Member University**:
A university participating in the Confederation and represented within the portal.
_Avoid_: Member, tenant, school account

## Access Roles

**Portal User**:
An authorized person with an account in the private portal.
_Avoid_: Member, public user

**Super Admin**:
A Confederation-level Portal User with authority across the entire portal and every Member University.
_Avoid_: Confederation admin, global admin

**University Admin**:
A Portal User whose administrative authority is scoped to a Member University, including publishing that university's events.
_Avoid_: School admin, local super admin

**Representative**:
A Portal User associated with a Member University who can view private portal content and submit evaluations but cannot publish content.
_Avoid_: Member, university admin, public user

**Appointment**:
A time-bounded assignment connecting a Portal User to a Member University and role while preserving former assignments as history.
_Avoid_: Membership, permanent role

**Invitation**:
A time-limited authorization for a specified email address to create a Portal User account and receive an Appointment.
_Avoid_: Public registration, open sign-up

## Events

**Confederation Event**:
An event owned by the Confederation and managed by Super Admins, optionally with Member Universities listed as co-hosts.
_Avoid_: Central university event, unowned event

**University Event**:
An event attributed to one owning Member University and optionally associated with additional co-host Member Universities.
_Avoid_: School event, multi-owner event

**Owning University**:
The Member University whose University Admins may manage a University Event; co-hosts do not gain editing authority.
_Avoid_: Primary tenant, event administrator

## Feedback and Publications

**Event Evaluation**:
Feedback submitted once by an eligible Portal User for a completed event using the active evaluation template.
_Avoid_: Officer evaluation, university evaluation, survey

**Evaluation Template**:
The Confederation-defined set of rating questions and optional comment prompts used for Event Evaluations.
_Avoid_: Form, questionnaire schema

**Financial Report**:
A versioned Confederation publication whose content is an uploaded PDF associated with a reporting period.
_Avoid_: Ledger, accounting record, liquidation entry

**Announcement**:
A Confederation-wide publication managed by a Super Admin for authenticated Portal Users.
_Avoid_: University post, notification

**Shortcut**:
A Super Admin-managed external link displayed to Portal Users in a deliberate order.
_Avoid_: Bookmark, navigation item
