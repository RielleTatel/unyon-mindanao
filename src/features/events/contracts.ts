export type EventLifecycleStatus =
  | "DRAFT"
  | "PUBLISHED"
  | "CANCELLED"
  | "COMPLETED"
  | "ARCHIVED";

export interface EventRecord {
  id: string;
  title: string;
  description: string;
  category: string;
  status: EventLifecycleStatus;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string | null;
  onlineUrl: string | null;
  contactPerson: string | null;
  coverObjectId: string | null;
  ownerUniversityId: string | null;
  ownerUniversityName: string;
  coHosts: Array<{ id: string; name: string }>;
  version: number;
  publishedAt: string | null;
  manageable: boolean;
  canComplete: boolean;
}

export interface EventUniversityChoice {
  id: string;
  name: string;
}
