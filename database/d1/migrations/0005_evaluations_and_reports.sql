CREATE TABLE evaluation_template_versions (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL UNIQUE CHECK (version > 0),
  questions TEXT NOT NULL CHECK (
    json_valid(questions) AND json_type(questions) = 'array'
    AND json_array_length(questions) BETWEEN 1 AND 30
  ),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
INSERT INTO evaluation_template_versions (id, version, questions)
VALUES (
  'b0000000-0000-4000-8000-000000000001', 1,
  '[{"label":"Overall event experience","kind":"RATING"},{"label":"Organization and delivery","kind":"RATING"},{"label":"Comments or suggestions","kind":"COMMENT"}]'
);

CREATE TABLE event_evaluation_windows (
  event_id TEXT PRIMARY KEY REFERENCES events(id) ON DELETE RESTRICT,
  template_id TEXT NOT NULL REFERENCES evaluation_template_versions(id) ON DELETE RESTRICT,
  opens_at TEXT NOT NULL,
  closes_at TEXT NOT NULL,
  closed INTEGER NOT NULL DEFAULT 0 CHECK (closed IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (closes_at > opens_at)
);
CREATE TABLE evaluation_responses (
  id TEXT PRIMARY KEY,
  event_id TEXT NOT NULL REFERENCES event_evaluation_windows(event_id) ON DELETE RESTRICT,
  portal_user_id TEXT NOT NULL REFERENCES portal_users(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  submitted_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (event_id, portal_user_id)
);
CREATE TABLE evaluation_answers (
  response_id TEXT NOT NULL REFERENCES evaluation_responses(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0),
  rating INTEGER,
  comment TEXT CHECK (comment IS NULL OR length(comment) <= 2000),
  PRIMARY KEY (response_id, position),
  CHECK (
    (rating IS NOT NULL AND rating BETWEEN 1 AND 5 AND comment IS NULL) OR
    (rating IS NULL AND comment IS NOT NULL)
  )
);

CREATE TRIGGER evaluation_template_immutable_update
BEFORE UPDATE ON evaluation_template_versions
BEGIN
  SELECT RAISE(ABORT, 'Evaluation Template versions are immutable');
END;
CREATE TRIGGER evaluation_template_immutable_delete
BEFORE DELETE ON evaluation_template_versions
BEGIN
  SELECT RAISE(ABORT, 'Evaluation Template versions are immutable');
END;

CREATE TRIGGER event_evaluation_snapshot_insert
AFTER INSERT ON events
WHEN NEW.status = 'PUBLISHED'
BEGIN
  INSERT OR IGNORE INTO event_evaluation_windows (event_id, template_id, opens_at, closes_at)
  SELECT NEW.id, id, NEW.ends_at,
         strftime('%Y-%m-%dT%H:%M:%fZ', julianday(NEW.ends_at) + 7.0)
  FROM evaluation_template_versions ORDER BY version DESC LIMIT 1;
END;
CREATE TRIGGER event_evaluation_snapshot_update
AFTER UPDATE OF status ON events
WHEN NEW.status = 'PUBLISHED'
BEGIN
  INSERT OR IGNORE INTO event_evaluation_windows (event_id, template_id, opens_at, closes_at)
  SELECT NEW.id, id, NEW.ends_at,
         strftime('%Y-%m-%dT%H:%M:%fZ', julianday(NEW.ends_at) + 7.0)
  FROM evaluation_template_versions ORDER BY version DESC LIMIT 1;
END;
INSERT INTO event_evaluation_windows(event_id, template_id, opens_at, closes_at)
SELECT id, 'b0000000-0000-4000-8000-000000000001', ends_at,
       strftime('%Y-%m-%dT%H:%M:%fZ', julianday(ends_at) + 7.0)
FROM events WHERE published_at IS NOT NULL;

CREATE TRIGGER event_evaluation_snapshot_immutable_update
BEFORE UPDATE ON event_evaluation_windows
WHEN NEW.event_id <> OLD.event_id OR NEW.template_id <> OLD.template_id OR NEW.opens_at <> OLD.opens_at
BEGIN
  SELECT RAISE(ABORT, 'Evaluation snapshot identity is immutable');
END;
CREATE TRIGGER event_evaluation_snapshot_immutable_delete
BEFORE DELETE ON event_evaluation_windows
BEGIN
  SELECT RAISE(ABORT, 'Evaluation snapshots cannot be deleted');
END;

CREATE TABLE financial_reports (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 180),
  reporting_period TEXT NOT NULL CHECK (length(reporting_period) BETWEEN 1 AND 120),
  description TEXT NOT NULL CHECK (length(description) BETWEEN 1 AND 3000),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);
CREATE TABLE financial_report_revisions (
  id TEXT PRIMARY KEY,
  report_id TEXT NOT NULL REFERENCES financial_reports(id) ON DELETE RESTRICT,
  revision INTEGER NOT NULL CHECK (revision > 0),
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED', 'SUPERSEDED')),
  object_id TEXT UNIQUE REFERENCES stored_objects(id) ON DELETE RESTRICT,
  published_by_id TEXT REFERENCES portal_users(id) ON DELETE RESTRICT,
  published_at TEXT,
  superseded_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  UNIQUE (report_id, revision),
  CHECK (status = 'DRAFT' OR (object_id IS NOT NULL AND published_at IS NOT NULL AND published_by_id IS NOT NULL)),
  CHECK ((status = 'SUPERSEDED') = (superseded_at IS NOT NULL))
);
CREATE UNIQUE INDEX financial_report_one_current_revision
  ON financial_report_revisions(report_id) WHERE status = 'PUBLISHED';

CREATE TRIGGER financial_report_immutable_update
BEFORE UPDATE ON financial_report_revisions
WHEN OLD.status <> 'DRAFT' AND (
  NEW.report_id <> OLD.report_id OR NEW.revision <> OLD.revision OR
  NEW.object_id IS NOT OLD.object_id OR NEW.published_at IS NOT OLD.published_at OR
  NEW.published_by_id IS NOT OLD.published_by_id OR NEW.created_at <> OLD.created_at OR
  NEW.status = 'DRAFT' OR
  (OLD.status = 'SUPERSEDED' AND (
    NEW.status IS NOT OLD.status OR NEW.superseded_at IS NOT OLD.superseded_at
  ))
)
BEGIN
  SELECT RAISE(ABORT, 'Published Financial Reports are immutable');
END;
CREATE TRIGGER financial_report_immutable_delete
BEFORE DELETE ON financial_report_revisions
WHEN OLD.status <> 'DRAFT'
BEGIN
  SELECT RAISE(ABORT, 'Financial Report revisions cannot be deleted');
END;
