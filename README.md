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
- **SQLite persistence** — every analysis run is saved locally, queryable by field ID.
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
├── models.py            # SQLAlchemy model (measurements table with sensor column)
├── schemas.py           # Pydantic request/response schemas (incl. pixel inspector)
├── database.py          # SQLite engine & session factory
├── uldk.py              # Polish cadastral (ULDK/GUGiK) parcel lookup service
├── requirements.txt     # Python dependencies
├── .env                 # GEE_PROJECT_ID (not committed)
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

3. **Install dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Start the server:**
   ```bash
   uvicorn main:app --reload
   ```

5. **Authenticate with GEE** — on first run the console will print a URL. Open it, log in with the same Google account that owns the Cloud project, and authorise. A token is cached locally for future sessions.

6. **Open the app** at [http://127.0.0.1:8000](http://127.0.0.1:8000).

---

## API Endpoints

| Method | Path | Description |
|:-------|:-----|:------------|
| `POST` | `/calculate/biomass` | Run analysis — computes selected indices, saves to DB, returns timeseries + summary |
| `POST` | `/visualize/map` | Generate GEE tile URL for a single index + date |
| `POST` | `/api/pixel-value` | Sample index values at a specific lat/lng for a given date/sensor |
| `GET`  | `/api/uldk/parcel` | Look up a cadastral parcel by TERYT ID or region name |
| `GET`  | `/api/uldk/point` | Identify the cadastral parcel at a given lat/lng coordinate |
| `GET`  | `/history/{field_id}` | Retrieve all stored measurements for a field |
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

The `measurements` table stores one row per **(field, date, sensor)** combination:

| Column | Type | Notes |
|:-------|:-----|:------|
| `id` | Integer | Primary key |
| `field_id` | String | User-defined field name |
| `date` | Date | Observation date |
| `sensor` | String | `"Sentinel-2"` or `"Landsat 8/9"` |
| `ndvi` … `nmdi` | Float | Sentinel-2 index values (nullable) |
| `lst` … `vhi` | Float | Landsat index values (nullable) |

Unique constraint: `(field_id, date, sensor)`.

> **Note:** After schema changes (e.g. pulling an update that adds columns), delete `biomass_results.db` and restart the server — the table will be recreated automatically.

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
