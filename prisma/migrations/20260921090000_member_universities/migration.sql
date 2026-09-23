CREATE TYPE "MemberUniversityStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

CREATE TABLE "member_universities" (
    "id" UUID NOT NULL,
    "name" VARCHAR(180) NOT NULL,
    "slug" VARCHAR(160) NOT NULL,
    "description" VARCHAR(1000),
    "status" "MemberUniversityStatus" NOT NULL DEFAULT 'ACTIVE',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    CONSTRAINT "member_universities_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "member_universities_name_not_blank" CHECK (btrim("name") <> ''),
    CONSTRAINT "member_universities_slug_format" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

CREATE UNIQUE INDEX "member_universities_normalized_name_key"
ON "member_universities" (
    lower(btrim(regexp_replace("name", '[[:space:]]+', ' ', 'g')))
);

CREATE UNIQUE INDEX "member_universities_normalized_slug_key"
ON "member_universities" (lower(btrim("slug")));

ALTER TABLE "appointments"
ADD CONSTRAINT "appointments_university_id_fkey"
FOREIGN KEY ("university_id") REFERENCES "member_universities"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
