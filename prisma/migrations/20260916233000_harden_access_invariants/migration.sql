-- Enforce non-overlapping historical and current Appointment periods for each
-- person, role, and university scope.
BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist;

DROP INDEX "appointments_active_scope_key";

ALTER TABLE "appointments"
ADD CONSTRAINT "appointments_non_overlapping_scope"
EXCLUDE USING gist (
    "portal_user_id" WITH =,
    "role" WITH =,
    (COALESCE("university_id", '00000000-0000-0000-0000-000000000000'::UUID)) WITH =,
    tstzrange("starts_at", "ends_at", '[)') WITH &&
);

-- Include TRUNCATE in the immutable audit boundary. A statement trigger covers
-- every mutation form without depending on affected row count.
DROP TRIGGER "audit_logs_append_only" ON "audit_logs";

CREATE TRIGGER "audit_logs_append_only"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "audit_logs"
FOR EACH STATEMENT EXECUTE FUNCTION "prevent_audit_log_mutation"();

COMMIT;
