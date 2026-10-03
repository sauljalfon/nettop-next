-- M1 step 1: explicit networks and exactly-one membership for switches.
-- No default network is ever assigned. If any switch (installed, or proposed in
-- a saved plan) already exists, its network is unknown, so the upgrade stops
-- before altering anything.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM equipment WHERE kind = 'switch')
       OR EXISTS (SELECT 1 FROM plans p
            WHERE jsonb_typeof(p.additions->'equipment') = 'array'
              AND EXISTS (SELECT 1 FROM jsonb_array_elements(p.additions->'equipment') AS e
                          WHERE e->>'kind' = 'switch')) THEN
        RAISE EXCEPTION 'migration 003 cannot assign networks: switches or saved plan additions with switches exist and their network is unknown. Please reset the development database and reseed; no default network is ever assigned.';
    END IF;
END $$;

CREATE TABLE networks (
    id text PRIMARY KEY,
    name text NOT NULL CHECK (length(trim(name)) > 0)
);
ALTER TABLE equipment ADD COLUMN network_id text REFERENCES networks(id);
ALTER TABLE equipment ADD CONSTRAINT equipment_network_by_kind
    CHECK ((kind = 'switch' AND network_id IS NOT NULL) OR (kind <> 'switch' AND network_id IS NULL));
CREATE INDEX equipment_network ON equipment(network_id);
