export interface FinancialReportRecord {
  id: string; title: string; reportingPeriod: string; description: string;
  revisions: { id: string; revision: number; status: "DRAFT" | "PUBLISHED" | "SUPERSEDED"; objectId: string | null; publishedAt: string | null }[];
}
