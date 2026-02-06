import ee
import statistics
from schemas import AnalysisRequest, BiomassResponse
from sqlalchemy.orm import Session
import models  # Importujemy definicję tabeli
import os
from dotenv import load_dotenv

load_dotenv()

MY_PROJECT_ID = os.getenv('GEE_PROJECT_ID')

def init_gee():
    try:
        ee.Initialize(project=MY_PROJECT_ID)
        print(f"GEE Initialized with project: {MY_PROJECT_ID}")
    except Exception as e:
        print("Interactive authentication required...")
        ee.Authenticate()
        ee.Initialize(project=MY_PROJECT_ID)


def calculate_biomass_logic(request: AnalysisRequest) -> dict:
    region = ee.Geometry(request.geojson)
    
    # 1. Cloud masking
    def mask_clouds(image):
        qa = image.select('QA60')
        mask = qa.bitwiseAnd(1 << 10).eq(0).And(qa.bitwiseAnd(1 << 11).eq(0))
        return image.updateMask(mask)

    collection = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                  .filterBounds(region)
                  .filterDate(request.start_date, request.end_date)
                  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', request.cloud_cover))
                  .map(mask_clouds))

    # 2. Dates
    date_list = collection.map(lambda img: ee.Feature(None, {'date': img.date().format('YYYY-MM-dd')}))
    unique_dates = date_list.aggregate_array('date').distinct().getInfo()

    timeseries_results = []
    all_values_flat = {idx: [] for idx in request.indices}

    # 3. Processing
    for date_str in unique_dates:
        day_start = ee.Date(date_str)
        day_end = day_start.advance(1, 'day')
        day_col = collection.filterDate(day_start, day_end)
        
        if day_col.size().getInfo() == 0:
            continue

        daily_mosaic = day_col.mosaic()
        images_to_stack = []
        valid_indices_today = []
        
        # 1. NDVI (Standard)
        if 'NDVI' in request.indices:
            ndvi = daily_mosaic.normalizedDifference(['B8', 'B4']).rename('NDVI')
            images_to_stack.append(ndvi)
            valid_indices_today.append('NDVI')
        
        # 2. GNDVI (Green NDVI)
        if 'GNDVI' in request.indices:
            gndvi = daily_mosaic.normalizedDifference(['B8', 'B3']).rename('GNDVI')
            images_to_stack.append(gndvi)
            valid_indices_today.append('GNDVI')

        # 3. EVI (Enhanced Vegetation Index)
        if 'EVI' in request.indices:
            evi = daily_mosaic.expression(
                '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
                    'NIR': daily_mosaic.select('B8'),
                    'RED': daily_mosaic.select('B4'),
                    'BLUE': daily_mosaic.select('B2')
                }).rename('EVI')
            images_to_stack.append(evi)
            valid_indices_today.append('EVI')

        # 4. MSAVI2 (Modified Soil Adjusted)
        if 'MSAVI2' in request.indices:
            msavi = daily_mosaic.expression(
                '(2 * NIR + 1 - sqrt(pow((2 * NIR + 1), 2) - 8 * (NIR - RED))) / 2', {
                    'NIR': daily_mosaic.select('B8'),
                    'RED': daily_mosaic.select('B4')
                }).rename('MSAVI2')
            images_to_stack.append(msavi)
            valid_indices_today.append('MSAVI2')

        # 5. SAVI (Soil Adjusted)
        if 'SAVI' in request.indices:
            savi = daily_mosaic.expression(
                '((NIR - RED) / (NIR + RED + 0.5)) * 1.5', {
                    'NIR': daily_mosaic.select('B8'),
                    'RED': daily_mosaic.select('B4')
                }).rename('SAVI')
            images_to_stack.append(savi)
            valid_indices_today.append('SAVI')

        # 6. OSAVI (Optimized Soil Adjusted)
        if 'OSAVI' in request.indices:
            osavi = daily_mosaic.expression(
                '(NIR - RED) / (NIR + RED + 0.16)', {
                    'NIR': daily_mosaic.select('B8'),
                    'RED': daily_mosaic.select('B4')
                }).rename('OSAVI')
            images_to_stack.append(osavi)
            valid_indices_today.append('OSAVI')

        # 7. NDRE (Red Edge)
        if 'NDRE' in request.indices:
            ndre = daily_mosaic.normalizedDifference(['B8', 'B5']).rename('NDRE')
            images_to_stack.append(ndre)
            valid_indices_today.append('NDRE')

        # 8. REIP (Red Edge Inflection Point)
        if 'REIP' in request.indices:
            reip = daily_mosaic.expression(
                '700 + 40 * ((((RED + RE3) / 2) - RE1) / (RE2 - RE1))', {
                    'RED': daily_mosaic.select('B4'),
                    'RE1': daily_mosaic.select('B5'),
                    'RE2': daily_mosaic.select('B6'),
                    'RE3': daily_mosaic.select('B7')
                }).rename('REIP')
            images_to_stack.append(reip)
            valid_indices_today.append('REIP')

        # 9. NDWI
        if 'NDWI' in request.indices:
            ndwi = daily_mosaic.normalizedDifference(['B8', 'B11']).rename('NDWI')
            images_to_stack.append(ndwi)
            valid_indices_today.append('NDWI')

        if not images_to_stack:
            continue

        combined_image = ee.Image.cat(images_to_stack)

        try:
            stats = combined_image.reduceRegion(
                reducer=ee.Reducer.mean(),
                geometry=region,
                scale=10,
                maxPixels=1e9
            ).getInfo()
        except Exception:
            continue
        
        day_values = {}
        has_data = False
        for idx in valid_indices_today:
            val = stats.get(idx)
            if val is not None:
                rounded_val = round(val, 4)
                day_values[idx] = rounded_val
                all_values_flat[idx].append(rounded_val)
                has_data = True
        
        if has_data:
            timeseries_results.append({"date": date_str, "values": day_values})

    # Summary
    timeseries_results.sort(key=lambda x: x['date'])
    summary_stats = {}
    for idx in request.indices:
        vals = all_values_flat.get(idx, [])
        if vals:
            summary_stats[idx] = round(statistics.mean(vals), 4)
        else:
            summary_stats[idx] = None

    return {
        "metadata": {
            "field_id": request.field_id,
            "start_date": request.start_date,
            "end_date": request.end_date,
            "sensor": "Sentinel-2 L2A"
        },
        "period_summary": summary_stats,
        "timeseries": timeseries_results
    }


def save_results_to_db(db: Session, result_data: dict):
    field_id = result_data["metadata"]["field_id"]
    
    updated_count = 0
    new_count = 0

    for item in result_data["timeseries"]:
        measurement_date = item["date"]
        values = item["values"]

        # 1. Searching if the record exists
        existing = db.query(models.Measurement).filter(
            models.Measurement.field_id == field_id,
            models.Measurement.date == measurement_date
        ).first()

        if existing:
            # If the record exists, update values
            modified = False
            for idx_name, val in values.items():
                column_name = idx_name.lower()
                
                if getattr(existing, column_name) != val:
                    setattr(existing, column_name, val)
                    modified = True
            
            if modified:
                updated_count += 1
            continue

        # 2. Creating new record (if missing)
        db_record = models.Measurement(
            field_id=field_id,
            date=measurement_date,
            ndvi=values.get("NDVI"),
            gndvi=values.get("GNDVI"),
            evi=values.get("EVI"),
            msavi2=values.get("MSAVI2"),
            savi=values.get("SAVI"),
            osavi=values.get("OSAVI"),
            ndre=values.get("NDRE"),
            reip=values.get("REIP"),
            ndwi=values.get("NDWI")
        )
        db.add(db_record)
        new_count += 1
    
    db.commit()
    print(f"Baza danych: Dodano {new_count} nowych dni, zaktualizowano dane w {updated_count} dniach.")

def generate_tile_url(request: AnalysisRequest, index_name: str) -> dict:
    """
    Generuje URL do kafelków mapy (XYZ) dla wybranego indeksu i daty.
    Obsługuje pełne spektrum 9 indeksów + RGB.
    """
    region = ee.Geometry(request.geojson)
    
    # --- COLOUR PALETTE ---
    VEG_PALETTE = ['CE7E45', 'DF923D', 'F1B555', 'FCD163', '99B718', '74A901', '66A000', '529400', '3E8601', '207401']
    WATER_PALETTE = ['ffffff', '0000ff']
    SOIL_VEG_PALETTE = ['8c510a', 'd8b365', 'f6e8c3', 'c7eae5', '5ab4ac', '01665e']
    REIP_PALETTE = ['000000', '0000ff', '00ffff', '00ff00', 'ffff00', 'ff0000']

    # 1. Preparing imagery collection
    def mask_clouds(image):
        qa = image.select('QA60')
        mask = qa.bitwiseAnd(1 << 10).eq(0).And(qa.bitwiseAnd(1 << 11).eq(0))
        return image.updateMask(mask)

    s_date = ee.Date(request.start_date)
    e_date = ee.Date(request.end_date)
    if request.start_date == request.end_date:
        e_date = s_date.advance(1, 'day')

    collection = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                  .filterBounds(region)
                  .filterDate(s_date, e_date)
                  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', request.cloud_cover))
                  .map(mask_clouds))

    if collection.size().getInfo() == 0:
        raise Exception(f"Brak czystych zdjęć satelitarnych dla daty: {request.start_date}")

    # 2. Median image from selected period
    image = collection.median().clip(region)
    
    viz_image = None
    vis_params = {}

    # --- 3. Indexes visualization ---

    if index_name == "NDVI":
        viz_image = image.normalizedDifference(['B8', 'B4'])
        vis_params = {'min': 0, 'max': 1, 'palette': VEG_PALETTE}

    elif index_name == "GNDVI":
        viz_image = image.normalizedDifference(['B8', 'B3'])
        vis_params = {'min': 0, 'max': 1, 'palette': VEG_PALETTE}
        
    elif index_name == "EVI":
        viz_image = image.expression(
            '2.5 * ((NIR - RED) / (NIR + 6 * RED - 7.5 * BLUE + 1))', {
                'NIR': image.select('B8'), 'RED': image.select('B4'), 'BLUE': image.select('B2')
            })
        vis_params = {'min': 0, 'max': 1.2, 'palette': VEG_PALETTE}

    elif index_name == "MSAVI2":
        viz_image = image.expression(
            '(2 * NIR + 1 - sqrt(pow((2 * NIR + 1), 2) - 8 * (NIR - RED))) / 2', {
                'NIR': image.select('B8'), 'RED': image.select('B4')
            })
        vis_params = {'min': 0, 'max': 1, 'palette': SOIL_VEG_PALETTE}

    elif index_name == "SAVI":
        viz_image = image.expression(
            '((NIR - RED) / (NIR + RED + 0.5)) * 1.5', {
                'NIR': image.select('B8'), 'RED': image.select('B4')
            })
        vis_params = {'min': 0, 'max': 1.2, 'palette': SOIL_VEG_PALETTE}

    elif index_name == "OSAVI":
        viz_image = image.expression(
            '(NIR - RED) / (NIR + RED + 0.16)', {
                'NIR': image.select('B8'), 'RED': image.select('B4')
            })
        vis_params = {'min': 0, 'max': 1, 'palette': SOIL_VEG_PALETTE}

    elif index_name == "NDRE":
        viz_image = image.normalizedDifference(['B8', 'B5'])
        vis_params = {'min': 0, 'max': 0.8, 'palette': VEG_PALETTE}

    elif index_name == "REIP":
        viz_image = image.expression(
            '700 + 40 * ((((RED + RE3) / 2) - RE1) / (RE2 - RE1))', {
                'RED': image.select('B4'), 'RE1': image.select('B5'), 
                'RE2': image.select('B6'), 'RE3': image.select('B7')
            })
        vis_params = {'min': 700, 'max': 760, 'palette': REIP_PALETTE}

    elif index_name == "NDWI":
        viz_image = image.normalizedDifference(['B3', 'B8'])
        vis_params = {'min': -0.3, 'max': 0.3, 'palette': WATER_PALETTE}

    elif index_name == "RGB":
        viz_image = image.select(['B4', 'B3', 'B2'])
        vis_params = {'min': 0, 'max': 3000}

    # --- 4. URL ---
    if viz_image:
        map_id_dict = viz_image.getMapId(vis_params)
        return {
            "layer_url": map_id_dict['tile_fetcher'].url_format,
            "index_name": index_name
        }
    
    raise Exception(f"Nieobsługiwany indeks do wizualizacji: {index_name}")