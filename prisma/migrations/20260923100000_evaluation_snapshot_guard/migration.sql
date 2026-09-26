CREATE FUNCTION preserve_event_evaluation_snapshot() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Event Evaluation snapshots cannot be deleted';
  END IF;
  IF NEW.event_id IS DISTINCT FROM OLD.event_id OR NEW.template_id IS DISTINCT FROM OLD.template_id OR NEW.opens_at IS DISTINCT FROM OLD.opens_at THEN
    RAISE EXCEPTION 'Event Evaluation snapshots are immutable';
  END IF;
  RETURN NEW;
END; $$;
CREATE TRIGGER event_evaluation_snapshot_immutable
BEFORE UPDATE OR DELETE ON event_evaluation_windows
FOR EACH ROW EXECUTE FUNCTION preserve_event_evaluation_snapshot();
