CREATE TABLE installed_topology (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    revision text NOT NULL,
    site text NOT NULL,
    room text NOT NULL
);
CREATE TABLE racks (
    id text PRIMARY KEY,
    name text NOT NULL,
    units integer NOT NULL CHECK (units BETWEEN 1 AND 100)
);
CREATE TABLE equipment (
    id text PRIMARY KEY,
    name text NOT NULL,
    kind text NOT NULL CHECK (kind IN ('switch','panel')),
    role text NOT NULL,
    rack_id text NOT NULL REFERENCES racks(id),
    unit integer NOT NULL CHECK (unit > 0),
    height integer NOT NULL CHECK (height > 0),
    UNIQUE (id,kind),
    UNIQUE (id,rack_id)
);
CREATE TABLE rack_occupancy (
    equipment_id text NOT NULL,
    rack_id text NOT NULL,
    unit integer NOT NULL CHECK (unit > 0),
    PRIMARY KEY (rack_id,unit),
    FOREIGN KEY (equipment_id,rack_id) REFERENCES equipment(id,rack_id)
);
CREATE TABLE endpoints (
    id text PRIMARY KEY,
    equipment_id text NOT NULL,
    equipment_kind text NOT NULL,
    label text NOT NULL,
    subpanel text NOT NULL DEFAULT '',
    position integer NOT NULL DEFAULT 0,
    side text NOT NULL DEFAULT '',
    FOREIGN KEY (equipment_id,equipment_kind) REFERENCES equipment(id,kind),
    CHECK ((equipment_kind = 'switch' AND position = 0 AND side = '' AND subpanel = '')
        OR (equipment_kind = 'panel' AND position > 0 AND side IN ('front','rear')))
);
CREATE UNIQUE INDEX panel_endpoint_identity ON endpoints(equipment_id,subpanel,position,side) WHERE equipment_kind = 'panel';
CREATE TABLE links (
    id text PRIMARY KEY,
    kind text NOT NULL CHECK (kind IN ('cable','internal')),
    UNIQUE (id,kind)
);
CREATE TABLE link_endpoints (
    link_id text NOT NULL,
    endpoint_id text NOT NULL REFERENCES endpoints(id),
    kind text NOT NULL,
    slot smallint NOT NULL DEFAULT 1 CHECK (slot IN (1,2)),
    FOREIGN KEY (link_id,kind) REFERENCES links(id,kind),
    PRIMARY KEY (link_id,slot),
    UNIQUE (endpoint_id,kind)
);
CREATE TABLE plans (
    id text PRIMARY KEY,
    name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 100),
    base_revision text NOT NULL,
    revision bigint NOT NULL CHECK (revision > 0),
    additions jsonb NOT NULL CHECK (jsonb_typeof(additions) = 'object'),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);
