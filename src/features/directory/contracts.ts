export type MemberUniversityStatus = "ACTIVE" | "ARCHIVED";

export interface BirthdayRecord {
  portalUserId: string;
  fullName: string;
  month: number;
  day: number;
  appointments: Array<{ role: "SUPER_ADMIN" | "UNIVERSITY_ADMIN" | "REPRESENTATIVE"; universityId: string | null; universityName: string }>;
}

export interface BirthDateSubject {
  id: string;
  fullName: string;
  status: "ACTIVE" | "DISABLED";
  activeUniversityIds: string[];
}

export interface RestrictedBirthDate {
  id: string;
  birthDate: string | null;
  version: number;
}

export interface RepresentativeAppointmentRecord {
  id: string;
  portalUserId: string;
  fullName: string;
  email: string;
  universityId: string;
  universityName: string;
  startsAt: string;
  endsAt: string | null;
  active: boolean;
}

export interface MemberUniversityRecord {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: MemberUniversityStatus;
  createdAt: string;
  updatedAt: string;
}

export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export interface UniversityAdminInvitationRecord {
  id: string;
  email: string;
  role: "UNIVERSITY_ADMIN" | "REPRESENTATIVE";
  status: InvitationStatus;
  universityId: string;
  universityName: string;
  expiresAt: string;
  createdAt: string;
}

export interface InvitationPreview {
  email: string;
  role: "UNIVERSITY_ADMIN" | "REPRESENTATIVE";
  universityName: string;
  expiresAt: string;
}
