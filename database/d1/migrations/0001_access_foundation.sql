PRAGMA foreign_keys = ON;

CREATE TABLE d1_assertion_guard (
  id TEXT PRIMARY KEY,
  passed INTEGER NOT NULL CHECK (passed = 1)
);

CREATE TABLE portal_users (
  id TEXT PRIMARY KEY,
  firebase_uid TEXT NOT NULL UNIQUE CHECK (length(firebase_uid) BETWEEN 1 AND 128),
  email TEXT NOT NULL UNIQUE CHECK (length(email) BETWEEN 3 AND 320 AND email = lower(email)),
  full_name TEXT NOT NULL CHECK (length(full_name) BETWEEN 1 AND 160),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'DISABLED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE member_universities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL CHECK (
    length(name) BETWEEN 1 AND 180 AND name = trim(name)
    AND trim(name) <> '' AND instr(name, '  ') = 0
  ),
  slug TEXT NOT NULL CHECK (
    length(slug) BETWEEN 1 AND 160 AND slug = lower(slug)
    AND slug NOT GLOB '-*' AND slug NOT GLOB '*-'
    AND slug NOT GLOB '*--*' AND slug NOT GLOB '*[^a-z0-9-]*'
  ),
  description TEXT CHECK (description IS NULL OR length(description) <= 1000),
  status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'ARCHIVED')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE UNIQUE INDEX member_universities_normalized_name_key
  ON member_universities(lower(trim(name)));
CREATE UNIQUE INDEX member_universities_normalized_slug_key
  ON member_universities(lower(trim(slug)));

CREATE TABLE appointments (
  id TEXT PRIMARY KEY,
  portal_user_id TEXT NOT NULL REFERENCES portal_users(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('SUPER_ADMIN', 'UNIVERSITY_ADMIN', 'REPRESENTATIVE')),
  university_id TEXT REFERENCES member_universities(id) ON DELETE RESTRICT,
  starts_at TEXT NOT NULL,
  ends_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (role = 'SUPER_ADMIN' AND university_id IS NULL) OR
    (role <> 'SUPER_ADMIN' AND university_id IS NOT NULL)
  ),
  CHECK (ends_at IS NULL OR ends_at > starts_at)
);

CREATE INDEX appointments_portal_user_starts_ends_idx
  ON appointments(portal_user_id, starts_at, ends_at);
CREATE INDEX appointments_role_university_idx
  ON appointments(role, university_id);

CREATE TRIGGER appointments_no_overlap_insert
BEFORE INSERT ON appointments
WHEN EXISTS (
  SELECT 1 FROM appointments AS current
  WHERE current.portal_user_id = NEW.portal_user_id
    AND current.role = NEW.role
    AND current.university_id IS NEW.university_id
    AND current.starts_at < COALESCE(NEW.ends_at, '9999-12-31T23:59:59.999Z')
    AND NEW.starts_at < COALESCE(current.ends_at, '9999-12-31T23:59:59.999Z')
)
BEGIN
  SELECT RAISE(ABORT, 'overlapping appointment');
END;

CREATE TRIGGER appointments_no_overlap_update
BEFORE UPDATE OF portal_user_id, role, university_id, starts_at, ends_at ON appointments
WHEN EXISTS (
  SELECT 1 FROM appointments AS current
  WHERE current.id <> NEW.id
    AND current.portal_user_id = NEW.portal_user_id
    AND current.role = NEW.role
    AND current.university_id IS NEW.university_id
    AND current.starts_at < COALESCE(NEW.ends_at, '9999-12-31T23:59:59.999Z')
    AND NEW.starts_at < COALESCE(current.ends_at, '9999-12-31T23:59:59.999Z')
)
BEGIN
  SELECT RAISE(ABORT, 'overlapping appointment');
END;

CREATE TABLE portal_sessions (
  id TEXT PRIMARY KEY,
  portal_user_id TEXT NOT NULL REFERENCES portal_users(id) ON DELETE RESTRICT,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  expires_at TEXT NOT NULL,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (expires_at > created_at)
);
CREATE INDEX portal_sessions_user_expires_idx
  ON portal_sessions(portal_user_id, expires_at);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor_portal_user_id TEXT REFERENCES portal_users(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (length(action) BETWEEN 1 AND 120),
  resource_type TEXT NOT NULL CHECK (length(resource_type) BETWEEN 1 AND 120),
  resource_id TEXT NOT NULL CHECK (length(resource_id) BETWEEN 1 AND 160),
  correlation_id TEXT NOT NULL CHECK (length(correlation_id) BETWEEN 1 AND 160),
  metadata TEXT NOT NULL DEFAULT '{}' CHECK (json_valid(metadata)),
  occurred_at TEXT NOT NULL
);
CREATE INDEX audit_logs_actor_occurred_idx
  ON audit_logs(actor_portal_user_id, occurred_at);
CREATE INDEX audit_logs_resource_occurred_idx
  ON audit_logs(resource_type, resource_id, occurred_at);
CREATE INDEX audit_logs_correlation_idx
  ON audit_logs(correlation_id);

CREATE TRIGGER audit_logs_append_only_update
BEFORE UPDATE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit logs are append-only');
END;
CREATE TRIGGER audit_logs_append_only_delete
BEFORE DELETE ON audit_logs
BEGIN
  SELECT RAISE(ABORT, 'audit logs are append-only');
END;
