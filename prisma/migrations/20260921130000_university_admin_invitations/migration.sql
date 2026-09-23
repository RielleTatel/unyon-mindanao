CREATE TYPE "InvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED');

CREATE TABLE "invitations" (
    "id" UUID NOT NULL,
    "token_hash" CHAR(64) NOT NULL,
    "email" VARCHAR(320) NOT NULL,
    "role" "PortalRole" NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'PENDING',
    "university_id" UUID NOT NULL,
    "invited_by_portal_user_id" UUID NOT NULL,
    "accepted_by_portal_user_id" UUID,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "accepted_at" TIMESTAMPTZ(6),
    "revoked_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "invitations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "invitations_email_normalized" CHECK ("email" = lower(btrim("email"))),
    CONSTRAINT "invitations_lifecycle_check" CHECK (
      ("status" = 'PENDING' AND "accepted_at" IS NULL AND "accepted_by_portal_user_id" IS NULL AND "revoked_at" IS NULL) OR
      ("status" = 'ACCEPTED' AND "accepted_at" IS NOT NULL AND "accepted_by_portal_user_id" IS NOT NULL AND "revoked_at" IS NULL) OR
      ("status" = 'REVOKED' AND "accepted_at" IS NULL AND "accepted_by_portal_user_id" IS NULL AND "revoked_at" IS NOT NULL) OR
      ("status" = 'EXPIRED' AND "accepted_at" IS NULL AND "accepted_by_portal_user_id" IS NULL AND "revoked_at" IS NULL)
    )
);

CREATE UNIQUE INDEX "invitations_token_hash_key" ON "invitations"("token_hash");
CREATE UNIQUE INDEX "invitations_pending_recipient_scope_key"
ON "invitations" ("email", "role", "university_id")
WHERE "status" = 'PENDING';
CREATE INDEX "invitations_status_expires_at_idx"
ON "invitations" ("status", "expires_at");
CREATE INDEX "invitations_university_id_created_at_idx"
ON "invitations" ("university_id", "created_at");

ALTER TABLE "invitations"
ADD CONSTRAINT "invitations_university_id_fkey"
FOREIGN KEY ("university_id") REFERENCES "member_universities"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invitations"
ADD CONSTRAINT "invitations_invited_by_portal_user_id_fkey"
FOREIGN KEY ("invited_by_portal_user_id") REFERENCES "portal_users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "invitations"
ADD CONSTRAINT "invitations_accepted_by_portal_user_id_fkey"
FOREIGN KEY ("accepted_by_portal_user_id") REFERENCES "portal_users"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
