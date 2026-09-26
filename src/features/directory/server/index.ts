import "server-only";
export { withProfileFeature, createProfileFeature, type ProfileRepository, type ProfileRecord } from "./profile";
export { withAccountFeature, createAccountFeature, PrismaAccountRepository, type AccountRepository } from "./account-administration";

export { createBirthdayFeature, type BirthdayRepository } from "./birthdays";
export { withBirthdayFeature } from "./birthday-runtime";

export { createRepresentativeAppointmentFeature, type RepresentativeAppointmentRepository } from "./representative-appointments";
export { withRepresentativeAppointmentFeature } from "./representative-appointment-runtime";

export { withMemberUniversityFeature } from "./runtime";
export { withUniversityAdminInvitationFeature } from "./university-admin-invitation-runtime";
export {
  createMemberUniversityFeature,
  type DirectoryCapabilities,
  type MemberUniversityRepository,
} from "./member-universities";
export {
  createUniversityAdminInvitationFeature,
  type InvitationAcceptanceRepository,
  type UniversityAdminInvitationRepository,
} from "./university-admin-invitations";
export type {
  MemberUniversityRecord,
  MemberUniversityStatus,
  InvitationPreview,
  UniversityAdminInvitationRecord,
} from "../contracts";
