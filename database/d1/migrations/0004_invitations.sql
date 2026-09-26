CREATE TABLE invitations (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE CHECK (length(token_hash) = 64),
  email TEXT NOT NULL CHECK (length(email) BETWEEN 3 AND 320 AND email = lower(trim(email))),
  role TEXT NOT NULL CHECK (role IN ('UNIVERSITY_ADMIN', 'REPRESENTATIVE')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'REVOKED', 'EXPIRED')),
  university_id TEXT NOT NULL REFERENCES member_universities(id) ON DELETE RESTRICT,
  invited_by_portal_user_id TEXT NOT NULL REFERENCES portal_users(id) ON DELETE RESTRICT,
  accepted_by_portal_user_id TEXT REFERENCES portal_users(id) ON DELETE RESTRICT,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  CHECK (
    (status = 'PENDING' AND accepted_at IS NULL AND accepted_by_portal_user_id IS NULL AND revoked_at IS NULL) OR
    (status = 'ACCEPTED' AND accepted_at IS NOT NULL AND accepted_by_portal_user_id IS NOT NULL AND revoked_at IS NULL) OR
    (status = 'REVOKED' AND accepted_at IS NULL AND accepted_by_portal_user_id IS NULL AND revoked_at IS NOT NULL) OR
    (status = 'EXPIRED' AND accepted_at IS NULL AND accepted_by_portal_user_id IS NULL AND revoked_at IS NULL)
  )
);
CREATE UNIQUE INDEX invitations_pending_recipient_scope_key
  ON invitations(email, role, university_id) WHERE status = 'PENDING';
CREATE INDEX invitations_status_expires_idx ON invitations(status, expires_at);
CREATE INDEX invitations_university_created_idx ON invitations(university_id, created_at);
