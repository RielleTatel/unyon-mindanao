CREATE TYPE "StoredObjectPurpose" AS ENUM ('PROFILE_IMAGE', 'EVENT_COVER', 'FINANCIAL_REPORT');
CREATE TYPE "StoredObjectStatus" AS ENUM ('PENDING', 'AVAILABLE', 'FAILED');
CREATE TYPE "FinancialReportRevisionStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'SUPERSEDED');
CREATE TABLE "stored_objects" (
  "id" UUID PRIMARY KEY, "key" VARCHAR(200) NOT NULL UNIQUE,
  "purpose" "StoredObjectPurpose" NOT NULL, "resource_id" UUID NOT NULL,
  "uploader_id" UUID NOT NULL REFERENCES "portal_users"("id") ON DELETE RESTRICT,
  "mime_type" VARCHAR(100) NOT NULL, "size" INTEGER NOT NULL CHECK ("size" > 0),
  "sha256" CHAR(64), "status" "StoredObjectStatus" NOT NULL DEFAULT 'PENDING',
  "expires_at" TIMESTAMPTZ(6) NOT NULL, "cleaned_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "stored_objects_purpose_limits" CHECK (
    ("purpose" = 'FINANCIAL_REPORT' AND "mime_type" = 'application/pdf' AND "size" <= 26214400) OR
    ("purpose" <> 'FINANCIAL_REPORT' AND "mime_type" IN ('image/jpeg','image/png','image/webp') AND "size" <= 5242880)
  ),
  CONSTRAINT "stored_objects_available_hash" CHECK ("status" <> 'AVAILABLE' OR ("sha256" IS NOT NULL AND "sha256" ~ '^[a-f0-9]{64}$'))
);
CREATE INDEX "stored_objects_status_expires_at_idx" ON "stored_objects"("status", "expires_at");
ALTER TABLE "portal_users" ADD COLUMN "profile_object_id" UUID UNIQUE REFERENCES "stored_objects"("id") ON DELETE RESTRICT;
ALTER TABLE "events" ADD COLUMN "cover_object_id" UUID UNIQUE REFERENCES "stored_objects"("id") ON DELETE RESTRICT;
CREATE TABLE "financial_reports" (
  "id" UUID PRIMARY KEY, "title" VARCHAR(180) NOT NULL, "reporting_period" VARCHAR(120) NOT NULL, "description" VARCHAR(3000) NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE "financial_report_revisions" (
  "id" UUID PRIMARY KEY, "report_id" UUID NOT NULL REFERENCES "financial_reports"("id") ON DELETE RESTRICT,
  "revision" INTEGER NOT NULL CHECK ("revision" > 0), "status" "FinancialReportRevisionStatus" NOT NULL DEFAULT 'DRAFT',
  "object_id" UUID UNIQUE REFERENCES "stored_objects"("id") ON DELETE RESTRICT,
  "published_by_id" UUID REFERENCES "portal_users"("id") ON DELETE RESTRICT,
  "published_at" TIMESTAMPTZ(6), "superseded_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "financial_report_revisions_report_id_revision_key" UNIQUE ("report_id", "revision"),
  CONSTRAINT "financial_report_publication_metadata" CHECK ("status" = 'DRAFT' OR ("object_id" IS NOT NULL AND "published_at" IS NOT NULL AND "published_by_id" IS NOT NULL)),
  CONSTRAINT "financial_report_supersession_metadata" CHECK (("status" = 'SUPERSEDED') = ("superseded_at" IS NOT NULL))
);
CREATE UNIQUE INDEX "financial_report_one_current_revision" ON "financial_report_revisions"("report_id") WHERE "status" = 'PUBLISHED';
CREATE FUNCTION "preserve_published_report"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'Financial Report revisions cannot be deleted'; END IF;
  IF OLD.status <> 'DRAFT' AND (
    NEW.report_id IS DISTINCT FROM OLD.report_id OR NEW.revision IS DISTINCT FROM OLD.revision OR
    NEW.object_id IS DISTINCT FROM OLD.object_id OR NEW.published_at IS DISTINCT FROM OLD.published_at OR
    NEW.published_by_id IS DISTINCT FROM OLD.published_by_id OR NEW.created_at IS DISTINCT FROM OLD.created_at OR
    NEW.status = 'DRAFT' OR (OLD.status = 'SUPERSEDED' AND NEW IS DISTINCT FROM OLD)
  ) THEN RAISE EXCEPTION 'Published Financial Reports are immutable'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER "financial_report_immutable" BEFORE UPDATE OR DELETE ON "financial_report_revisions" FOR EACH ROW EXECUTE FUNCTION "preserve_published_report"();
