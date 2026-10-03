-- M1 step 2: stable HDF subpanel identities with structured row/column fields.
-- Endpoint.subpanel (free text) is replaced by endpoints.subpanel_id, a foreign
-- key to a real subpanel. A non-empty legacy string cannot be reinterpreted as
-- a stable ID, so the upgrade stops before altering anything if one exists in an
-- installed endpoint or in a saved plan's proposed endpoints. Empty strings
-- carry no information and are dropped; existing endpoint IDs are unchanged.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM endpoints WHERE subpanel <> '')
       OR EXISTS (SELECT 1 FROM plans p
            WHERE jsonb_typeof(p.additions->'endpoints') = 'array'
              AND EXISTS (SELECT 1 FROM jsonb_array_elements(p.additions->'endpoints') AS e
                          WHERE COALESCE(e->>'subpanel', '') <> '')) THEN
        RAISE EXCEPTION 'migration 004 cannot map legacy subpanel strings to stable subpanel IDs: endpoints (installed or in saved plans) with a non-empty subpanel exist. Please reset the development database and reseed; legacy subpanel text is never parsed or guessed.';
    END IF;
END $$;

ALTER TABLE equipment DROP CONSTRAINT equipment_kind_check;
ALTER TABLE equipment ADD CONSTRAINT equipment_kind_check CHECK (kind IN ('switch','panel','hdf'));

CREATE TABLE subpanels (
    id text PRIMARY KEY,
    equipment_id text NOT NULL,
    equipment_kind text NOT NULL DEFAULT 'hdf' CHECK (equipment_kind = 'hdf'),
    row_number integer NOT NULL CHECK (row_number BETWEEN 1 AND 32),
    column_letter text NOT NULL CHECK (column_letter IN ('A','B','C','D')),
    UNIQUE (equipment_id, row_number, column_letter),
    UNIQUE (id, equipment_id),
    FOREIGN KEY (equipment_id, equipment_kind) REFERENCES equipment(id, kind)
);

-- Dropping the column also drops the old shape check and the old partial
-- unique index, which both referenced it.
ALTER TABLE endpoints DROP COLUMN subpanel;
ALTER TABLE endpoints ADD COLUMN subpanel_id text;
ALTER TABLE endpoints ADD CONSTRAINT endpoints_subpanel_owner
    FOREIGN KEY (subpanel_id, equipment_id) REFERENCES subpanels(id, equipment_id);
ALTER TABLE endpoints ADD CONSTRAINT endpoints_shape_by_kind CHECK (
       (equipment_kind = 'switch' AND position = 0 AND side = '' AND subpanel_id IS NULL)
    OR (equipment_kind = 'panel' AND position > 0 AND side IN ('front','rear') AND subpanel_id IS NULL)
    OR (equipment_kind = 'hdf' AND position BETWEEN 1 AND 6 AND side IN ('front','rear') AND subpanel_id IS NOT NULL));
CREATE UNIQUE INDEX endpoint_position_identity ON endpoints(equipment_id, COALESCE(subpanel_id, ''), position, side)
    WHERE equipment_kind IN ('panel','hdf');
CREATE INDEX endpoints_subpanel ON endpoints(subpanel_id);
