CREATE TYPE "AnnouncementStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TABLE "announcements" (
  "id" UUID PRIMARY KEY, "title" VARCHAR(180) NOT NULL, "body" VARCHAR(10000) NOT NULL,
  "status" "AnnouncementStatus" NOT NULL DEFAULT 'DRAFT', "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "published_at" TIMESTAMPTZ(6), "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "announcements_publication_time" CHECK ("status" <> 'PUBLISHED' OR "published_at" IS NOT NULL)
);
CREATE INDEX "announcements_status_published_at_idx" ON "announcements" ("status", "published_at");
CREATE TABLE "shortcuts" (
  "id" UUID PRIMARY KEY, "label" VARCHAR(120) NOT NULL, "url" VARCHAR(2000) NOT NULL,
  "icon" VARCHAR(48), "sort_order" INTEGER NOT NULL DEFAULT 0 CHECK ("sort_order" >= 0),
  "active" BOOLEAN NOT NULL DEFAULT TRUE, "version" INTEGER NOT NULL DEFAULT 1 CHECK ("version" > 0),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "shortcuts_web_url" CHECK ("url" ~ '^https?://')
);
CREATE INDEX "shortcuts_active_sort_order_idx" ON "shortcuts" ("active", "sort_order");
