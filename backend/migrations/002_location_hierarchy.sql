CREATE TABLE sites (id text PRIMARY KEY, name text NOT NULL CHECK (length(trim(name)) > 0));
CREATE TABLE location_nodes (id text PRIMARY KEY, site_id text NOT NULL REFERENCES sites(id), name text NOT NULL CHECK (length(trim(name)) > 0));
-- Existing installations retain their recorded location, not the newer demo's
-- two-room layout. IDs remain stable and cable/plan revisions do not change.
INSERT INTO sites SELECT 'site-north',site FROM installed_topology;
INSERT INTO location_nodes SELECT 'node-server','site-north',room FROM installed_topology;
ALTER TABLE racks ADD COLUMN node_id text REFERENCES location_nodes(id);
UPDATE racks SET node_id='node-server';
ALTER TABLE racks ALTER COLUMN node_id SET NOT NULL;
CREATE INDEX racks_node ON racks(node_id);
CREATE INDEX nodes_site ON location_nodes(site_id);
