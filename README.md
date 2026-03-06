# Biomass Explorer

**Biomass Explorer** is a web-based crop monitoring tool that combines **Sentinel-2** and **Landsat 8/9** satellite imagery via **Google Earth Engine** to analyse vegetation health, chlorophyll content, moisture levels, surface temperature, and drought stress over any field boundary.

---

## Key Features

### Satellite Analysis
- **15 spectral & thermal indices** from two satellite platforms (see tables below).
- **Dual-satellite pipeline** — optical indices from Sentinel-2 (~5-day revisit, 10 m) and thermal/drought indices from Landsat 8/9 (~8-day revisit, 30 m), processed independently and grouped by sensor.
- **Cloud-aware filtering** — per-pixel SCL-based cloud mask for Sentinel-2 and QA_PIXEL mask for Landsat, with an 80 % clear-pixel threshold over the AOI.
- **Period summary with condition ratings** — mean index values are evaluated against crop-science thresholds and labelled Excellent / Good / Fair / Poor / Critical.

### Interactive Map & Tools
- **Leaflet-based dashboard** with live tile overlays from GEE, layer control, minimap, and colour-gradient legend with formulas.
- **Location search** — Nominatim/OSM geocoder for finding places on the map.
- **Measurement tools** — measure distances and areas directly on the map.
- **Pixel inspector** — click any point on the map to query index values at that pixel.
- **Coordinate display** — live lat/lng and zoom level shown at the bottom of the map.
- **Recenter on field** — quick-access button in the map toolbar to zoom back to your AOI.

### Area of Interest
- **Parcel Search** — find parcels by TERYT cadastral ID or region name + parcel number (Polish cadastral system via ULDK/GUGiK).
- **Map Click** — click directly on the map to identify and load a cadastral parcel.
- **GeoJSON** — paste custom polygon coordinates.
- **Boundary editing** — after loading any AOI, edit the polygon vertices directly on the map (double-click or press Escape to confirm).
- **Saved fields** — recently used fields are stored in the browser and can be reloaded instantly with their geometry.

### UI/UX
- **Dark / Light mode** — toggle with the header button or press `D`.
- **Collapsible sidebar** — toggle the sidebar to maximise map space.
- **Skeleton loading** — placeholder animations shown during data fetching.
- **Mobile responsive** — collapsible sidebar with hamburger menu for smaller screens.
- **Guided onboarding tour** — step-by-step walkthrough on first visit; replay anytime with `G`.
- **Time series chart** — interactive Chart.js line chart for all computed indices across observation dates.
- **Keyboard shortcuts** — `Esc` cancel tools, `L` layers, `F` recenter, `D` dark mode, `G` guide tour, `?` about panel.

### Backend & Storage
- **FastAPI** backend with async endpoints.
- **Guest + authenticated mode** — anonymous users can run analysis without persistence; authenticated users can persist and read history for their own fields.
- **PostgreSQL persistence** — authenticated analyses are upserted into `obs.vegetation_indices`, keyed by `(field_id, captured_at, sensor)`.
- **ULDK integration** — Polish cadastral parcel lookup via the ULDK (GUGiK) web service.

---

## Indices

### Sentinel-2 — Vegetation & Growth (10)

| Index | Full Name | Formula |
|:------|:----------|:--------|
| **NDVI** | Normalized Difference Vegetation Index | (B8 − B4) / (B8 + B4) |
| **NDRE** | Normalized Difference Red Edge Index | (B8 − B5) / (B8 + B5) |
| **GNDVI** | Green NDVI | (B8 − B3) / (B8 + B3) |
| **EVI** | Enhanced Vegetation Index | 2.5 × (B8 − B4) / (B8 + 6·B4 − 7.5·B2 + 1) |
| **SAVI** | Soil Adjusted Vegetation Index | 1.5 × (B8 − B4) / (B8 + B4 + L) |
| **CI-re** | Chlorophyll Index – Red Edge | (B7 / B5) − 1 |
| **MTCI** | MERIS Terrestrial Chlorophyll Index | (B6 − B5) / (B5 − B4) |
| **IRECI** | Inverted Red-Edge Chlorophyll Index | (B7 − B4) / (B5 / B6) |
| **NDMI** | Normalized Difference Moisture Index | (B8 − B11) / (B8 + B11) |
| **NMDI** | Normalized Multi-band Drought Index | (B8 − (B11 − B12)) / (B8 + (B11 − B12)) |

### Landsat 8/9 — Temperature & Drought (5)

| Index | Full Name | Formula |
|:------|:----------|:--------|
| **LST** | Land Surface Temperature | ST_B10 converted to °C |
| **VSWI** | Vegetation Supply Water Index | NDVI / LST |
| **TVDI** | Temperature–Vegetation Dryness Index | (LST − LST_min) / (LST_max − LST_min) |
| **TCI** | Temperature Condition Index | (LST_max − LST) / (LST_max − LST_min) × 100 |
| **VHI** | Vegetation Health Index | 0.5 × VCI + 0.5 × TCI |

---

## Project Structure

```
biomass_explorer/
├── main.py              # FastAPI app, endpoints, favicon, static file serving
├── services.py          # GEE processing: S2 + Landsat pipelines, tile URLs, pixel queries
├── schemas.py           # Pydantic request/response schemas (incl. pixel inspector)
├── database.py          # PostgreSQL config + connection checks (db_config.json)
├── db_config.json       # PostgreSQL connection settings (local, not committed)
├── uldk.py              # Polish cadastral (ULDK/GUGiK) parcel lookup service
├── requirements.txt     # Python dependencies
├── .env                 # GEE_PROJECT_ID (not committed)
├── scripts/
│   ├── schema/          # DDL: create/ensure schemas and tables
│   ├── grants/          # GRANT scripts for app DB roles
│   ├── migrations/      # One-off migration utilities
│   ├── diagnostics/     # Read-only DB inspection helpers
│   └── README.md        # Script categories + execution order
└── static/
    ├── index.html       # Sidebar UI, setup sections, map container, tools
    ├── config.js        # Constants, toast system, index metadata, format utilities
    ├── map.js           # Map initialisation, AOI handling, layers panel, saved fields
    ├── tools.js         # Geocoder, measurement, pixel inspector, edit AOI, coordinates
    ├── app.js           # Analysis, charts, validation, dark mode, onboarding
    ├── style.css        # Core design system (variables, layout, forms, buttons)
    ├── components.css   # UI component styles (panels, stats, legend, chart popup)
    ├── theme.css        # Dark mode, responsive, animations, third-party overrides
    └── favicon.png      # App icon (globe + leaf)
```

---

## Setup

### Prerequisites

- Python 3.10+
- A Google account
- A Google Cloud project with the Earth Engine API enabled (free tier is sufficient — see below)

### Create a Google Earth Engine Project (free)

1. Go to [Google Earth Engine](https://earthengine.google.com/) and click **Get Started** / **Sign Up**. Sign in with your Google account.
2. Open the [Google Cloud Console](https://console.cloud.google.com/) and create a new project (or use an existing one):
   - Click the project selector dropdown at the top of the page.
   - Click **New Project**.
   - Enter a project name and click **Create**.
   - Note the **Project ID** shown below the name field — this is what you will put in `.env`.
3. Register your project for Earth Engine access:
   - Go to [code.earthengine.google.com/register](https://code.earthengine.google.com/register).
   - Select **Unpaid usage** > **Academia & Research** (or the option that fits your use case).
   - Choose the Cloud project you just created and accept the terms.

After these steps you will have a project ID ready to use.

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd biomass_explorer
   ```

2. **Create a `.env` file** in the project root with your project ID:
   ```text
   GEE_PROJECT_ID='your-google-cloud-project-id'
   ```

   Optional (for serverless deployments before setting up Azure/Postgres):
   ```text
   ENABLE_DB='0'
   ```
   This disables database writes and `/history` persistence.

   For **Azure Database for PostgreSQL** (recommended for production), set:
   ```text
   ENABLE_DB='1'
   ```
   Notes:
   - Connection host/user/password/db are read from `db_config.json` in project root.
   - On Azure, the username is often `username@servername`.
   - Runtime measurements target is hardcoded to `obs.vegetation_indices`.

3. **Install dependencies:**
   ```bash
   python -m pip install -r requirements.txt
   ```

4. **Start the server:**
   ```bash
   python -m uvicorn main:app --reload
   ```

5. **Authenticate with GEE** — on first run the console will print a URL. Open it, log in with the same Google account that owns the Cloud project, and authorise. A token is cached locally for future sessions.

6. **Open the app** at [http://127.0.0.1:8000](http://127.0.0.1:8000).

### Authentication & Persistence Behavior

- `/app` remains available for guests (no login required).
- Guests can run `/calculate/biomass`, but results are not persisted to PostgreSQL.
- Logged-in users can:
  - save fields and geometries,
  - persist analysis history (if they own the selected field),
  - browse history for owned fields.
- Field ownership is validated server-side for persistence/history access.
- `field_id` should come from selected DB field in UI state (background handling), not manual user-entered IDs.

---

## Azure PostgreSQL (Safe Setup)

Use this checklist for PostgreSQL persistence on Azure:

1. Create an Azure Database for PostgreSQL instance.
2. Add your client/app IP in the server firewall (avoid `0.0.0.0/0` for production).
3. Create a dedicated application user with least privilege.
4. Create/update `db_config.json` with valid connection values:
   - `host`, `port`, `database`, `user`, `password`, `sslmode`
5. In `.env`, set:
   - `ENABLE_DB='1'`
6. Ensure table/index contract exists by running:
   - `scripts/schema/ensure_obs_vegetation_indices.sql`
7. Install dependencies and run:
   ```bash
   python -m pip install -r requirements.txt
   python -m uvicorn main:app --reload
   ```
8. Trigger one analysis while logged in and verify `/history/{field_id}` returns data.
9. Verify direct table writes in PgAdmin:
   ```sql
   SELECT COUNT(*) FROM obs.vegetation_indices;
   SELECT * FROM obs.vegetation_indices ORDER BY id DESC LIMIT 20;
   ```

### Troubleshooting

- **`password authentication failed`**:
  - Verify username format (`username@servername` is common on Azure).
  - Confirm password is correct in `db_config.json`.
- **`could not connect` / timeout**:
  - Check firewall rules and server hostname.
  - Confirm port `5432` is reachable.
- **`SSL is required`**:
  - Ensure `sslmode='require'` in `db_config.json` for Azure.
- **No rows persisted**:
  - Confirm `ENABLE_DB='1'`.
  - Confirm `db_config.json` exists and app restarted.
  - Confirm request is authenticated and `field_id` belongs to the current user.
- **Rows not visible in expected table**:
  - Verify writes target `obs.vegetation_indices` (hardcoded runtime target).

---

## Field Condition Score & Stress Layer

The app shows two related outputs:

- **Field Condition Score (0–10)** — a single field-level score.
- **Stress Hotspots map (`STRESS_HOTSPOTS`)** — per-pixel stress intensity over the AOI.

Both are now tied to the same stress signal for consistency:

1. Build hotspot stress image using 5 core indicators:
   - `VHI`, `TCI`, `NDVI`, `NDMI`, `TVDI`
2. Compute field mean stress over AOI:
   - `mean_stress` in range `0..1` (`0` healthy, `1` critical)
3. Convert to field score:
   - `score_0_10 = 10 * (1 - mean_stress)`

### Stress Layer Legend

- `0.0–0.2`: Healthy
- `0.2–0.4`: Mostly healthy
- `0.4–0.6`: Watch
- `0.6–0.8`: Stressed
- `0.8–1.0`: Critical

### Expert Mode Behavior

- Only indices selected by the user in expert mode are used for:
  - persisted timeseries values
  - available observation layers
- Core stress indices used for field-condition scoring are internal-only and are not auto-added to expert selections.

---

## Vercel Deployment Notes

Vercel cannot run interactive Google Earth Engine authentication (`ee.Authenticate()`), so you must provide
service-account credentials via environment variables.

Set these in **Vercel Project → Settings → Environment Variables**:

- `GEE_PROJECT_ID` = your Google Cloud project id
- `GEE_SERVICE_ACCOUNT_JSON` = full JSON key content for a service account with Earth Engine access
- `ENABLE_DB` = `0` (if you want no persistence for now)

Important:
- The `GEE_SERVICE_ACCOUNT_JSON` value must be valid JSON (single-line is fine).
- Paste the JSON object directly (no extra outer `'...'` or `"..."` wrapping).
- It must be a **service account** key (`"type": "service_account"`), not a user OAuth token.
- If your key has escaped newlines in `private_key`, keep them as `\n` in the JSON value.
- The service account must be granted access to Earth Engine in your GCP/GEE setup.

---

## API Endpoints

| Method | Path | Description |
|:-------|:-----|:------------|
| `POST` | `/calculate/biomass` | Run analysis — computes selected indices, returns timeseries + summary; persists only for authenticated owners |
| `GET`  | `/history/{field_id}` | Retrieve stored measurements for an owned field (guest calls return empty list) |
| `POST` | `/visualize/map` | Generate GEE tile URL for a single index + date |
| `POST` | `/visualize/batch` | Generate tile URLs for many indices in one request |
| `POST` | `/api/pixel-value` | Sample index values at a specific lat/lng for a given date/sensor |
| `GET`  | `/api/uldk/search` | Look up a cadastral parcel by TERYT ID or region name |
| `GET`  | `/api/uldk/locate` | Identify the cadastral parcel at a given lat/lng coordinate |
| `GET`  | `/api/fields` | List user-visible fields (admin: all, user: own only) |
| `GET`  | `/api/fields/browse` | Rich field listing (owner/crop/area/geojson + history metadata) |
| `GET`  | `/api/fields/{field_id}` | Field detail including geometry |
| `GET`  | `/favicon.ico` | Serve the app favicon |
| `GET`  | `/` | Serve the frontend |

---

## Keyboard Shortcuts

| Key | Action |
|:----|:-------|
| `Esc` | Close popups & cancel active tools |
| `L` | Toggle layers panel |
| `F` | Recenter map on field |
| `D` | Toggle dark / light mode |
| `G` | Start guided onboarding tour |
| `?` | Open the About panel |

---

## Database Schema

Persistence targets `obs.vegetation_indices` (hardcoded runtime target).

The table stores one row per **(field, captured_at, sensor)** combination:

| Column | Type | Notes |
|:-------|:-----|:------|
| `id` | Integer | Primary key |
| `field_id` | Integer/BigInt | Numeric field identifier |
| `captured_at` | Timestamp with time zone | Observation timestamp (date-based, midnight UTC) |
| `sensor` | String | `"Sentinel-2"` or `"Landsat 8/9"` |
| `source` | String | Data source label (e.g. `"GEE"`) |
| `source_image_id` | String | Source image identifier (default `"1"`) |
| `canopy_cover` | Float | Optional metadata (default `1.0`) |
| `biomass_est` | Float | Optional metadata (default `1.0`) |
| `ndvi` … `nmdi` | Float | Sentinel-2 index values (nullable) |
| `lst` … `vhi` | Float | Landsat index values (nullable) |

Unique constraint should include sensor:

- `(field_id, captured_at, sensor)`

Expected relational dependency:

- `obs.vegetation_indices.field_id` should reference `core.fields.id`
  (typically FK with `ON DELETE CASCADE`).

If your database currently has unique index `(field_id, captured_at)` only, inserts can fail when both Sentinel-2 and Landsat exist on the same date.

### Field History in UI

- Fields list and detail views expose history metadata from DB:
  - `calc_count` (number of persisted records),
  - `last_calculated_at` (latest saved capture timestamp).
- In `/fields` detail view, users can open a full history table for the selected field.
- History table supports all 15 indices:
  - `NDVI`, `NDRE`, `GNDVI`, `EVI`, `SAVI`, `CIre`, `MTCI`, `IRECI`, `NDMI`, `NMDI`, `LST`, `VSWI`, `TVDI`, `TCI`, `VHI`.

---

## Third-Party Libraries (Frontend)

| Library | Purpose |
|:--------|:--------|
| [Leaflet](https://leafletjs.com/) | Interactive map |
| [Leaflet MiniMap](https://github.com/Norkart/Leaflet-MiniMap) | Overview minimap |
| [Leaflet Control Geocoder](https://github.com/perliedman/leaflet-control-geocoder) | Location search (Nominatim) |
| [Leaflet Draw](https://github.com/Leaflet/Leaflet.draw) | Polygon boundary editing |
| [Chart.js](https://www.chartjs.org/) | Time series charts |
| [Driver.js](https://driverjs.com/) | Onboarding guided tour |

---

## License

This project is open-source. Feel free to use and modify it for agricultural or research applications.
