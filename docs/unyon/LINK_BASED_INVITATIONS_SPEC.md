# Private link Invitations

Status: approved conversation decisions synthesized on 2026-09-29. This document specifies the Invitation delivery change; it does not authorize a production deployment or a D1 cutover.

## Problem Statement

The portal currently requires Resend to deliver an Invitation. The Confederation does not yet have a verified sending domain, so an authorized administrator cannot reliably invite a University Admin or Representative. Manually creating every Firebase account would also make administrators responsible for passwords and would duplicate the portal's existing Invitation and Appointment workflow.

## Solution

An authorized administrator enters the intended recipient's email and Member University. The portal creates a private, one-person Invitation and reveals its link once to that administrator, who copies and shares it through a private channel. The recipient opens the link, creates or signs in to their own Firebase email/password account, verifies their email when needed, and accepts the Invitation. The portal grants the specified Appointment only after matching the verified Firebase email to the pending Invitation.

Only the initial Super Admin account is provisioned manually. A Super Admin creates University Admin Invitations. A University Admin creates Representative Invitations only for their Member University; a Super Admin retains their existing Confederation-wide authority. Resend delivery is deferred to a later migration. Firebase's built-in verification email remains part of the existing identity requirement.

## User Stories

1. As an operator, I want to provision the first Super Admin through a controlled one-off procedure, so that the portal has an initial administrator without public registration.
2. As a Super Admin, I want to select an active Member University and enter a University Admin's email, so that I can invite the correct person into the correct scope.
3. As a Super Admin, I want to receive a private Invitation link immediately after creating it, so that I can share it without a sending domain.
4. As a Super Admin, I want a clear copy action and a selectable link, so that I can share it even when clipboard access fails.
5. As a Super Admin, I want to see that the link appears only once, so that I know to copy it before leaving the page.
6. As a Super Admin, I want to see the recipient, role, Member University, and expiry beside the link, so that I can verify it before sharing.
7. As a Super Admin, I want an Invitation creation failure to leave no misleading “sent” message, so that I know whether a usable link exists.
8. As a Super Admin, I want to see pending University Admin Invitations without exposing their raw links, so that I can track access requests safely.
9. As a Super Admin, I want to revoke a pending Invitation, so that an unwanted or lost link can no longer be accepted.
10. As a Super Admin, I want to issue a fresh link after revoking a lost Invitation, so that the intended recipient can still join.
11. As a University Admin, I want to invite a Representative only for my own Member University, so that I can staff my team without gaining authority over another university.
12. As a University Admin, I want the same copy-once link and revoke-and-reissue controls for Representative Invitations, so that I can share and recover them privately.
13. As a Representative, I want to open a valid link and see which Member University and role it grants, so that I can recognize the Invitation before accepting.
14. As an invited person without a Firebase account, I want to create my own password, so that an administrator never handles my credentials.
15. As an invited person with an existing Firebase account, I want to sign in and accept the Invitation, so that I do not create a duplicate account.
16. As an invited person, I want Firebase to verify my email when necessary, so that the portal can establish that I control the invited address.
17. As an invited person, I want to return to the original private Invitation after verification, so that I can finish accepting without the raw token being inserted into a separate verification URL.
18. As an invited person, I want a clear result if the link is expired, revoked, already used, or for a different email, so that I know to contact an administrator for a new Invitation.
19. As an invited person, I want an accepted Invitation to create my Portal User and Appointment once, so that repeated attempts cannot duplicate access.
20. As an unauthorized person holding a forwarded link, I want no Appointment to be granted under a different verified email, so that link forwarding alone cannot change the intended recipient.
21. As a Portal User without an active Appointment, I want portal access to remain denied, so that Firebase authentication alone does not confer a role.
22. As a Super Admin, I want Invitation creation, revocation, and acceptance audited without raw links or tokens, so that access changes are traceable without exposing secrets.
23. As an operator, I want preview and production configuration to permit copy-link Invitations without Resend credentials, so that deployment validation reflects the current delivery mode.
24. As an operator, I want the future Resend migration to remain a separate decision, so that this release does not depend on a verified sending domain.

## Implementation Decisions

- Preserve the canonical Invitation: a specified normalized email, role, Member University, inviter, seven-day expiry, single-use secret, and pending/accepted/revoked/expired lifecycle. Preserve the existing active Appointment and authorization checks.
- Use the existing directory Invitation feature's public server interface as the main behavioral boundary. Change the issue operation to return the created Invitation and its newly generated URL to its authorized caller. The raw URL is absent from persisted records, audit metadata, and logs.
- Keep a 32-byte random token, store only its hash, and place the raw token in the URL fragment. Show the link only in the successful issue response. A lost link cannot be recovered; the administrator revokes the pending Invitation and issues another.
- Remove synchronous Resend delivery from the active issue path. The issue operation succeeds once the Invitation is committed and the copyable URL is returned. Retain provider integration only as dormant code for a later, separately specified migration; do not label a created Invitation as “sent.”
- Reuse the current Super Admin and University Admin authorization intents. Super Admins may create University Admin Invitations and retain Confederation-wide Representative authority; University Admins may create Representative Invitations only for Member Universities covered by an active Appointment.
- Add one shared, accessible presentation of a just-created URL to both administrator surfaces. Display recipient, role, Member University, expiry, copy feedback, and a manual selection fallback. Keep pending-list views free of raw tokens. The URL disappears when the action state or page is left.
- Keep Firebase as the identity provider and the portal database as the sole authority for Portal Users and Appointments. New recipients create their own password and verify the invited address. Existing verified recipients sign in. The acceptance operation verifies the Firebase ID token, matches its verified email to the Invitation, and consumes the Invitation transactionally with Appointment creation.
- Treat Firebase's built-in verification email as an existing requirement. Use a token-free verification continue URL; after verification, instruct the recipient to reopen their original private Invitation. The portal's HTTPS host must be configured as an authorized Firebase Auth domain and verified with a live email test before rollout.
- Continue to reject invalid, expired, revoked, used, wrong-email, and wrong-university cases without granting access. Preserve CSRF and secure-session behavior. Do not consume an Invitation on preview or page load.
- Production and preview validation no longer require Resend credentials for this delivery mode. Existing application-origin, Firebase, and persistence checks remain. Resend credentials, if present, must not silently trigger sending.
- No schema migration is expected for this change because the current Invitation record already stores the required hash, scope, status, and timestamps.
- The first Super Admin is an operational bootstrap, not a general account-creation UI. The existing PostgreSQL bootstrap covers the current PostgreSQL runtime; a controlled remote D1 bootstrap procedure is a separate prerequisite for production D1 cutover.

## Testing Decisions

- Test externally observable behavior through the directory Invitation feature interface, the highest existing seam that covers authorization, issue, preview, acceptance, and revocation. Avoid tests that merely assert internal collaborator calls or implementation structure.
- Add feature-level behavior tests for a Super Admin issuing a University Admin link, a scoped University Admin issuing a Representative link, denial of unauthorized and wrong-university issuance, a seven-day one-time URL, and absence of the raw token from list/audit records.
- Test that the returned URL can preview and accept only once with the correct verified Firebase email, that revoke or expiry blocks acceptance, and that a lost link can be replaced after revocation. Reuse the existing PostgreSQL and D1 integration seams where they provide real persistence behavior.
- Exercise both administrator copy-link screens and the recipient's new-account/existing-account journeys through the existing browser journey suite, including clipboard fallback, accessible feedback, and mobile layout where practical.
- Test environment validation without Resend configuration in preview and production, while preserving Firebase and persistence requirements.
- Prior art includes the existing directory Invitation feature tests, PostgreSQL Invitation integration tests, D1 Invitation tests, and Worker browser journeys. Run focused tests while implementing, then lint, typecheck, the full unit suite, integration and relevant browser suites, and the Cloudflare deployment dry run before handoff.

## Out of Scope

- Resend setup, verified sending domains, automated Invitation email, bulk invitations, public or reusable join links, and passwordless Firebase email-link sign-in.
- Administrator-selected passwords or routine manual Firebase provisioning for University Admins and Representatives.
- Automatic delivery through chat services, SMS, or another integration.
- Production deployment, remote D1 cutover, and a new production D1 bootstrap command. These require their own operational setup and verification.

## Further Notes

- This design follows the existing [domain language](../../CONTEXT.md), [SRS](SRS.md), and [Firebase/D1 architecture decisions](../adr/0005-cloudflare-d1-persistence.md). The Implementation Plan's email-delivery step and operator instructions should be updated alongside the code so they describe the current copy-link mode.
- The user explicitly chose manual first-Super-Admin setup; private links for University Admins and Representatives; one-time link reveal; revoke-and-reissue when lost; manual private-channel sharing; and deferring Resend. Firebase verification was not separately answered in the interview and is retained as the existing SRS requirement. Changing that requirement requires a separate identity decision.
- The [source-backed research note](LINK_BASED_INVITATION_RESEARCH.md) covers Firebase action emails, `workers.dev` authorized domains, manual account-creation alternatives, link security, and the remote D1 bootstrap gap.
