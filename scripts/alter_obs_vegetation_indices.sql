-- Rozszerzenie obs.vegetation_indices o kolumny z tabeli measurements (biomass_results.db),
-- żeby import był 1:1 i nie gubić indeksów Sentinel-2 i Landsat.
-- Uruchom na bazie PostgreSQL (np. jako właściciel schematu obs).

-- 1. Sensor (np. "Sentinel-2", "Landsat 8/9") – opcjonalnie, bo mamy już source
ALTER TABLE obs.vegetation_indices
  ADD COLUMN IF NOT EXISTS sensor VARCHAR(255);

-- 2. Indeksy Sentinel-2 (nieobecne w oryginalnej definicji obs.vegetation_indices)
ALTER TABLE obs.vegetation_indices
  ADD COLUMN IF NOT EXISTS cire   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS mtci   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS ireci  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS ndmi   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS nmdi   DOUBLE PRECISION;

-- 3. Indeksy Landsat 8/9 (termalne / susza)
ALTER TABLE obs.vegetation_indices
  ADD COLUMN IF NOT EXISTS lst   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS vswi  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS tvdi  DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS tci   DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS vhi   DOUBLE PRECISION;

-- Opcjonalnie: komentarz do tabeli
COMMENT ON TABLE obs.vegetation_indices IS 'Indices from biomass_explorer (measurements); extended with sensor, cire, mtci, ireci, ndmi, nmdi, lst, vswi, tvdi, tci, vhi for 1:1 export from biomass_results.db.';
