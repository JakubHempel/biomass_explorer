-- Ensure runtime schema for Biomass Explorer persistence.
-- This matches services.save_results_to_db() upsert contract:
--   ON CONFLICT (field_id, captured_at, sensor)
-- Run as DB admin/owner.

CREATE SCHEMA IF NOT EXISTS obs;

CREATE TABLE IF NOT EXISTS obs.vegetation_indices (
    id              BIGSERIAL PRIMARY KEY,
    field_id        BIGINT NOT NULL,
    captured_at     TIMESTAMPTZ NOT NULL,
    sensor          VARCHAR(255) NOT NULL DEFAULT '',
    source          VARCHAR(255),
    source_image_id VARCHAR(255) DEFAULT '1',

    -- Core indices
    ndvi            DOUBLE PRECISION,
    gndvi           DOUBLE PRECISION,
    evi             DOUBLE PRECISION,
    savi            DOUBLE PRECISION,
    ndre            DOUBLE PRECISION,
    canopy_cover    DOUBLE PRECISION,
    biomass_est     DOUBLE PRECISION,

    -- Sentinel-2 extended
    cire            DOUBLE PRECISION,
    mtci            DOUBLE PRECISION,
    ireci           DOUBLE PRECISION,
    ndmi            DOUBLE PRECISION,
    nmdi            DOUBLE PRECISION,

    -- Landsat thermal/drought
    lst             DOUBLE PRECISION,
    vswi            DOUBLE PRECISION,
    tvdi            DOUBLE PRECISION,
    tci             DOUBLE PRECISION,
    vhi             DOUBLE PRECISION,

    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE obs.vegetation_indices
  ADD COLUMN IF NOT EXISTS sensor          VARCHAR(255),
  ADD COLUMN IF NOT EXISTS source          VARCHAR(255),
  ADD COLUMN IF NOT EXISTS source_image_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS cire            DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS mtci            DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS ireci           DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS ndmi            DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS nmdi            DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS lst             DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS vswi            DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS tvdi            DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS tci             DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS vhi             DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ;

-- Backfill defaults expected by application.
UPDATE obs.vegetation_indices
SET
  sensor = COALESCE(sensor, ''),
  source_image_id = COALESCE(NULLIF(source_image_id, ''), '1'),
  canopy_cover = COALESCE(canopy_cover, 1),
  biomass_est = COALESCE(biomass_est, 1),
  created_at = COALESCE(created_at, NOW())
WHERE
  sensor IS NULL
  OR source_image_id IS NULL
  OR source_image_id = ''
  OR canopy_cover IS NULL
  OR biomass_est IS NULL
  OR created_at IS NULL;

ALTER TABLE obs.vegetation_indices
  ALTER COLUMN sensor SET DEFAULT '',
  ALTER COLUMN source_image_id SET DEFAULT '1',
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN sensor SET NOT NULL,
  ALTER COLUMN captured_at SET NOT NULL;

-- Required for UPSERT in services.save_results_to_db().
CREATE UNIQUE INDEX IF NOT EXISTS uq_vegetation_indices_field_captured_sensor
  ON obs.vegetation_indices(field_id, captured_at, sensor);

COMMENT ON TABLE obs.vegetation_indices IS
  'Biomass Explorer runtime store (PostgreSQL-first). Upsert key: (field_id, captured_at, sensor).';
