import { z } from "zod";

export const paginationInput = z.object({
  page: z.number().int().min(0).max(100_000).default(0),
  pageSize: z.number().int().min(1).max(100).default(50),
});

export interface PageMetadata {
  page: number;
  pageSize: number;
  hasNext: boolean;
}

export interface PageSelection { limit: number; offset: number }

export interface CollectionPage<Record> extends PageMetadata {
  records: Record[];
}

export function collectionPage<Record>(records: Record[], input: { page: number; pageSize: number }): CollectionPage<Record> {
  return { page: input.page, pageSize: input.pageSize, records: records.slice(0, input.pageSize), hasNext: records.length > input.pageSize };
}
