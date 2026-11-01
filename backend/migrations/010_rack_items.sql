-- Rack items: equipment of kind rack_item (UPS, PDU, shelf, cable manager or
-- other) with role none. It takes rack units like any equipment and has no
-- endpoints, subpanels or links.
--
-- item_type and item_text are detail fields (like those of 008): nullable
-- text, never an empty string, never topology. The check mirrors
-- topology.Validate: a rack item has role none, a type from the list, and a
-- text of 1-100 characters exactly when the type is other; every other kind
-- has neither. No existing row can be a rack item, so there is no preflight.

ALTER TABLE equipment DROP CONSTRAINT equipment_kind_check;
ALTER TABLE equipment ADD CONSTRAINT equipment_kind_check CHECK (kind IN ('switch','panel','hdf','rack_item'));

ALTER TABLE equipment
    ADD COLUMN item_type text,
    ADD COLUMN item_text text,
    ADD CONSTRAINT equipment_rack_item_shape CHECK (
        (kind = 'rack_item'
            AND role = 'none'
            AND item_type IS NOT NULL
            AND item_type IN ('ups','pdu','shelf','cable-manager','other')
            AND ((item_type = 'other' AND item_text IS NOT NULL AND length(item_text) BETWEEN 1 AND 100)
                 OR (item_type <> 'other' AND item_text IS NULL)))
        OR (kind <> 'rack_item' AND item_type IS NULL AND item_text IS NULL));
