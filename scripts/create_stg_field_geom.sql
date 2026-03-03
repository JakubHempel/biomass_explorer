CREATE SCHEMA IF NOT EXISTS stg;

CREATE TABLE IF NOT EXISTS stg.field_geom (
    id          BIGSERIAL PRIMARY KEY,
    base_id     INTEGER,
    buffer_m    INTEGER,
    area        DOUBLE PRECISION,
    geom        geometry(Polygon, 4326) NOT NULL,
    source_file VARCHAR(255),
    imported_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_stg_field_geom_geom    ON stg.field_geom USING GIST (geom);
CREATE INDEX IF NOT EXISTS ix_stg_field_geom_base_id ON stg.field_geom(base_id);
