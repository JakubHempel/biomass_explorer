# Biomass Explorer

**Biomass Explorer** is a web-based crop monitoring tool that combines **Sentinel-2** and **Landsat 8/9** satellite imagery via **Google Earth Engine** to analyse vegetation health, chlorophyll content, moisture levels, surface temperature, and drought stress over any field boundary.

---

## Key Features

- **15 spectral & thermal indices** from two satellite platforms (see tables below).
- **Dual-satellite pipeline** — optical indices from Sentinel-2 (~5-day revisit, 10 m) and thermal/drought indices from Landsat 8/9 (~8-day revisit, 30 m), processed independently and grouped by sensor.
- **Cloud-aware filtering** — per-pixel SCL-based cloud mask for Sentinel-2 and QA_PIXEL mask for Landsat, with an 80 % clear-pixel threshold over the AOI.
- **Period summary with condition ratings** — mean index values are evaluated against crop-science thresholds and labelled Excellent / Good / Fair / Poor / Critical.
- **Interactive map** — Leaflet-based dashboard with live tile overlays from GEE, layer control, minimap, colour-gradient legend with formulas, and satellite / street base maps.
- **SQLite persistence** — every analysis run is saved to a local database, queryable by field ID.

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
├── main.py            # FastAPI app, endpoints, static file serving
├── services.py        # GEE processing: S2 + Landsat pipelines, tile URL generation
├── models.py          # SQLAlchemy model (measurements table with sensor column)
├── schemas.py         # Pydantic request/response schemas
├── database.py        # SQLite engine & session factory
├── requirements.txt   # Python dependencies
├── .env               # GEE_PROJECT_ID (not committed)
└── static/
    ├── index.html     # Sidebar UI, collapsible about panel, map container
    ├── script.js      # Analysis logic, summary panel, condition evaluation, legend
    └── style.css      # Design system (fonts, cards, stat tiles, glass legend)
```

---

## Setup

### Prerequisites

- Python 3.10+
- A registered [Google Earth Engine](https://earthengine.google.com/) account
- A Google Cloud project with the Earth Engine API enabled

### Installation

1. **Clone the repository:**
   ```bash
   git clone <repo-url>
   cd biomass_explorer
   ```

2. **Create a `.env` file** in the project root:
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

5. **Authenticate with GEE** — on first run the console will print a URL. Open it, log in with Google, and authorise. A token is cached locally for future sessions.

6. **Open the app** at [http://127.0.0.1:8000](http://127.0.0.1:8000).

---

## API Endpoints

| Method | Path | Description |
|:-------|:-----|:------------|
| `POST` | `/calculate/biomass` | Run analysis — computes selected indices, saves to DB, returns timeseries + summary |
| `POST` | `/visualize/map` | Generate GEE tile URL for a single index + date |
| `GET`  | `/history/{field_id}` | Retrieve all stored measurements for a field |
| `GET`  | `/` | Serve the frontend |

---

## Database Schema

The `measurements` table stores one row per **(field, date, sensor)** combination:

| Column | Type | Notes |
|:-------|:-----|:------|
| `id` | Integer | Primary key |
| `field_id` | String | User-defined field name |
| `date` | String | Observation date (YYYY-MM-DD) |
| `sensor` | String | `"Sentinel-2"` or `"Landsat 8/9"` |
| `ndvi` … `nmdi` | Float | Sentinel-2 index values (nullable) |
| `lst` … `vhi` | Float | Landsat index values (nullable) |

Unique constraint: `(field_id, date, sensor)`.

> **Note:** After schema changes (e.g. pulling an update that adds columns), delete `biomass_results.db` and restart the server — the table will be recreated automatically.

---

## License

This project is open-source. Feel free to use and modify it for agricultural or research applications.
