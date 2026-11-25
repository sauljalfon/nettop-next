-- D51: switch models are library data (never topology): a name, a manufacturer,
-- a height and the port groups a switch copies when it is added. Nothing links a
-- switch to a model, and no write here changes a topology revision or a draft.
CREATE TABLE switch_models (
    id           text PRIMARY KEY,
    seq          bigserial NOT NULL UNIQUE,
    name         text NOT NULL,
    manufacturer text NOT NULL DEFAULT '',
    height       integer NOT NULL CHECK (height BETWEEN 1 AND 10),
    port_groups  jsonb NOT NULL,
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX switch_models_name_unique ON switch_models (lower(btrim(name)));
