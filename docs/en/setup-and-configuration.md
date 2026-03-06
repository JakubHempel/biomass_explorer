# Setup and Configuration

## 1) Prerequisites

- Python 3.10+
- Google Earth Engine access
- Google Cloud project with Earth Engine API enabled
- (Optional) PostgreSQL instance (Azure PostgreSQL recommended for production)

## 2) Local Setup

```bash
git clone <repo-url>
cd biomass_explorer
python -m pip install -r requirements.txt
```

Run API:

```bash
python -m uvicorn main:app --reload
```

Open:

- `http://127.0.0.1:8000`

## 3) Environment Variables

Create `.env` in project root:

```text
GEE_PROJECT_ID='your-gcp-project-id'
ENABLE_DB='1'
```

Notes:

- Set `ENABLE_DB='0'` to run without PostgreSQL persistence.
- In serverless contexts (for example Vercel), use service-account based GEE auth (`GEE_SERVICE_ACCOUNT_JSON`).

## 4) Database Configuration

Database connection is read from `db_config.json` in project root.
Use `db_config.example.json` as template:

```json
{
  "host": "localhost",
  "port": 5432,
  "database": "twoja_baza",
  "user": "uzytkownik",
  "password": "",
  "sslmode": "prefer"
}
```

For Azure PostgreSQL:

- prefer `sslmode: "require"`
- username often follows `username@servername`

## 5) DB Bootstrap Scripts

Scripts directory summary:

- `scripts/schema/` - DDL creation/alignment scripts
- `scripts/grants/` - role permissions
- `scripts/migrations/` - one-off migration utilities
- `scripts/diagnostics/` - inspection/troubleshooting scripts

Typical order:

1. `scripts/schema/create_users_schema.sql`
2. `scripts/schema/create_stg_field_geom.sql` (if used)
3. `scripts/schema/ensure_obs_vegetation_indices.sql`
4. run required scripts from `scripts/grants/`

## 6) Startup Checks

At startup, backend:

- ensures default admin/crops/users sync tasks,
- initializes GEE,
- validates DB connection when `ENABLE_DB` is enabled.

If DB is disabled, analysis endpoints still work (without persistence).
