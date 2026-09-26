ALTER TABLE portal_users ADD COLUMN birth_date TEXT;
ALTER TABLE portal_users ADD COLUMN birth_date_version INTEGER NOT NULL DEFAULT 0 CHECK (birth_date_version >= 0);

CREATE TABLE stored_objects (
  id TEXT PRIMARY KEY,
  key TEXT NOT NULL UNIQUE CHECK (length(key) BETWEEN 1 AND 200),
  purpose TEXT NOT NULL CHECK (purpose IN ('PROFILE_IMAGE', 'EVENT_COVER', 'FINANCIAL_REPORT')),
  resource_id TEXT NOT NULL,
  uploader_id TEXT NOT NULL REFERENCES portal_users(id) ON DELETE RESTRICT,
  mime_type TEXT NOT NULL CHECK (length(mime_type) BETWEEN 1 AND 100),
  size INTEGER NOT NULL CHECK (size > 0),
  sha256 TEXT CHECK (sha256 IS NULL OR (
    length(sha256) = 64 AND sha256 = lower(sha256)
    AND sha256 NOT GLOB '*[^a-f0-9]*'
  )),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'AVAILABLE', 'FAILED')),
  expires_at TEXT NOT NULL,
  cleaned_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (purpose = 'FINANCIAL_REPORT' AND mime_type = 'application/pdf' AND size <= 26214400) OR
    (purpose <> 'FINANCIAL_REPORT' AND mime_type IN ('image/jpeg', 'image/png', 'image/webp') AND size <= 5242880)
  ),
  CHECK (status <> 'AVAILABLE' OR sha256 IS NOT NULL)
);
CREATE INDEX stored_objects_status_expires_idx ON stored_objects(status, expires_at);
ALTER TABLE portal_users ADD COLUMN profile_object_id TEXT REFERENCES stored_objects(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX portal_users_profile_object_id_key ON portal_users(profile_object_id);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 180),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 5000),
  category TEXT NOT NULL CHECK (length(category) BETWEEN 1 AND 80),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'CANCELLED', 'COMPLETED', 'ARCHIVED')),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  all_day INTEGER NOT NULL DEFAULT 0 CHECK (all_day IN (0, 1)),
  location TEXT CHECK (location IS NULL OR length(location) <= 300),
  online_url TEXT CHECK (online_url IS NULL OR length(online_url) <= 2000),
  contact_person TEXT CHECK (contact_person IS NULL OR length(contact_person) <= 160),
  owner_university_id TEXT REFERENCES member_universities(id) ON DELETE RESTRICT,
  created_by_portal_user_id TEXT NOT NULL REFERENCES portal_users(id) ON DELETE RESTRICT,
  published_at TEXT,
  cancelled_at TEXT,
  completed_at TEXT,
  archived_at TEXT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  cover_object_id TEXT UNIQUE REFERENCES stored_objects(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (ends_at > starts_at),
  CHECK (location IS NOT NULL OR online_url IS NOT NULL)
);
CREATE INDEX events_status_starts_idx ON events(status, starts_at);
CREATE INDEX events_owner_status_starts_idx ON events(owner_university_id, status, starts_at);

CREATE TABLE event_co_hosts (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE RESTRICT,
  university_id TEXT NOT NULL REFERENCES member_universities(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  PRIMARY KEY (event_id, university_id)
);
CREATE INDEX event_co_hosts_university_event_idx ON event_co_hosts(university_id, event_id);
