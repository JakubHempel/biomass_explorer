import ee
import statistics
from schemas import AnalysisRequest, BiomassResponse
from sqlalchemy.orm import Session
import models
import os
from dotenv import load_dotenv

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
def init_gee():
    try:
        ee.Initialize(project=MY_PROJECT_ID)
        print(f"GEE Initialized with project: {MY_PROJECT_ID}")
    except Exception as e:
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
#  Main analysis logic
# ===========================================================================
def calculate_biomass_logic(request: AnalysisRequest) -> dict:
    region = ee.Geometry(request.geojson)

    requested_s2 = [i for i in request.indices if i in S2_INDICES]
    requested_landsat = [i for i in request.indices if i in LANDSAT_INDICES]

    timeseries_results = []          # list of {"date": ..., "values": {...}}
    all_values_flat = {idx: [] for idx in request.indices}

    # -------------------------------------------------------------------
    #  A) Sentinel-2 processing
    # -------------------------------------------------------------------
    if requested_s2:
        s2_col = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                  .filterBounds(region)
                  .filterDate(request.start_date, request.end_date)
                  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', request.cloud_cover))
                  .map(_mask_s2_clouds))

        s2_dates = (s2_col
                    .map(lambda img: ee.Feature(None, {'date': img.date().format('YYYY-MM-dd')}))
                    .aggregate_array('date').distinct().getInfo())

        for date_str in s2_dates:
            day_start = ee.Date(date_str)
            day_end = day_start.advance(1, 'day')
            day_col = s2_col.filterDate(day_start, day_end)
            if day_col.size().getInfo() == 0:
                continue

            dm = day_col.mosaic()

            # --- AOI-level cloud check: skip if <80% pixels are clear ---
            clear_ratio = _aoi_clear_ratio(dm, 'B8', region, scale=10)
            if clear_ratio < MIN_CLEAR_RATIO:
                continue

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
                imgs.append(dm.expression(
                    '(RE3 / RE1) - 1',
                    {'RE3': dm.select('B7'), 'RE1': dm.select('B5')}
                ).rename('CIre')); valid.append('CIre')
            if 'MTCI' in requested_s2:
                imgs.append(dm.expression(
                    '(RE2 - RE1) / (RE1 - RED)',
                    {'RE2': dm.select('B6'), 'RE1': dm.select('B5'), 'RED': dm.select('B4')}
                ).rename('MTCI')); valid.append('MTCI')
            if 'IRECI' in requested_s2:
                imgs.append(dm.expression(
                    '(RE3 - RED) * RE2 / (RE1 * 10000)',
                    {'RE3': dm.select('B7'), 'RED': dm.select('B4'), 'RE1': dm.select('B5'), 'RE2': dm.select('B6')}
                ).rename('IRECI')); valid.append('IRECI')
            if 'NDMI' in requested_s2:
                imgs.append(dm.normalizedDifference(['B8', 'B11']).rename('NDMI')); valid.append('NDMI')
            if 'NMDI' in requested_s2:
                imgs.append(dm.expression(
                    '(NIR - (SWIR1 - SWIR2)) / (NIR + (SWIR1 - SWIR2))',
                    {'NIR': dm.select('B8'), 'SWIR1': dm.select('B11'), 'SWIR2': dm.select('B12')}
                ).rename('NMDI')); valid.append('NMDI')

            if not imgs:
                continue

            try:
                stats = ee.Image.cat(imgs).reduceRegion(
                    reducer=ee.Reducer.mean(), geometry=region, scale=10, maxPixels=1e9
                ).getInfo()
            except Exception:
                continue

            day_vals, has = {}, False
            for idx in valid:
                v = stats.get(idx)
                if v is not None:
                    day_vals[idx] = round(v, 4); all_values_flat[idx].append(day_vals[idx]); has = True
            if has:
                timeseries_results.append({"date": date_str, "sensor": "Sentinel-2", "values": day_vals})

    # -------------------------------------------------------------------
    #  B) Landsat 8/9 processing  (thermal + drought indices)
    # -------------------------------------------------------------------
    if requested_landsat:
        l8 = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
        l9 = ee.ImageCollection("LANDSAT/LC09/C02/T1_L2")
        ls_col = (l8.merge(l9)
                  .filterBounds(region)
                  .filterDate(request.start_date, request.end_date)
                  .filter(ee.Filter.lt('CLOUD_COVER', request.cloud_cover))
                  .map(_mask_landsat_clouds)
                  .map(_apply_landsat_scale))

        ls_dates = (ls_col
                    .map(lambda img: ee.Feature(None, {'date': img.date().format('YYYY-MM-dd')}))
                    .aggregate_array('date').distinct().getInfo())

        for date_str in ls_dates:
            day_start = ee.Date(date_str)
            day_end = day_start.advance(1, 'day')
            day_col = ls_col.filterDate(day_start, day_end)
            if day_col.size().getInfo() == 0:
                continue

            dm = day_col.mosaic()

            # --- AOI-level cloud check: skip if <80% pixels are clear ---
            clear_ratio = _aoi_clear_ratio(dm, 'SR_B5', region, scale=30)
            if clear_ratio < MIN_CLEAR_RATIO:
                continue

            ndvi_l = dm.normalizedDifference(['SR_B5', 'SR_B4']).rename('ndvi_l')
            lst_c = dm.select('ST_B10').subtract(273.15).rename('lst_c')

            imgs, valid = [], []

            if 'LST' in requested_landsat:
                imgs.append(lst_c.rename('LST')); valid.append('LST')
            if 'VSWI' in requested_landsat:
                imgs.append(ndvi_l.divide(lst_c).rename('VSWI')); valid.append('VSWI')

            # TCI / VHI / TVDI need region-level min/max (computed server-side)
            needs_mm = any(i in requested_landsat for i in ('TVDI', 'TCI', 'VHI'))
            if needs_mm:
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
                continue

            try:
                stats = ee.Image.cat(imgs).reduceRegion(
                    reducer=ee.Reducer.mean(), geometry=region, scale=30, maxPixels=1e9
                ).getInfo()
            except Exception:
                continue

            day_vals, has = {}, False
            for idx in valid:
                v = stats.get(idx)
                if v is not None:
                    day_vals[idx] = round(v, 4); all_values_flat[idx].append(day_vals[idx]); has = True
            if has:
                timeseries_results.append({"date": date_str, "sensor": "Landsat 8/9", "values": day_vals})

    # -------------------------------------------------------------------
    #  Summary
    # -------------------------------------------------------------------
    timeseries_results.sort(key=lambda x: x['date'])
    summary_stats = {}
    for idx in request.indices:
        vals = all_values_flat.get(idx, [])
        summary_stats[idx] = round(statistics.mean(vals), 4) if vals else None

    sensors = []
    if requested_s2:
        sensors.append("Sentinel-2 L2A")
    if requested_landsat:
        sensors.append("Landsat 8/9 C2L2")

    return {
        "metadata": {
            "field_id": request.field_id,
            "start_date": request.start_date,
            "end_date": request.end_date,
            "sensor": " + ".join(sensors)
        },
        "period_summary": summary_stats,
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
        measurement_date = item["date"]
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
    if index_name in LANDSAT_INDICES:
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

        if viz_image:
            map_id_dict = viz_image.getMapId(vis_params)
            return {"layer_url": map_id_dict['tile_fetcher'].url_format, "index_name": index_name}
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
        map_id_dict = viz_image.getMapId(vis_params)
        return {"layer_url": map_id_dict['tile_fetcher'].url_format, "index_name": index_name}

    raise Exception(f"Unsupported index for visualisation: {index_name}")
