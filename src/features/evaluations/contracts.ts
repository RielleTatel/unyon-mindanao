export interface EvaluationQuestion { label: string; kind: "RATING" | "COMMENT" }
export interface EvaluationAnswer { position: number; rating: number | null; comment: string | null }
export interface EvaluationRecord {
  eventId: string; title: string; templateVersion: number; questions: EvaluationQuestion[];
  opensAt: string; closesAt: string; closed: boolean; version: number;
  canRespond: boolean; canViewResults: boolean; response: { version: number; answers: EvaluationAnswer[] } | null;
}
export type EvaluationResults = { disclosure: "WITHHELD" } | {
  disclosure: "ANONYMOUS" | "ATTRIBUTABLE"; count: number; questions: EvaluationQuestion[];
  ratings: { position: number; average: number }[]; comments: { position: number; comment: string }[];
  responses: { fullName: string; email: string; answers: EvaluationAnswer[] }[];
};
