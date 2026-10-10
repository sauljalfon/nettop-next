-- M5a step 3: recording a draft as installed, and the change log for M5b.
--
-- A plan is a draft until it is recorded. Recording marks it read-only and
-- keeps it as the record of the change: the time and the user's note live on
-- the plan row itself. The check ties the three columns together, so a
-- recorded plan always has a time, a non-blank note and a non-blank "recorded
-- by" name (free text until identities exist in M7), and a draft has none.
ALTER TABLE plans
    ADD COLUMN status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','recorded')),
    ADD COLUMN recorded_at timestamptz NULL,
    ADD COLUMN record_note text NULL,
    ADD COLUMN recorded_by text NULL,
    ADD CONSTRAINT plans_record_state CHECK (
           (status = 'draft'    AND recorded_at IS NULL     AND record_note IS NULL AND recorded_by IS NULL)
        OR (status = 'recorded' AND recorded_at IS NOT NULL
            AND record_note IS NOT NULL AND length(trim(record_note)) BETWEEN 1 AND 500
            AND recorded_by IS NOT NULL AND length(trim(recorded_by)) BETWEEN 1 AND 100));

-- The objects a recorded plan added, moved or removed, so an object's history
-- can list the recorded plans that changed it with one indexed query. Endpoints,
-- subpanels and bridges are not listed: they belong to their equipment.
CREATE TABLE plan_objects (
    plan_id text NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    object_kind text NOT NULL CHECK (object_kind IN ('site','node','rack','equipment','cable')),
    object_id text NOT NULL,
    change text NOT NULL CHECK (change IN ('added','moved','removed')),
    PRIMARY KEY (plan_id, object_kind, object_id)
);
-- History looks objects up by ID alone, so the ID leads the index.
CREATE INDEX plan_objects_object ON plan_objects (object_id, object_kind);

-- Direct fixes of installed data that change no topology (M5b) write one row
-- per changed field. Recording a plan does not write here.
CREATE TABLE change_log (
    id bigserial PRIMARY KEY,
    at timestamptz NOT NULL DEFAULT now(),
    entity_kind text NOT NULL,
    entity_id text NOT NULL,
    field text NOT NULL,
    old_value text,
    new_value text,
    note text
);
CREATE INDEX change_log_entity ON change_log (entity_kind, entity_id, at);
