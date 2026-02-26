import ee
import statistics
import json
from datetime import date as date_type
from concurrent.futures import ThreadPoolExecutor, as_completed
from schemas import AnalysisRequest, BiomassResponse
from sqlalchemy.orm import Session
from google.oauth2 import service_account
import models
import os
import time
import logging
from dotenv import load_dotenv

log = logging.getLogger(__name__)

load_dotenv()

MY_PROJECT_ID = os.getenv('GEE_PROJECT_ID')

# ---------------------------------------------------------------------------
# Index classification
# ---------------------------------------------------------------------------
S2_INDICES = {'NDVI', 'NDRE', 'GNDVI', 'EVI', 'SAVI', 'CIre', 'MTCI', 'IRECI', 'NDMI', 'NMDI'}
LANDSAT_INDICES = {'LST', 'VSWI', 'TVDI', 'TCI', 'VHI'}

# ---------------------------------------------------------------------------
# GEE initialisation
# ---------------------------------------------------------------------------
def _load_service_account_info(raw_json: str) -> dict:
    """
    Parse service-account JSON from env and normalize private_key newlines.
    Raises RuntimeError with actionable messages.
    """
    try:
        text = raw_json.strip()
        # Common copy/paste issue: value wrapped in extra single quotes.
        if (text.startswith("'") and text.endswith("'")) or (text.startswith('"') and text.endswith('"')):
            text = text[1:-1]
        info = json.loads(text)
    except Exception as exc:
        raise RuntimeError(
            "GEE_SERVICE_ACCOUNT_JSON is not valid JSON. Paste the raw JSON object (without extra outer quotes)."
        ) from exc

    required = {"type", "project_id", "private_key", "client_email", "token_uri"}
    missing = sorted(required - set(info.keys()))
    if missing:
        raise RuntimeError(
            "GEE_SERVICE_ACCOUNT_JSON is missing required keys: " + ", ".join(missing)
        )

    if info.get("type") != "service_account":
        raise RuntimeError(
            "GEE_SERVICE_ACCOUNT_JSON must be a service account key (type=service_account), "
            "not user OAuth credentials."
        )

    # Vercel env vars often store escaped newlines in private keys.
    if isinstance(info.get("private_key"), str):
        info["private_key"] = info["private_key"].replace("\\n", "\n")

    return info


def init_gee():
    if not MY_PROJECT_ID:
        raise RuntimeError("Missing GEE_PROJECT_ID. Set it in environment variables or .env.")

    try:
        ee.Initialize(project=MY_PROJECT_ID)
        print(f"GEE initialized with default credentials. Project: {MY_PROJECT_ID}")
        return
    except Exception as default_auth_error:
        log.warning(
            "GEE default credential init failed (%s): %s",
            type(default_auth_error).__name__,
            str(default_auth_error),
        )

        # Server-side/service-account auth (recommended for Vercel/serverless)
        sa_json = os.getenv("GEE_SERVICE_ACCOUNT_JSON")
        if sa_json:
            try:
                sa_info = _load_service_account_info(sa_json)
                creds = service_account.Credentials.from_service_account_info(
                    sa_info,
                    scopes=[
                        "https://www.googleapis.com/auth/earthengine",
                        "https://www.googleapis.com/auth/cloud-platform",
                    ],
                )
                ee.Initialize(credentials=creds, project=MY_PROJECT_ID)
                print(f"GEE initialized with service account. Project: {MY_PROJECT_ID}")
                return
            except Exception as service_account_error:
                log.error(
                    "GEE service-account init failed (%s): %s",
                    type(service_account_error).__name__,
                    str(service_account_error),
                )
                raise RuntimeError(
                    "Failed to initialize GEE with GEE_SERVICE_ACCOUNT_JSON. "
                    "Check Vercel logs for stage details (JSON format, key fields, key newline formatting, "
                    "or Earth Engine permission issues)."
                ) from service_account_error

        # In serverless environments interactive auth is impossible.
        if os.getenv("VERCEL") == "1":
            raise RuntimeError(
                "GEE auth failed on Vercel. Configure GEE_SERVICE_ACCOUNT_JSON and GEE_PROJECT_ID "
                "in Vercel Environment Variables."
            ) from default_auth_error

        print("Interactive authentication required...")
        ee.Authenticate()
        ee.Initialize(project=MY_PROJECT_ID)


# Minimum fraction of cloud-free pixels over the AOI to accept a date
MIN_CLEAR_RATIO = 0.80


# ===========================================================================
#  HELPER: Sentinel-2 cloud mask  (SCL-based, much more accurate than QA60)
# ===========================================================================
def _mask_s2_clouds(image):
    """Mask clouds, shadows, cirrus, snow and saturated pixels using the
    Scene Classification Layer (SCL) available in S2 L2A products.
    Accepted classes: 4-Vegetation, 5-Bare soil, 6-Water, 7-Unclassified,
                      2-Dark area (optional but usually harmless).
    Rejected classes: 0-No data, 1-Saturated/defective, 3-Cloud shadow,
                      8-Cloud medium prob, 9-Cloud high prob,
                      10-Thin cirrus, 11-Snow/ice."""
    scl = image.select('SCL')
    clear = (scl.eq(2).Or(scl.eq(4)).Or(scl.eq(5))
                       .Or(scl.eq(6)).Or(scl.eq(7)))
    return image.updateMask(clear)


# ===========================================================================
#  HELPER: Check clear-pixel ratio over the AOI
# ===========================================================================
def _aoi_clear_ratio(masked_image, band_name, region, scale):
    """Return the fraction of non-masked pixels inside *region*.
    Uses a constant-1 image masked the same way as the data band."""
    valid = masked_image.select(band_name).mask()       # 1 where valid
    total = ee.Image.constant(1)                        # 1 everywhere
    stats = ee.Image.cat([
        valid.rename('valid'),
        total.rename('total')
    ]).reduceRegion(
        reducer=ee.Reducer.sum(), geometry=region,
        scale=scale, maxPixels=1e9
    ).getInfo()
    v = stats.get('valid', 0) or 0
    t = stats.get('total', 0) or 1
    return v / t


# ===========================================================================
#  HELPER: Landsat 8/9 cloud mask + scale factors
# ===========================================================================
def _mask_landsat_clouds(image):
    """Mask clouds (bit 3), cloud shadow (bit 4) and dilated cloud (bit 1)
    using the QA_PIXEL band from Landsat Collection 2."""
    qa = image.select('QA_PIXEL')
    cloud  = qa.bitwiseAnd(1 << 3).eq(0)
    shadow = qa.bitwiseAnd(1 << 4).eq(0)
    dilated = qa.bitwiseAnd(1 << 1).eq(0)
    return image.updateMask(cloud.And(shadow).And(dilated))


def _apply_landsat_scale(image):
    """Apply Collection 2 Level-2 scale factors (SR → 0-1, ST → Kelvin)."""
    optical = image.select('SR_B.').multiply(0.0000275).add(-0.2)
    thermal = image.select('ST_B.*').multiply(0.00341802).add(149.0)
    return image.addBands(optical, None, True).addBands(thermal, None, True)


# ===========================================================================
#  Per-date processing helpers (called from thread pool)
# ===========================================================================

def _process_s2_date(s2_col, date_str, requested_s2, region):
    """Process a single Sentinel-2 date: mosaic → indices → stats.

    Returns dict {"date", "sensor", "values"} or None if cloudy/empty.
    Uses a SINGLE getInfo() call per date (combined clear-check + stats).
    """
    day_start = ee.Date(date_str)
    day_end = day_start.advance(1, 'day')
    dm = s2_col.filterDate(day_start, day_end).mosaic()

    imgs, valid = [], []

    if 'NDVI' in requested_s2:
        imgs.append(dm.normalizedDifference(['B8', 'B4']).rename('NDVI')); valid.append('NDVI')
    if 'NDRE' in requested_s2:
        imgs.append(dm.normalizedDifference(['B8', 'B5']).rename('NDRE')); valid.append('NDRE')
    if 'GNDVI' in requested_s2:
        imgs.append(dm.normalizedDifference(['B8', 'B3']).rename('GNDVI')); valid.append('GNDVI')
    if 'EVI' in requested_s2:
        imgs.append(dm.expression(
            '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 10000))',
            {'NIR': dm.select('B8'), 'RED': dm.select('B4'), 'BLUE': dm.select('B2')}
        ).rename('EVI')); valid.append('EVI')
    if 'SAVI' in requested_s2:
        imgs.append(dm.expression(
            '((NIR - RED) / (NIR + RED + 5000)) * 1.5',
            {'NIR': dm.select('B8'), 'RED': dm.select('B4')}
        ).rename('SAVI')); valid.append('SAVI')
    if 'CIre' in requested_s2:
        imgs.append(dm.expression('(RE3 / RE1) - 1',
            {'RE3': dm.select('B7'), 'RE1': dm.select('B5')}
        ).rename('CIre')); valid.append('CIre')
    if 'MTCI' in requested_s2:
        imgs.append(dm.expression('(RE2 - RE1) / (RE1 - RED)',
            {'RE2': dm.select('B6'), 'RE1': dm.select('B5'), 'RED': dm.select('B4')}
        ).rename('MTCI')); valid.append('MTCI')
    if 'IRECI' in requested_s2:
        imgs.append(dm.expression('(RE3 - RED) * RE2 / (RE1 * 10000)',
            {'RE3': dm.select('B7'), 'RED': dm.select('B4'),
             'RE1': dm.select('B5'), 'RE2': dm.select('B6')}
        ).rename('IRECI')); valid.append('IRECI')
    if 'NDMI' in requested_s2:
        imgs.append(dm.normalizedDifference(['B8', 'B11']).rename('NDMI')); valid.append('NDMI')
    if 'NMDI' in requested_s2:
        imgs.append(dm.expression(
            '(NIR - (SWIR1 - SWIR2)) / (NIR + (SWIR1 - SWIR2))',
            {'NIR': dm.select('B8'), 'SWIR1': dm.select('B11'), 'SWIR2': dm.select('B12')}
        ).rename('NMDI')); valid.append('NMDI')

    if not imgs:
        return None

    # Add clear-fraction band: mean of binary mask = fraction of clear pixels
    # unmask(0) ensures masked (cloudy) pixels contribute 0 to the average
    clear_band = dm.select('B8').mask().unmask(0).rename('clear_frac')
    combined = ee.Image.cat(imgs).addBands(clear_band)

    try:
        stats = combined.reduceRegion(
            reducer=ee.Reducer.mean(), geometry=region, scale=10, maxPixels=1e9
        ).getInfo()
    except Exception as exc:
        log.warning("S2 reduceRegion failed for %s: %s", date_str, exc)
        return None

    # Check clear-pixel ratio
    clear_frac = stats.get('clear_frac', 0) or 0
    if clear_frac < MIN_CLEAR_RATIO:
        return None

    day_vals = {}
    for idx in valid:
        v = stats.get(idx)
        if v is not None:
            day_vals[idx] = round(v, 4)
    return {"date": date_str, "sensor": "Sentinel-2", "values": day_vals} if day_vals else None


def _process_ls_date(ls_col, date_str, requested_landsat, region):
    """Process a single Landsat date: mosaic → indices → stats.

    Returns dict {"date", "sensor", "values"} or None if cloudy/empty.
    Uses a SINGLE getInfo() call per date. The minMax reduceRegion for
    TVDI/TCI/VHI is kept lazy (ee.Dictionary → ee.Number) and resolved
    within the same computation graph.
    """
    day_start = ee.Date(date_str)
    day_end = day_start.advance(1, 'day')
    dm = ls_col.filterDate(day_start, day_end).mosaic()

    ndvi_l = dm.normalizedDifference(['SR_B5', 'SR_B4']).rename('ndvi_l')
    lst_c  = dm.select('ST_B10').subtract(273.15).rename('lst_c')

    imgs, valid = [], []

    if 'LST' in requested_landsat:
        imgs.append(lst_c.rename('LST')); valid.append('LST')
    if 'VSWI' in requested_landsat:
        imgs.append(ndvi_l.divide(lst_c).rename('VSWI')); valid.append('VSWI')

    needs_mm = any(i in requested_landsat for i in ('TVDI', 'TCI', 'VHI'))
    if needs_mm:
        # Lazy ee.Dictionary — resolved as part of the final getInfo() graph
        mm = ee.Image.cat([ndvi_l, lst_c]).reduceRegion(
            reducer=ee.Reducer.minMax(), geometry=region, scale=30, maxPixels=1e9)
        ndvi_min = ee.Number(mm.get('ndvi_l_min'))
        ndvi_max = ee.Number(mm.get('ndvi_l_max'))
        lst_min  = ee.Number(mm.get('lst_c_min'))
        lst_max  = ee.Number(mm.get('lst_c_max'))
        ndvi_rng = ndvi_max.subtract(ndvi_min).max(0.001)
        lst_rng  = lst_max.subtract(lst_min).max(0.001)

        if 'TVDI' in requested_landsat:
            imgs.append(lst_c.subtract(lst_min).divide(lst_rng).rename('TVDI'))
            valid.append('TVDI')
        if 'TCI' in requested_landsat:
            imgs.append(ee.Image.constant(lst_max).subtract(lst_c)
                        .divide(lst_rng).multiply(100).rename('TCI'))
            valid.append('TCI')
        if 'VHI' in requested_landsat:
            vci = ndvi_l.subtract(ndvi_min).divide(ndvi_rng).multiply(100)
            tci = ee.Image.constant(lst_max).subtract(lst_c).divide(lst_rng).multiply(100)
            imgs.append(vci.multiply(0.5).add(tci.multiply(0.5)).rename('VHI'))
            valid.append('VHI')

    if not imgs:
        return None

    clear_band = dm.select('SR_B5').mask().unmask(0).rename('clear_frac')
    combined = ee.Image.cat(imgs).addBands(clear_band)

    try:
        stats = combined.reduceRegion(
            reducer=ee.Reducer.mean(), geometry=region, scale=30, maxPixels=1e9
        ).getInfo()
    except Exception as exc:
        log.warning("Landsat reduceRegion failed for %s: %s", date_str, exc)
        return None

    clear_frac = stats.get('clear_frac', 0) or 0
    if clear_frac < MIN_CLEAR_RATIO:
        return None

    day_vals = {}
    for idx in valid:
        v = stats.get(idx)
        if v is not None:
            day_vals[idx] = round(v, 4)
    return {"date": date_str, "sensor": "Landsat 8/9", "values": day_vals} if day_vals else None


# Max concurrent GEE requests per analysis (stay within GEE rate limits)
_MAX_GEE_WORKERS = 6


# ===========================================================================
#  Main analysis logic  (optimised: threaded dates, single getInfo per date)
# ===========================================================================
def calculate_biomass_logic(request: AnalysisRequest) -> dict:
    t0 = time.time()
    region = ee.Geometry(request.geojson)

    requested_s2 = [i for i in request.indices if i in S2_INDICES]
    requested_landsat = [i for i in request.indices if i in LANDSAT_INDICES]

    # -------------------------------------------------------------------
    #  Phase 1: Discover available dates  (S2 + Landsat in parallel)
    # -------------------------------------------------------------------
    s2_dates, ls_dates = [], []

    def _fetch_s2_dates():
        if not requested_s2:
            return
        col = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
               .filterBounds(region)
               .filterDate(request.start_date, request.end_date)
               .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', request.cloud_cover))
               .map(_mask_s2_clouds))
        dates = (col.map(lambda img: ee.Feature(None, {'date': img.date().format('YYYY-MM-dd')}))
                 .aggregate_array('date').distinct().getInfo())
        return col, dates

    def _fetch_ls_dates():
        if not requested_landsat:
            return
        l8 = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
        l9 = ee.ImageCollection("LANDSAT/LC09/C02/T1_L2")
        col = (l8.merge(l9)
               .filterBounds(region)
               .filterDate(request.start_date, request.end_date)
               .filter(ee.Filter.lt('CLOUD_COVER', request.cloud_cover))
               .map(_mask_landsat_clouds).map(_apply_landsat_scale))
        dates = (col.map(lambda img: ee.Feature(None, {'date': img.date().format('YYYY-MM-dd')}))
                 .aggregate_array('date').distinct().getInfo())
        return col, dates

    s2_col = ls_col = None
    with ThreadPoolExecutor(max_workers=2) as pool:
        fut_s2 = pool.submit(_fetch_s2_dates) if requested_s2 else None
        fut_ls = pool.submit(_fetch_ls_dates) if requested_landsat else None
        if fut_s2:
            result = fut_s2.result()
            if result:
                s2_col, s2_dates = result
        if fut_ls:
            result = fut_ls.result()
            if result:
                ls_col, ls_dates = result

    t_dates = time.time()
    log.info("Date discovery: S2=%d, Landsat=%d dates in %.1fs",
             len(s2_dates), len(ls_dates), t_dates - t0)

    # -------------------------------------------------------------------
    #  Phase 2: Process all dates in parallel  (single getInfo per date)
    # -------------------------------------------------------------------
    timeseries_results = []
    all_values_flat = {idx: [] for idx in request.indices}

    futures = []
    with ThreadPoolExecutor(max_workers=_MAX_GEE_WORKERS) as pool:
        for d in s2_dates:
            futures.append(pool.submit(_process_s2_date, s2_col, d, requested_s2, region))
        for d in ls_dates:
            futures.append(pool.submit(_process_ls_date, ls_col, d, requested_landsat, region))

        for fut in as_completed(futures):
            try:
                result = fut.result()
            except Exception as exc:
                log.warning("Date processing failed: %s", exc)
                continue
            if result is None:
                continue
            timeseries_results.append(result)
            for idx, v in result['values'].items():
                all_values_flat[idx].append(v)

    # -------------------------------------------------------------------
    #  Summary  (mean for backwards compat + richer stats)
    # -------------------------------------------------------------------
    timeseries_results.sort(key=lambda x: x['date'])
    summary_stats = {}
    period_stats = {}
    for idx in request.indices:
        vals = all_values_flat.get(idx, [])
        if vals:
            vals_sorted = sorted(vals)
            n = len(vals_sorted)
            mean_val = statistics.mean(vals)
            summary_stats[idx] = round(mean_val, 4)

            def _percentile(data, p):
                k = (len(data) - 1) * p / 100
                f = int(k)
                c = f + 1 if f + 1 < len(data) else f
                return data[f] + (k - f) * (data[c] - data[f])

            period_stats[idx] = {
                "mean": round(mean_val, 4),
                "min": round(vals_sorted[0], 4),
                "max": round(vals_sorted[-1], 4),
                "std_dev": round(statistics.stdev(vals), 4) if n >= 2 else 0.0,
                "median": round(statistics.median(vals), 4),
                "p10": round(_percentile(vals_sorted, 10), 4),
                "p90": round(_percentile(vals_sorted, 90), 4),
                "count": n,
            }
        else:
            summary_stats[idx] = None
            period_stats[idx] = {
                "mean": None, "min": None, "max": None,
                "std_dev": None, "median": None, "p10": None, "p90": None,
                "count": 0,
            }

    sensors = []
    if requested_s2:
        sensors.append("Sentinel-2 L2A")
    if requested_landsat:
        sensors.append("Landsat 8/9 C2L2")

    elapsed = time.time() - t0
    log.info("Analysis complete: %d dates, %.1fs total", len(timeseries_results), elapsed)

    return {
        "metadata": {
            "field_id": request.field_id,
            "start_date": request.start_date,
            "end_date": request.end_date,
            "sensor": " + ".join(sensors)
        },
        "period_summary": summary_stats,
        "period_stats": period_stats,
        "timeseries": timeseries_results
    }


# ===========================================================================
#  Database persistence
# ===========================================================================
def save_results_to_db(db: Session, result_data: dict):
    field_id = result_data["metadata"]["field_id"]
    updated_count = 0
    new_count = 0

    for item in result_data["timeseries"]:
        measurement_date = date_type.fromisoformat(item["date"])
        sensor = item.get("sensor", "")
        values = item["values"]

        existing = db.query(models.Measurement).filter(
            models.Measurement.field_id == field_id,
            models.Measurement.date == measurement_date,
            models.Measurement.sensor == sensor
        ).first()

        if existing:
            modified = False
            for idx_name, val in values.items():
                column_name = idx_name.lower()
                if getattr(existing, column_name, None) != val:
                    setattr(existing, column_name, val)
                    modified = True
            if modified:
                updated_count += 1
            continue

        db_record = models.Measurement(
            field_id=field_id,
            date=measurement_date,
            sensor=sensor,
            # Sentinel-2
            ndvi=values.get("NDVI"),
            ndre=values.get("NDRE"),
            gndvi=values.get("GNDVI"),
            evi=values.get("EVI"),
            savi=values.get("SAVI"),
            cire=values.get("CIre"),
            mtci=values.get("MTCI"),
            ireci=values.get("IRECI"),
            ndmi=values.get("NDMI"),
            nmdi=values.get("NMDI"),
            # Landsat thermal / drought
            lst=values.get("LST"),
            vswi=values.get("VSWI"),
            tvdi=values.get("TVDI"),
            tci=values.get("TCI"),
            vhi=values.get("VHI"),
        )
        db.add(db_record)
        new_count += 1

    db.commit()
    print(f"DB: {new_count} new rows, {updated_count} updated rows.")


# ===========================================================================
#  Tile URL generation for map visualisation
# ===========================================================================
def generate_tile_url(request: AnalysisRequest, index_name: str) -> dict:
    region = ee.Geometry(request.geojson)

    s_date = ee.Date(request.start_date)
    e_date = ee.Date(request.end_date)
    if request.start_date == request.end_date:
        e_date = s_date.advance(1, 'day')

    # ---------------------------------------------------------------
    #  Landsat branch
    # ---------------------------------------------------------------
    # Route to the correct branch: explicit sensor hint (for RGB) or index membership
    use_landsat = (index_name in LANDSAT_INDICES or
                   (index_name == "RGB" and request.sensor and "Landsat" in request.sensor))
    if use_landsat:
        # Palettes
        LST_PALETTE   = ['08306b', '2171b5', '6baed6', 'bdd7e7', 'ffffcc', 'fed976', 'fd8d3c', 'e31a1c', '800026']
        VSWI_PALETTE  = ['d73027', 'fc8d59', 'fee08b', 'd9ef8b', '66bd63', '1a9850']
        TVDI_PALETTE  = ['2166ac', '67a9cf', 'd1e5f0', 'fddbc7', 'ef8a62', 'b2182b']
        HEALTH_PALETTE = ['d73027', 'fc8d59', 'fee08b', 'd9ef8b', '66bd63', '1a9850']

        l8 = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
        l9 = ee.ImageCollection("LANDSAT/LC09/C02/T1_L2")
        ls_col = (l8.merge(l9)
                  .filterBounds(region)
                  .filterDate(s_date, e_date)
                  .filter(ee.Filter.lt('CLOUD_COVER', request.cloud_cover))
                  .map(_mask_landsat_clouds)
                  .map(_apply_landsat_scale))

        if ls_col.size().getInfo() == 0:
            raise Exception(f"No clear Landsat imagery for date: {request.start_date}")

        image = ls_col.median().clip(region)
        ndvi_l = image.normalizedDifference(['SR_B5', 'SR_B4']).rename('ndvi_l')
        lst_c  = image.select('ST_B10').subtract(273.15).rename('lst_c')

        viz_image = None
        vis_params = {}

        if index_name == "LST":
            viz_image = lst_c
            vis_params = {'min': 0, 'max': 45, 'palette': LST_PALETTE}

        elif index_name == "VSWI":
            viz_image = ndvi_l.divide(lst_c)
            vis_params = {'min': 0, 'max': 0.06, 'palette': VSWI_PALETTE}

        elif index_name in ("TVDI", "TCI", "VHI"):
            mm = ee.Image.cat([ndvi_l, lst_c]).reduceRegion(
                reducer=ee.Reducer.minMax(), geometry=region, scale=30, maxPixels=1e9)
            ndvi_min = ee.Number(mm.get('ndvi_l_min'))
            ndvi_max = ee.Number(mm.get('ndvi_l_max'))
            lst_min  = ee.Number(mm.get('lst_c_min'))
            lst_max  = ee.Number(mm.get('lst_c_max'))
            ndvi_rng = ndvi_max.subtract(ndvi_min).max(0.001)
            lst_rng  = lst_max.subtract(lst_min).max(0.001)

            if index_name == "TVDI":
                viz_image = lst_c.subtract(lst_min).divide(lst_rng)
                vis_params = {'min': 0, 'max': 1, 'palette': TVDI_PALETTE}
            elif index_name == "TCI":
                viz_image = ee.Image.constant(lst_max).subtract(lst_c).divide(lst_rng).multiply(100)
                vis_params = {'min': 0, 'max': 100, 'palette': HEALTH_PALETTE}
            elif index_name == "VHI":
                vci = ndvi_l.subtract(ndvi_min).divide(ndvi_rng).multiply(100)
                tci = ee.Image.constant(lst_max).subtract(lst_c).divide(lst_rng).multiply(100)
                viz_image = vci.multiply(0.5).add(tci.multiply(0.5))
                vis_params = {'min': 0, 'max': 100, 'palette': HEALTH_PALETTE}

        # Landsat RGB true-color composite
        if index_name == "RGB":
            viz_image = image.select(['SR_B4', 'SR_B3', 'SR_B2'])
            vis_params = {'min': 0.0, 'max': 0.3}

        if viz_image:
            return _get_map_id(viz_image, vis_params, index_name, native_scale=30)
        raise Exception(f"Unsupported Landsat index: {index_name}")

    # ---------------------------------------------------------------
    #  Sentinel-2 branch  (existing)
    # ---------------------------------------------------------------
    NDVI_PALETTE  = ['a50026', 'd73027', 'f46d43', 'fdae61', 'fee08b', 'd9ef8b', 'a6d96a', '66bd63', '1a9850', '006837']
    NDRE_PALETTE  = ['440154', '482878', '3e4989', '31688e', '26828e', '1f9e89', '35b779', '6ece58', 'b5de2b', 'fde725']
    GNDVI_PALETTE = ['a50026', 'f46d43', 'fee08b', 'addd8e', '66bd63', '006837']
    EVI_PALETTE   = ['CE7E45', 'DF923D', 'F1B555', 'FCD163', '99B718', '74A901', '66A000', '529400', '3E8601', '207401']
    SAVI_PALETTE  = ['8c510a', 'bf812d', 'dfc27d', 'f6e8c3', 'c7eae5', '80cdc1', '35978f', '01665e']
    CIRE_PALETTE  = ['ffffcc', 'd9f0a3', 'addd8e', '78c679', '41ab5d', '238443', '005a32']
    MTCI_PALETTE  = ['ffffb2', 'fed976', 'feb24c', 'fd8d3c', 'fc4e2a', 'e31a1c', 'b10026']
    IRECI_PALETTE = ['fef0d9', 'fdd49e', 'fdbb84', 'fc8d59', 'ef6548', 'd7301f', '990000']
    NDMI_PALETTE  = ['8c510a', 'd8b365', 'f6e8c3', 'c7eae5', '5ab4ac', '2166ac', '053061']
    NMDI_PALETTE  = ['d73027', 'fc8d59', 'fee090', 'ffffbf', 'e0f3f8', '91bfdb', '4575b4']

    s2_col = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
              .filterBounds(region)
              .filterDate(s_date, e_date)
              .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', request.cloud_cover))
              .map(_mask_s2_clouds))

    if s2_col.size().getInfo() == 0:
        raise Exception(f"No clear Sentinel-2 imagery for date: {request.start_date}")

    image = s2_col.median().clip(region)
    viz_image = None
    vis_params = {}

    if index_name == "NDVI":
        viz_image = image.normalizedDifference(['B8', 'B4'])
        vis_params = {'min': -0.2, 'max': 1.0, 'palette': NDVI_PALETTE}
    elif index_name == "NDRE":
        viz_image = image.normalizedDifference(['B8', 'B5'])
        vis_params = {'min': -0.2, 'max': 0.8, 'palette': NDRE_PALETTE}
    elif index_name == "GNDVI":
        viz_image = image.normalizedDifference(['B8', 'B3'])
        vis_params = {'min': -0.2, 'max': 0.9, 'palette': GNDVI_PALETTE}
    elif index_name == "EVI":
        viz_image = image.expression(
            '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 10000))',
            {'NIR': image.select('B8'), 'RED': image.select('B4'), 'BLUE': image.select('B2')})
        vis_params = {'min': -0.2, 'max': 0.8, 'palette': EVI_PALETTE}
    elif index_name == "SAVI":
        viz_image = image.expression(
            '((NIR - RED) / (NIR + RED + 5000)) * 1.5',
            {'NIR': image.select('B8'), 'RED': image.select('B4')})
        vis_params = {'min': -0.2, 'max': 0.8, 'palette': SAVI_PALETTE}
    elif index_name == "CIre":
        viz_image = image.expression(
            '(RE3 / RE1) - 1',
            {'RE3': image.select('B7'), 'RE1': image.select('B5')})
        vis_params = {'min': 0, 'max': 10, 'palette': CIRE_PALETTE}
    elif index_name == "MTCI":
        viz_image = image.expression(
            '(RE2 - RE1) / (RE1 - RED)',
            {'RE2': image.select('B6'), 'RE1': image.select('B5'), 'RED': image.select('B4')})
        vis_params = {'min': 0, 'max': 6, 'palette': MTCI_PALETTE}
    elif index_name == "IRECI":
        viz_image = image.expression(
            '(RE3 - RED) * RE2 / (RE1 * 10000)',
            {'RE3': image.select('B7'), 'RED': image.select('B4'),
             'RE1': image.select('B5'), 'RE2': image.select('B6')})
        vis_params = {'min': 0, 'max': 3, 'palette': IRECI_PALETTE}
    elif index_name == "NDMI":
        viz_image = image.normalizedDifference(['B8', 'B11'])
        vis_params = {'min': -0.8, 'max': 0.8, 'palette': NDMI_PALETTE}
    elif index_name == "NMDI":
        viz_image = image.expression(
            '(NIR - (SWIR1 - SWIR2)) / (NIR + (SWIR1 - SWIR2))',
            {'NIR': image.select('B8'), 'SWIR1': image.select('B11'), 'SWIR2': image.select('B12')})
        vis_params = {'min': 0, 'max': 1.0, 'palette': NMDI_PALETTE}
    elif index_name == "RGB":
        viz_image = image.select(['B4', 'B3', 'B2'])
        vis_params = {'min': 0, 'max': 3000}

    if viz_image:
        return _get_map_id(viz_image, vis_params, index_name, native_scale=10)

    raise Exception(f"Unsupported index for visualisation: {index_name}")


# ===========================================================================
#  BATCH tile URL generation  –  one collection filter per date, all indices
#  at once, parallelised getMapId calls via ThreadPoolExecutor.
# ===========================================================================

# ---- Palette definitions (shared across batch & single) ----
_S2_PALETTES = {
    'NDVI':  ['a50026','d73027','f46d43','fdae61','fee08b','d9ef8b','a6d96a','66bd63','1a9850','006837'],
    'NDRE':  ['440154','482878','3e4989','31688e','26828e','1f9e89','35b779','6ece58','b5de2b','fde725'],
    'GNDVI': ['a50026','f46d43','fee08b','addd8e','66bd63','006837'],
    'EVI':   ['CE7E45','DF923D','F1B555','FCD163','99B718','74A901','66A000','529400','3E8601','207401'],
    'SAVI':  ['8c510a','bf812d','dfc27d','f6e8c3','c7eae5','80cdc1','35978f','01665e'],
    'CIre':  ['ffffcc','d9f0a3','addd8e','78c679','41ab5d','238443','005a32'],
    'MTCI':  ['ffffb2','fed976','feb24c','fd8d3c','fc4e2a','e31a1c','b10026'],
    'IRECI': ['fef0d9','fdd49e','fdbb84','fc8d59','ef6548','d7301f','990000'],
    'NDMI':  ['8c510a','d8b365','f6e8c3','c7eae5','5ab4ac','2166ac','053061'],
    'NMDI':  ['d73027','fc8d59','fee090','ffffbf','e0f3f8','91bfdb','4575b4'],
}
_LS_PALETTES = {
    'LST':  ['08306b','2171b5','6baed6','bdd7e7','ffffcc','fed976','fd8d3c','e31a1c','800026'],
    'VSWI': ['d73027','fc8d59','fee08b','d9ef8b','66bd63','1a9850'],
    'TVDI': ['2166ac','67a9cf','d1e5f0','fddbc7','ef8a62','b2182b'],
    'TCI':  ['d73027','fc8d59','fee08b','d9ef8b','66bd63','1a9850'],
    'VHI':  ['d73027','fc8d59','fee08b','d9ef8b','66bd63','1a9850'],
}


def _get_map_id(viz_image, vis_params, index_name, native_scale=None):
    """Wrapper for getMapId suitable for ThreadPoolExecutor."""
    mid = viz_image.getMapId(vis_params)
    return {"layer_url": mid['tile_fetcher'].url_format, "index_name": index_name}


def _build_s2_layers(image, indices):
    """Build {index_name: (ee.Image, vis_params)} dict for Sentinel-2."""
    layers = {}
    for idx in indices:
        viz = None; vp = {}
        if idx == "NDVI":
            viz = image.normalizedDifference(['B8','B4'])
            vp = {'min': -0.2, 'max': 1.0, 'palette': _S2_PALETTES['NDVI']}
        elif idx == "NDRE":
            viz = image.normalizedDifference(['B8','B5'])
            vp = {'min': -0.2, 'max': 0.8, 'palette': _S2_PALETTES['NDRE']}
        elif idx == "GNDVI":
            viz = image.normalizedDifference(['B8','B3'])
            vp = {'min': -0.2, 'max': 0.9, 'palette': _S2_PALETTES['GNDVI']}
        elif idx == "EVI":
            viz = image.expression(
                '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 10000))',
                {'NIR': image.select('B8'), 'RED': image.select('B4'), 'BLUE': image.select('B2')})
            vp = {'min': -0.2, 'max': 0.8, 'palette': _S2_PALETTES['EVI']}
        elif idx == "SAVI":
            viz = image.expression(
                '((NIR - RED) / (NIR + RED + 5000)) * 1.5',
                {'NIR': image.select('B8'), 'RED': image.select('B4')})
            vp = {'min': -0.2, 'max': 0.8, 'palette': _S2_PALETTES['SAVI']}
        elif idx == "CIre":
            viz = image.expression('(RE3 / RE1) - 1',
                {'RE3': image.select('B7'), 'RE1': image.select('B5')})
            vp = {'min': 0, 'max': 10, 'palette': _S2_PALETTES['CIre']}
        elif idx == "MTCI":
            viz = image.expression('(RE2 - RE1) / (RE1 - RED)',
                {'RE2': image.select('B6'), 'RE1': image.select('B5'), 'RED': image.select('B4')})
            vp = {'min': 0, 'max': 6, 'palette': _S2_PALETTES['MTCI']}
        elif idx == "IRECI":
            viz = image.expression('(RE3 - RED) * RE2 / (RE1 * 10000)',
                {'RE3': image.select('B7'), 'RED': image.select('B4'),
                 'RE1': image.select('B5'), 'RE2': image.select('B6')})
            vp = {'min': 0, 'max': 3, 'palette': _S2_PALETTES['IRECI']}
        elif idx == "NDMI":
            viz = image.normalizedDifference(['B8','B11'])
            vp = {'min': -0.8, 'max': 0.8, 'palette': _S2_PALETTES['NDMI']}
        elif idx == "NMDI":
            viz = image.expression(
                '(NIR - (SWIR1 - SWIR2)) / (NIR + (SWIR1 - SWIR2))',
                {'NIR': image.select('B8'), 'SWIR1': image.select('B11'), 'SWIR2': image.select('B12')})
            vp = {'min': 0, 'max': 1.0, 'palette': _S2_PALETTES['NMDI']}
        elif idx == "RGB":
            viz = image.select(['B4','B3','B2'])
            vp = {'min': 0, 'max': 3000}
        if viz is not None:
            layers[idx] = (viz, vp)
    return layers


def _build_ls_layers(image, indices, region):
    """Build {index_name: (ee.Image, vis_params)} dict for Landsat 8/9."""
    ndvi_l = image.normalizedDifference(['SR_B5','SR_B4']).rename('ndvi_l')
    lst_c  = image.select('ST_B10').subtract(273.15).rename('lst_c')

    layers = {}
    needs_mm = any(i in ('TVDI','TCI','VHI') for i in indices)
    mm_done = False
    ndvi_min = ndvi_max = lst_min = lst_max = ndvi_rng = lst_rng = None

    for idx in indices:
        viz = None; vp = {}
        if idx == "LST":
            viz = lst_c
            vp = {'min': 0, 'max': 45, 'palette': _LS_PALETTES['LST']}
        elif idx == "VSWI":
            viz = ndvi_l.divide(lst_c)
            vp = {'min': 0, 'max': 0.06, 'palette': _LS_PALETTES['VSWI']}
        elif idx in ("TVDI","TCI","VHI"):
            if needs_mm and not mm_done:
                mm = ee.Image.cat([ndvi_l, lst_c]).reduceRegion(
                    reducer=ee.Reducer.minMax(), geometry=region, scale=30, maxPixels=1e9)
                ndvi_min = ee.Number(mm.get('ndvi_l_min'))
                ndvi_max = ee.Number(mm.get('ndvi_l_max'))
                lst_min  = ee.Number(mm.get('lst_c_min'))
                lst_max  = ee.Number(mm.get('lst_c_max'))
                ndvi_rng = ndvi_max.subtract(ndvi_min).max(0.001)
                lst_rng  = lst_max.subtract(lst_min).max(0.001)
                mm_done = True
            if idx == "TVDI":
                viz = lst_c.subtract(lst_min).divide(lst_rng)
                vp = {'min': 0, 'max': 1, 'palette': _LS_PALETTES['TVDI']}
            elif idx == "TCI":
                viz = ee.Image.constant(lst_max).subtract(lst_c).divide(lst_rng).multiply(100)
                vp = {'min': 0, 'max': 100, 'palette': _LS_PALETTES['TCI']}
            elif idx == "VHI":
                vci = ndvi_l.subtract(ndvi_min).divide(ndvi_rng).multiply(100)
                tci = ee.Image.constant(lst_max).subtract(lst_c).divide(lst_rng).multiply(100)
                viz = vci.multiply(0.5).add(tci.multiply(0.5))
                vp = {'min': 0, 'max': 100, 'palette': _LS_PALETTES['VHI']}
        elif idx == "RGB":
            viz = image.select(['SR_B4','SR_B3','SR_B2'])
            vp = {'min': 0.0, 'max': 0.3}
        if viz is not None:
            layers[idx] = (viz, vp)
    return layers


def generate_tile_urls_batch(date: str, sensor: str, indices: list,
                             geojson: dict, cloud_cover: int = 20) -> dict:
    """Return tile URLs for ALL requested indices on a single date/sensor.

    Steps:
      1. Filter collection ONCE
      2. Build mosaic ONCE
      3. Compute all index images (lazy ee.Image objects – no round-trip)
      4. Call getMapId in PARALLEL via ThreadPoolExecutor

    Returns {"date", "sensor", "layers": [{"layer_url", "index_name"}, ...], "elapsed_ms"}
    """
    t0 = time.time()
    region = ee.Geometry(geojson)
    s_date = ee.Date(date)
    e_date = s_date.advance(1, 'day')

    # ---------- Build collection & mosaic ONCE ----------
    if "Landsat" in sensor:
        l8 = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
        l9 = ee.ImageCollection("LANDSAT/LC09/C02/T1_L2")
        col = (l8.merge(l9)
               .filterBounds(region).filterDate(s_date, e_date)
               .filter(ee.Filter.lt('CLOUD_COVER', cloud_cover))
               .map(_mask_landsat_clouds).map(_apply_landsat_scale))
        if col.size().getInfo() == 0:
            raise Exception(f"No clear Landsat imagery for {date}")
        image = col.median().clip(region)
        layer_defs = _build_ls_layers(image, indices, region)
    else:
        col = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
               .filterBounds(region).filterDate(s_date, e_date)
               .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cloud_cover))
               .map(_mask_s2_clouds))
        if col.size().getInfo() == 0:
            raise Exception(f"No clear Sentinel-2 imagery for {date}")
        image = col.median().clip(region)
        layer_defs = _build_s2_layers(image, indices)

    # ---------- Parallel getMapId ----------
    native_scale = 30 if "Landsat" in sensor else 10
    results = []
    with ThreadPoolExecutor(max_workers=min(len(layer_defs), 8)) as pool:
        futures = {
            pool.submit(_get_map_id, viz, vp, idx, native_scale): idx
            for idx, (viz, vp) in layer_defs.items()
        }
        for fut in as_completed(futures):
            idx = futures[fut]
            try:
                results.append(fut.result())
            except Exception as exc:
                log.warning("getMapId failed for %s: %s", idx, exc)

    # Preserve original index order
    order = {name: i for i, name in enumerate(indices)}
    results.sort(key=lambda r: order.get(r['index_name'], 999))

    elapsed = round((time.time() - t0) * 1000)
    log.info("Batch %s %s: %d layers in %d ms", date, sensor, len(results), elapsed)
    return {"date": date, "sensor": sensor, "layers": results, "elapsed_ms": elapsed}


# ===========================================================================
#  Pixel value query  –  sample index values at a single point
# ===========================================================================

def query_pixel_value(lat: float, lng: float, date: str, sensor: str,
                      indices: list, geojson: dict, cloud_cover: int = 20) -> dict:
    """Return index values at a specific lat/lng for a single date/sensor."""
    region = ee.Geometry(geojson)
    point = ee.Geometry.Point([lng, lat])
    s_date = ee.Date(date)
    e_date = s_date.advance(1, 'day')

    if "Landsat" in sensor:
        l8 = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
        l9 = ee.ImageCollection("LANDSAT/LC09/C02/T1_L2")
        col = (l8.merge(l9)
               .filterBounds(region).filterDate(s_date, e_date)
               .filter(ee.Filter.lt('CLOUD_COVER', cloud_cover))
               .map(_mask_landsat_clouds).map(_apply_landsat_scale))
        image = col.median().clip(region)
        layer_defs = _build_ls_layers(image, indices, region)
        scale = 30
    else:
        col = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
               .filterBounds(region).filterDate(s_date, e_date)
               .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', cloud_cover))
               .map(_mask_s2_clouds))
        image = col.median().clip(region)
        layer_defs = _build_s2_layers(image, indices)
        scale = 10

    bands = []
    band_names = []
    for idx, (viz, vp) in layer_defs.items():
        if idx != 'RGB':
            bands.append(viz.rename(idx))
            band_names.append(idx)

    if not bands:
        return {"lat": lat, "lng": lng, "date": date, "values": {}}

    combined = ee.Image.cat(bands)
    try:
        raw = combined.reduceRegion(
            reducer=ee.Reducer.first(),
            geometry=point,
            scale=scale
        ).getInfo()
    except Exception as exc:
        log.warning("Pixel query failed at (%s, %s): %s", lat, lng, exc)
        return {"lat": lat, "lng": lng, "date": date, "values": {}}

    result_values = {}
    for idx in band_names:
        v = raw.get(idx)
        if v is not None:
            result_values[idx] = round(v, 4)

    return {"lat": lat, "lng": lng, "date": date, "values": result_values}
