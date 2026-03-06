# API Reference

Base URL examples:

- local: `http://127.0.0.1:8000`

## Authentication

Token endpoints:

- `POST /auth/login` - JSON login, returns JWT token payload.
- `POST /auth/token` - OAuth2 form endpoint (Swagger authorize support).
- `GET /auth/me` - current authenticated user.

Admin-only:

- `GET /admin/users`
- `POST /admin/users`
- `PUT /admin/users/{user_id}`
- `DELETE /admin/users/{user_id}`

## Analysis

### `POST /calculate/biomass`

Runs analysis for provided AOI and date range.

Behavior:

- guest: returns analysis response, does not persist in DB.
- authenticated owner/admin: persists to `obs.vegetation_indices`.

### `GET /history/{field_id}`

Returns stored history for the field.

Behavior:

- guest: returns empty list,
- authenticated user: only for owned fields,
- admin: unrestricted.

## Visualization

- `POST /visualize/map` - single index map tile.
- `POST /visualize/batch` - batch map tiles for multiple indices.
- `POST /api/pixel-value` - pixel-level values for selected indices.

## Cadastral (ULDK)

- `GET /api/uldk/search?q=...` - parcel lookup by id/query.
- `GET /api/uldk/locate?lat=...&lng=...` - parcel lookup by coordinate.

## Field Management (Authenticated)

- `GET /api/fields/browse` - rich field list (owner/crop/area/geojson/history metadata).
- `GET /api/fields` - compact field list.
- `GET /api/fields/{field_id}` - field detail.
- `POST /api/fields` - create field.
- `PUT /api/fields/{field_id}` - update field.
- `GET /api/crops` - crop options.
- `GET /api/owners` - owners with field counts.

## Static Routes

- `GET /` -> `static/login.html`
- `GET /app` -> main explorer
- `GET /admin` -> admin panel
- `GET /fields` -> fields map/list view
- `GET /field-editor` -> field create/edit view

## Response Contracts

Primary contracts are declared in `schemas.py`:

- `AnalysisRequest`, `BiomassResponse`
- `BatchLayerRequest`, `BatchLayerResponse`
- `PixelQueryRequest`, `PixelQueryResponse`
- field/user request/response models
