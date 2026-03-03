# Porównanie: measurements (biomass_results.db) vs obs.vegetation_indices (PostgreSQL)

## Struktura obs.vegetation_indices (PG)

| Kolumna        | Typ              | Nullable |
|----------------|------------------|----------|
| id             | bigint           | NO (PK)  |
| field_id       | bigint           | NO       |
| captured_at    | timestamptz      | NO       |
| ndvi           | double precision | YES      |
| gndvi          | double precision | YES      |
| evi            | double precision | YES      |
| msavi2         | double precision | YES      |
| savi           | double precision | YES      |
| osavi          | double precision | YES      |
| ndre           | double precision | YES      |
| reip           | double precision | YES      |
| ndwi           | double precision | YES      |
| lai            | double precision | YES      |
| canopy_cover   | double precision | YES      |
| biomass_est    | double precision | YES      |
| source_image_id| varchar          | YES      |
| source         | varchar          | YES      |
| created_at     | timestamptz      | NO       |

## Struktura measurements (SQLite – model w aplikacji)

| Kolumna        | Typ     | Nullable | W PG?     |
|----------------|---------|----------|-----------|
| id             | INTEGER | NO (PK)  | tak       |
| field_id       | String  | YES      | tak (BIGINT) |
| captured_at    | DateTime| NO       | tak       |
| sensor         | String  | YES      | **NIE**   |
| source         | String  | YES      | tak       |
| ndvi, gndvi, evi, msavi2, savi, osavi, ndre, reip, ndwi | Float | YES | tak |
| lai, canopy_cover, biomass_est | Float | YES | tak |
| source_image_id| String  | YES      | tak       |
| created_at     | DateTime| NO       | tak       |
| cire, mtci, ireci, ndmi, nmdi | Float | YES | **NIE** |
| lst, vswi, tvdi, tci, vhi     | Float | YES | **NIE** |

## Lista różnic

1. **Tylko w measurements (SQLite):**
   - `sensor` – w PG nie ma (wystarczy `source`, można dodać `sensor` dla zgodności).
   - `cire`, `mtci`, `ireci`, `ndmi`, `nmdi` – indeksy Sentinel-2.
   - `lst`, `vswi`, `tvdi`, `tci`, `vhi` – indeksy Landsat (termalne/susza).

2. **Zgodne:** id, field_id, captured_at, source, ndvi, gndvi, evi, msavi2, savi, osavi, ndre, reip, ndwi, lai, canopy_cover, biomass_est, source_image_id, created_at.

3. **Uwaga:** W starym pliku biomass_results.db tabela ma jeszcze kolumnę `date` zamiast `captured_at` – to stara wersja; po przebudowaniu bazy (usunięcie .db + restart) będzie `captured_at`.

## Zmiany do wykonania

**Opcja A – rozszerzyć obs.vegetation_indices (PG)**  
Dodanie kolumn z measurements, żeby eksport z SQLite był 1:1 i nic nie gubić:
- `sensor` (opcjonalnie),
- `cire`, `mtci`, `ireci`, `ndmi`, `nmdi`,
- `lst`, `vswi`, `tvdi`, `tci`, `vhi`.

**Opcja B – bez zmian w PG**  
Eksportować tylko kolumny wspólne; `sensor` mapować na `source`; indeksy cire/mtci/…/vhi nie trafiają do PG.

Poniżej SQL dla **Opcji A**.
