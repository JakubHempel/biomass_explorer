# Architecture

## 1) High-Level Overview

Biomass Explorer is a FastAPI + JavaScript web application for agricultural field monitoring based on Google Earth Engine (GEE) imagery.

Main capabilities:

- AOI (field boundary) selection from cadastral lookup, map tools, or saved field geometry.
- Vegetation and thermal index analysis (15 indices total).
- Interactive map overlays and pixel-level inspection.
- Field management (create/edit fields, crop metadata, ownership).
- Optional PostgreSQL persistence of analysis results and history.

## 2) Core Components

### Backend

- `main.py` - FastAPI app, endpoint routing, auth/ownership guards, static pages.
- `services.py` - analysis logic, index computation, map tile generation, pixel query, DB persistence helpers.
- `admin_service.py` - field/user/admin data access and mutations in PostgreSQL.
- `auth.py` - JWT authentication, password verification, user loading from `users.accounts`.
- `database.py` - PostgreSQL connection and DB enable/disable gate.
- `schemas.py` - Pydantic request/response contracts.
- `uldk.py` - integration with Polish cadastral services.

### Frontend

- `static/index.html`, `static/app.js`, `static/map.js`, `static/tools.js` - main explorer app.
- `static/fields.html` - map/list view of fields and field details.
- `static/field_editor.html` - create/update field geometry and metadata.
- `static/admin.html` - user and admin management views.

## 3) Analysis Runtime Flow

1. Client sends `POST /calculate/biomass` with:
   - AOI GeoJSON
   - date range
   - selected indices
   - field identifier payload
2. Backend computes index timeseries and summary metrics via GEE.
3. Persistence behavior:
   - guest: analysis response only (no DB write),
   - authenticated owner/admin: upsert into `obs.vegetation_indices`.
4. Client optionally requests visualization tiles:
   - `POST /visualize/map` for single layer,
   - `POST /visualize/batch` for multi-layer/date loading.

## 4) Authorization Model

- **Guest**:
  - can open the application and run analysis,
  - cannot save field history in DB.
- **Authenticated user**:
  - can manage own fields,
  - can persist analysis for owned fields,
  - can read history for owned fields.
- **Admin**:
  - can manage users,
  - can access all fields.

Ownership checks are enforced server-side for field-scoped operations.

## 5) Persistence Model

Runtime measurements target:

- `obs.vegetation_indices`

Upsert identity:

- `(field_id, captured_at, sensor)`

Field dependency:

- `field_id` is expected to reference `core.fields.id`.

## 6) UI Architecture Notes

- Fields list/details in `static/fields.html` include history metadata:
  - `calc_count`
  - `last_calculated_at`
- Field detail includes a history table showing all 15 indices.
- Field selection stores internal numeric `field_id` in UI state (background handling), while users interact with human-readable field names.
