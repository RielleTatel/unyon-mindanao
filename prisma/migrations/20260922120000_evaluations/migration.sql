CREATE TABLE evaluation_template_versions (
  id UUID PRIMARY KEY, version INTEGER NOT NULL UNIQUE CHECK (version > 0),
  questions JSONB NOT NULL CHECK (jsonb_typeof(questions) = 'array' AND jsonb_array_length(questions) BETWEEN 1 AND 30),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO evaluation_template_versions(id, version, questions) VALUES ('b0000000-0000-4000-8000-000000000001', 1,
  '[{"label":"Overall event experience","kind":"RATING"},{"label":"Organization and delivery","kind":"RATING"},{"label":"Comments or suggestions","kind":"COMMENT"}]');
CREATE TABLE event_evaluation_windows (
  event_id UUID PRIMARY KEY REFERENCES events(id) ON DELETE RESTRICT,
  template_id UUID NOT NULL REFERENCES evaluation_template_versions(id) ON DELETE RESTRICT,
  opens_at TIMESTAMPTZ(6) NOT NULL, closes_at TIMESTAMPTZ(6) NOT NULL,
  closed BOOLEAN NOT NULL DEFAULT false, version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  CHECK (closes_at > opens_at)
);
CREATE TABLE evaluation_responses (
  id UUID PRIMARY KEY, event_id UUID NOT NULL REFERENCES event_evaluation_windows(event_id) ON DELETE RESTRICT,
  portal_user_id UUID NOT NULL REFERENCES portal_users(id) ON DELETE RESTRICT,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0), submitted_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  UNIQUE(event_id, portal_user_id)
);
CREATE TABLE evaluation_answers (
  response_id UUID NOT NULL REFERENCES evaluation_responses(id) ON DELETE CASCADE,
  position INTEGER NOT NULL CHECK (position >= 0), rating INTEGER, comment VARCHAR(2000),
  PRIMARY KEY(response_id, position),
  CHECK ((rating IS NOT NULL AND rating BETWEEN 1 AND 5 AND comment IS NULL) OR (rating IS NULL AND comment IS NOT NULL))
);
CREATE FUNCTION preserve_evaluation_template() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Evaluation Template versions are immutable'; END; $$;
CREATE TRIGGER evaluation_template_immutable BEFORE UPDATE OR DELETE ON evaluation_template_versions FOR EACH ROW EXECUTE FUNCTION preserve_evaluation_template();
CREATE FUNCTION snapshot_event_evaluation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'PUBLISHED' THEN
    INSERT INTO event_evaluation_windows(event_id, template_id, opens_at, closes_at)
    SELECT NEW.id, id, NEW.ends_at, NEW.ends_at + INTERVAL '7 days' FROM evaluation_template_versions ORDER BY version DESC LIMIT 1
    ON CONFLICT (event_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER event_evaluation_snapshot AFTER INSERT OR UPDATE OF status ON events FOR EACH ROW EXECUTE FUNCTION snapshot_event_evaluation();
INSERT INTO event_evaluation_windows(event_id, template_id, opens_at, closes_at)
SELECT id, 'b0000000-0000-4000-8000-000000000001', ends_at, ends_at + INTERVAL '7 days' FROM events WHERE published_at IS NOT NULL;
