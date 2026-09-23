ALTER TABLE "portal_users"
ADD COLUMN "birth_date" DATE,
ADD COLUMN "birth_date_version" INTEGER NOT NULL DEFAULT 0,
ADD CONSTRAINT "portal_users_birth_date_version_nonnegative" CHECK ("birth_date_version" >= 0),
ADD CONSTRAINT "portal_users_birth_date_not_future" CHECK (
  "birth_date" IS NULL OR ("birth_date" >= DATE '0001-01-01' AND "birth_date" <= (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')::DATE)
);
