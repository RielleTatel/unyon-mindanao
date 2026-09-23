CREATE TYPE "EventLifecycleStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED', 'ARCHIVED');

CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "description" VARCHAR(5000) NOT NULL,
    "category" VARCHAR(80) NOT NULL,
    "status" "EventLifecycleStatus" NOT NULL DEFAULT 'DRAFT',
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6) NOT NULL,
    "all_day" BOOLEAN NOT NULL DEFAULT false,
    "location" VARCHAR(300),
    "online_url" VARCHAR(2000),
    "contact_person" VARCHAR(160),
    "owner_university_id" UUID,
    "created_by_portal_user_id" UUID NOT NULL,
    "published_at" TIMESTAMPTZ(6),
    "cancelled_at" TIMESTAMPTZ(6),
    "completed_at" TIMESTAMPTZ(6),
    "archived_at" TIMESTAMPTZ(6),
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "events_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "events_valid_time_range" CHECK ("starts_at" < "ends_at"),
    CONSTRAINT "events_has_venue" CHECK ("location" IS NOT NULL OR "online_url" IS NOT NULL)
);

CREATE TABLE "event_co_hosts" (
    "event_id" UUID NOT NULL,
    "university_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "event_co_hosts_pkey" PRIMARY KEY ("event_id", "university_id")
);

CREATE INDEX "events_status_starts_at_idx" ON "events"("status", "starts_at");
CREATE INDEX "events_owner_university_id_status_starts_at_idx" ON "events"("owner_university_id", "status", "starts_at");
CREATE INDEX "event_co_hosts_university_id_event_id_idx" ON "event_co_hosts"("university_id", "event_id");

ALTER TABLE "events" ADD CONSTRAINT "events_owner_university_id_fkey"
    FOREIGN KEY ("owner_university_id") REFERENCES "member_universities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_portal_user_id_fkey"
    FOREIGN KEY ("created_by_portal_user_id") REFERENCES "portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_co_hosts" ADD CONSTRAINT "event_co_hosts_event_id_fkey"
    FOREIGN KEY ("event_id") REFERENCES "events"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_co_hosts" ADD CONSTRAINT "event_co_hosts_university_id_fkey"
    FOREIGN KEY ("university_id") REFERENCES "member_universities"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
