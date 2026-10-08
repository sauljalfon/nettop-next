-- M4 step 2: networks get a creation order and a case-insensitive unique name.
-- Existing networks keep today's order, which is ID order, so existing colors
-- stay the same; a new network takes the next number. The name rule would
-- reject existing data if two networks already collide ignoring case and
-- surrounding spaces, so the upgrade stops before altering anything. It never
-- renames or merges networks: fix the names and migrate again.
DO $$
DECLARE clash text;
BEGIN
    SELECT string_agg(quote_literal(btrim(name)), ', ') INTO clash FROM (
        SELECT min(name) AS name FROM networks GROUP BY lower(btrim(name)) HAVING count(*) > 1
    ) c;
    IF clash IS NOT NULL THEN
        RAISE EXCEPTION 'migration 006 cannot make network names unique ignoring case: these names collide: %. The migration never renames networks; rename them to be distinct, then migrate again.', clash;
    END IF;
END $$;

CREATE SEQUENCE networks_seq;
ALTER TABLE networks ADD COLUMN seq bigint;
UPDATE networks n SET seq = o.rn FROM (SELECT id, row_number() OVER (ORDER BY id) AS rn FROM networks) o WHERE o.id = n.id;
SELECT setval('networks_seq', GREATEST((SELECT count(*) FROM networks), 1), (SELECT count(*) FROM networks) > 0);
ALTER TABLE networks ALTER COLUMN seq SET DEFAULT nextval('networks_seq');
ALTER TABLE networks ALTER COLUMN seq SET NOT NULL;
ALTER SEQUENCE networks_seq OWNED BY networks.seq;
ALTER TABLE networks ADD CONSTRAINT networks_seq_unique UNIQUE (seq);
CREATE UNIQUE INDEX networks_name_unique ON networks (lower(btrim(name)));
