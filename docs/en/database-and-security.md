# Database and Security

## 1) Persistence Target

Runtime persistence table is fixed in code:

- `obs.vegetation_indices`

Configured in `database.py`:

- `DB_SCHEMA = "obs"`
- `DB_TABLE_NAME = "vegetation_indices"`

## 2) Core Table Contract

The expected DDL is maintained in:

- `scripts/schema/ensure_obs_vegetation_indices.sql`

Important properties:

- key columns: `field_id`, `captured_at`, `sensor`
- unique index: `(field_id, captured_at, sensor)`
- nullable index columns for 15 indices and related metrics

## 3) Relational Dependency

`field_id` must map to an existing field in core domain.
Typical production setup uses FK:

- `obs.vegetation_indices.field_id -> core.fields.id`

If FK exists with cascade delete, removing a field deletes related index history automatically.

## 4) Access Control Behavior

Application-level controls (server-side):

- Guests:
  - no DB history persistence from `/calculate/biomass`
  - no personal history access from `/history/{field_id}`
- Authenticated user:
  - persistence/history only for owned fields
- Admin:
  - unrestricted across fields

Ownership check logic:

- in `main.py`: `_assert_field_access(...)`
- backed by `admin_service.check_field_owner(...)`

## 5) Security Recommendations

- Use least-privilege DB user grants.
- Enforce TLS (`sslmode=require`) in production.
- Do not commit `db_config.json` with real credentials.
- Rotate JWT secret (`JWT_SECRET_KEY`) for non-local environments.
- Restrict CORS in production (currently configured permissive).

## 6) Operational Validation Queries

Confirm recent persistence:

```sql
SELECT id, field_id, captured_at, sensor
FROM obs.vegetation_indices
ORDER BY id DESC
LIMIT 20;
```

Check upsert uniqueness:

```sql
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='obs' AND tablename='vegetation_indices';
```

Check FK target:

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
