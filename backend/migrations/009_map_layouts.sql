-- Conceptual map step 1: saved node positions for the overview. Presentation
-- data only: one coordinate space for the whole network, separate from
-- node_layouts (the site screen) so the two arrangements never overwrite each
-- other, and separate from installed topology, saved plans and revisions
-- (saving a position never changes a revision). A position exists only for a
-- node the user has moved. x/y are an arrangement, never physical coordinates;
-- the range check bounds them (NaN sorts above every number in PostgreSQL, so
-- it fails the check too).
CREATE TABLE map_layouts (
    node_id text PRIMARY KEY REFERENCES location_nodes(id) ON DELETE CASCADE,
    x double precision NOT NULL CHECK (x BETWEEN -1000000 AND 1000000),
    y double precision NOT NULL CHECK (y BETWEEN -1000000 AND 1000000),
    updated_at timestamptz NOT NULL DEFAULT now()
);
