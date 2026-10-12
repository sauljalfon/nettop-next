-- M5b step 11: optional descriptive details on the physical objects.
--
-- Every column is nullable text; NULL means "not set" and an empty string is
-- never stored. The fields are data about an object, never topology: nothing
-- that follows continuity reads them. This migration adds columns only. It never
-- fills or guesses a value, so existing rows keep every field empty.
--
-- The checks mirror topology.Validate (value sets, 200 characters, 1,000 for
-- description and notes), so the database is the safety net behind it. The
-- serial number is unique among filled values, ignoring case.

ALTER TABLE equipment
    ADD COLUMN manufacturer text,
    ADD COLUMN model text,
    ADD COLUMN serial_number text,
    ADD COLUMN ip_address text,
    ADD COLUMN status text,
    ADD COLUMN description text,
    ADD CONSTRAINT equipment_details_shape CHECK (
        (manufacturer IS NULL OR length(manufacturer) BETWEEN 1 AND 200)
        AND (model IS NULL OR length(model) BETWEEN 1 AND 200)
        AND (serial_number IS NULL OR length(serial_number) BETWEEN 1 AND 200)
        AND (ip_address IS NULL OR length(ip_address) BETWEEN 1 AND 200)
        AND (status IS NULL OR status IN ('active','inactive','maintenance'))
        AND (description IS NULL OR length(description) BETWEEN 1 AND 1000));
CREATE UNIQUE INDEX equipment_serial_number_unique ON equipment (lower(serial_number)) WHERE serial_number IS NOT NULL;

ALTER TABLE endpoints
    ADD COLUMN port_type text,
    ADD COLUMN connector text,
    ADD COLUMN speed text,
    ADD COLUMN state text,
    ADD COLUMN description text,
    ADD CONSTRAINT endpoints_details_shape CHECK (
        (port_type IS NULL OR port_type IN ('copper','fiber'))
        AND (connector IS NULL OR length(connector) BETWEEN 1 AND 200)
        AND (speed IS NULL OR length(speed) BETWEEN 1 AND 200)
        AND (state IS NULL OR state IN ('available','reserved','disabled','faulty'))
        AND (description IS NULL OR length(description) BETWEEN 1 AND 1000));

-- Cable rows only: a bridge (internal link) keeps all three empty.
ALTER TABLE links
    ADD COLUMN label text,
    ADD COLUMN status text,
    ADD COLUMN notes text,
    ADD CONSTRAINT links_details_shape CHECK (
        (label IS NULL OR length(label) BETWEEN 1 AND 200)
        AND (status IS NULL OR status IN ('active','inactive','testing'))
        AND (notes IS NULL OR length(notes) BETWEEN 1 AND 1000)
        AND (kind = 'cable' OR (label IS NULL AND status IS NULL AND notes IS NULL)));

ALTER TABLE sites
    ADD COLUMN location text,
    ADD COLUMN description text,
    ADD CONSTRAINT sites_details_shape CHECK (
        (location IS NULL OR length(location) BETWEEN 1 AND 200)
        AND (description IS NULL OR length(description) BETWEEN 1 AND 1000));

ALTER TABLE location_nodes
    ADD COLUMN location text,
    ADD COLUMN description text,
    ADD CONSTRAINT location_nodes_details_shape CHECK (
        (location IS NULL OR length(location) BETWEEN 1 AND 200)
        AND (description IS NULL OR length(description) BETWEEN 1 AND 1000));

ALTER TABLE racks
    ADD COLUMN location text,
    ADD COLUMN rack_type text,
    ADD COLUMN description text,
    ADD CONSTRAINT racks_details_shape CHECK (
        (location IS NULL OR length(location) BETWEEN 1 AND 200)
        AND (rack_type IS NULL OR rack_type IN ('standard','wall-mount','open-frame'))
        AND (description IS NULL OR length(description) BETWEEN 1 AND 1000));

-- M5b step 11b: a switch port may have an order and a group.
--
-- `position` (already on every endpoint) orders a switch's ports 1…N in port
-- group order, and `port_group` says which group (1…G) a port belongs to. Ports
-- saved before keep position 0 and group 0. Neither is ever parsed from a
-- label. A switch port still has no side and no subpanel, and the order is
-- unique per switch among ports that have one.
ALTER TABLE endpoints ADD COLUMN port_group integer NOT NULL DEFAULT 0 CHECK (port_group >= 0);
ALTER TABLE endpoints DROP CONSTRAINT IF EXISTS endpoints_shape_by_kind;
ALTER TABLE endpoints ADD CONSTRAINT endpoints_shape_by_kind CHECK (
       (equipment_kind = 'switch' AND position >= 0 AND side = '' AND subpanel_id IS NULL AND (position > 0 OR port_group = 0))
    OR (equipment_kind = 'panel' AND position > 0 AND side IN ('front','rear') AND subpanel_id IS NULL AND port_group = 0)
    OR (equipment_kind = 'hdf' AND position BETWEEN 1 AND 6 AND side IN ('front','rear') AND subpanel_id IS NOT NULL AND port_group = 0));
CREATE UNIQUE INDEX switch_port_position ON endpoints (equipment_id, position) WHERE equipment_kind = 'switch' AND position > 0;
