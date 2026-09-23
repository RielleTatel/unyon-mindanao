export interface AnnouncementRecord {
  id: string;
  title: string;
  body: string;
  status: "DRAFT" | "PUBLISHED" | "ARCHIVED";
  version: number;
  publishedAt: string | null;
}

export interface ShortcutRecord {
  id: string;
  label: string;
  url: string;
  icon: string | null;
  active: boolean;
  sortOrder: number;
  version: number;
}
