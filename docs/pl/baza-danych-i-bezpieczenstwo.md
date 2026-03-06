# Baza danych i bezpieczeństwo

## 1) Tabela persystencji

Aplikacja zapisuje dane runtime do:

- `obs.vegetation_indices`

Konfiguracja jest stała w `database.py`:

- `DB_SCHEMA = "obs"`
- `DB_TABLE_NAME = "vegetation_indices"`

Rozwiązywanie konfiguracji połączenia:

1. zmienne środowiskowe `DB_*` (`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`, opcjonalnie `DB_SSLMODE`),
2. fallback do `db_config.json`.

## 2) Kontrakt tabeli

Oczekiwany kontrakt DDL:

- `scripts/schema/ensure_obs_vegetation_indices.sql`

Najważniejsze założenia:

- klucz logiczny zapisu: `field_id`, `captured_at`, `sensor`,
- unikalność: `(field_id, captured_at, sensor)`,
- wartości indeksów są nullable (15 indeksów + metadane pomocnicze).

## 3) Zależność relacyjna

`field_id` musi wskazywać istniejące pole (domena core).
W produkcji typowo:

- `obs.vegetation_indices.field_id -> core.fields.id`

Przy FK z `ON DELETE CASCADE` usunięcie pola usuwa również historię indeksów.

## 4) Reguły dostępu

Walidacja aplikacyjna po stronie backendu:

- gość:
  - brak zapisu historii z `/calculate/biomass`,
  - brak dostępu do historii pól z `/history/{field_id}`,
- użytkownik zalogowany:
  - zapis/odczyt tylko dla własnych pól,
- administrator:
  - pełny dostęp do wszystkich pól.

Sprawdzenie własności realizowane jest przez:

- `main.py` -> `_assert_field_access(...)`,
- `admin_service.py` -> `check_field_owner(...)`.

## 5) Zalecenia bezpieczeństwa

- używaj zasady minimalnych uprawnień dla konta DB,
- wymuszaj TLS (`sslmode=require`) w środowiskach produkcyjnych,
- nie commituj prawdziwych danych połączeniowych w `db_config.json`,
- ustaw silny `JWT_SECRET_KEY` poza środowiskiem lokalnym,
- ogranicz CORS w produkcji (aktualnie konfiguracja jest szeroka).

## 6) Przydatne zapytania kontrolne

Ostatnie rekordy historii:

```sql
SELECT id, field_id, captured_at, sensor
FROM obs.vegetation_indices
ORDER BY id DESC
LIMIT 20;
```

Indeksy i unikalność:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='obs' AND tablename='vegetation_indices';
```

Sprawdzenie celu FK:

```sql
SELECT
  con.conname,
  src_ns.nspname AS source_schema,
  src_tbl.relname AS source_table,
  tgt_ns.nspname AS referenced_schema,
  tgt_tbl.relname AS referenced_table
FROM pg_constraint con
JOIN pg_class src_tbl ON src_tbl.oid = con.conrelid
JOIN pg_namespace src_ns ON src_ns.oid = src_tbl.relnamespace
JOIN pg_class tgt_tbl ON tgt_tbl.oid = con.confrelid
JOIN pg_namespace tgt_ns ON tgt_ns.oid = tgt_tbl.relnamespace
WHERE con.conname = 'vegetation_indices_field_id_fkey';
```
