# Konfiguracja i uruchomienie

## 1) Wymagania

- Python 3.10+
- dostęp do Google Earth Engine
- projekt Google Cloud z włączonym Earth Engine API
- (opcjonalnie) PostgreSQL, najlepiej Azure Database for PostgreSQL

## 2) Uruchomienie lokalne

```bash
git clone <repo-url>
cd biomass_explorer
python -m pip install -r requirements.txt
python -m uvicorn main:app --reload
```

Aplikacja lokalnie:

- `http://127.0.0.1:8000`

## 3) Zmienne środowiskowe

Utwórz plik `.env`:

```text
GEE_PROJECT_ID='twoj-projekt-gcp'
ENABLE_DB='1'
```

Uwagi:

- `ENABLE_DB='0'` uruchamia aplikację bez zapisu historii w DB.
- w środowisku serverless można używać `GEE_SERVICE_ACCOUNT_JSON`.

## 4) Konfiguracja bazy

Dane połączenia są czytane z `db_config.json`.
Wzór: `db_config.example.json`.

Dla Azure PostgreSQL:

- preferuj `sslmode: "require"`,
- login użytkownika często ma format `user@server`.

## 5) Bootstrap DB

Katalogi skryptów:

- `scripts/schema/` - tworzenie i wyrównywanie struktur,
- `scripts/grants/` - uprawnienia ról,
- `scripts/migrations/` - migracje jednorazowe,
- `scripts/diagnostics/` - diagnostyka.

Rekomendowana kolejność:

1. `scripts/schema/create_users_schema.sql`
2. `scripts/schema/create_stg_field_geom.sql` (jeśli używane)
3. `scripts/schema/ensure_obs_vegetation_indices.sql`
4. odpowiednie skrypty z `scripts/grants/`

## 6) Kontrole przy starcie

Podczas startu backend:

- inicjalizuje dane domyślne (admin/użytkownicy/uprawy),
- inicjalizuje GEE,
- sprawdza połączenie z DB (gdy `ENABLE_DB=1`).

Gdy DB jest wyłączone, analiza nadal działa, ale bez persystencji historii.
