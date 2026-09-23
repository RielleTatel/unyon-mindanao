-- CreateEnum
CREATE TYPE "PortalUserStatus" AS ENUM ('ACTIVE', 'DISABLED');

-- CreateEnum
CREATE TYPE "PortalRole" AS ENUM ('SUPER_ADMIN', 'UNIVERSITY_ADMIN', 'REPRESENTATIVE');

-- CreateTable
CREATE TABLE "portal_users" (
    "id" UUID NOT NULL,
    "firebase_uid" VARCHAR(128) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "full_name" VARCHAR(160) NOT NULL,
    "status" "PortalUserStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "portal_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "appointments" (
    "id" UUID NOT NULL,
    "portal_user_id" UUID NOT NULL,
    "role" "PortalRole" NOT NULL,
    "university_id" UUID,
    "starts_at" TIMESTAMPTZ(6) NOT NULL,
    "ends_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "appointments_scope_check" CHECK (
        ("role" = 'SUPER_ADMIN' AND "university_id" IS NULL) OR
        ("role" <> 'SUPER_ADMIN' AND "university_id" IS NOT NULL)
    ),
    CONSTRAINT "appointments_time_range_check" CHECK (
        "ends_at" IS NULL OR "ends_at" > "starts_at"
    )
);

-- CreateTable
CREATE TABLE "portal_sessions" (
    "id" UUID NOT NULL,
    "portal_user_id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "portal_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "portal_sessions_expiration_check" CHECK (
        "expires_at" > "created_at"
    )
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" UUID NOT NULL,
    "actor_portal_user_id" UUID,
    "action" VARCHAR(120) NOT NULL,
    "resource_type" VARCHAR(120) NOT NULL,
    "resource_id" VARCHAR(160) NOT NULL,
    "correlation_id" VARCHAR(160) NOT NULL,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "portal_users_firebase_uid_key" ON "portal_users"("firebase_uid");

-- CreateIndex
CREATE UNIQUE INDEX "portal_users_email_key" ON "portal_users"("email");

-- CreateIndex
CREATE INDEX "appointments_portal_user_id_starts_at_ends_at_idx" ON "appointments"("portal_user_id", "starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "appointments_role_university_id_idx" ON "appointments"("role", "university_id");

-- A person may retain historical appointments, but only one appointment can be
-- active for the same role and university scope at a time.
CREATE UNIQUE INDEX "appointments_active_scope_key"
ON "appointments" (
    "portal_user_id",
    "role",
    COALESCE("university_id", '00000000-0000-0000-0000-000000000000'::UUID)
)
WHERE "ends_at" IS NULL;

-- CreateIndex
CREATE UNIQUE INDEX "portal_sessions_token_hash_key" ON "portal_sessions"("token_hash");

-- CreateIndex
CREATE INDEX "portal_sessions_portal_user_id_expires_at_idx" ON "portal_sessions"("portal_user_id", "expires_at");

-- CreateIndex
CREATE INDEX "audit_logs_actor_portal_user_id_occurred_at_idx" ON "audit_logs"("actor_portal_user_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_resource_type_resource_id_occurred_at_idx" ON "audit_logs"("resource_type", "resource_id", "occurred_at");

-- CreateIndex
CREATE INDEX "audit_logs_correlation_id_idx" ON "audit_logs"("correlation_id");

-- AddForeignKey
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "portal_sessions" ADD CONSTRAINT "portal_sessions_portal_user_id_fkey" FOREIGN KEY ("portal_user_id") REFERENCES "portal_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_actor_portal_user_id_fkey" FOREIGN KEY ("actor_portal_user_id") REFERENCES "portal_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Audit history is immutable at the database boundary. Corrections must be
-- represented by a new compensating audit event.
CREATE FUNCTION "prevent_audit_log_mutation"()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    RAISE EXCEPTION 'audit logs are append-only';
END;
$$;

CREATE TRIGGER "audit_logs_append_only"
BEFORE UPDATE OR DELETE ON "audit_logs"
FOR EACH ROW EXECUTE FUNCTION "prevent_audit_log_mutation"();
