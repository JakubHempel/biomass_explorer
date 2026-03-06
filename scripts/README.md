## Scripts Structure

- `schema/` — DDL to create or align required tables/schemas.
- `grants/` — permission scripts for application DB roles.
- `migrations/` — one-time data migration scripts.
- `diagnostics/` — read-only inspection and troubleshooting scripts.

### Typical bootstrap order

1. `schema/create_users_schema.sql`
2. `schema/create_stg_field_geom.sql` (if applicable)
3. `schema/ensure_obs_vegetation_indices.sql`
4. Run scripts from `grants/` as needed for your DB role model.
