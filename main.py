from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.encoders import jsonable_encoder
from contextlib import asynccontextmanager
from sqlalchemy.orm import Session
import os
import logging

import services
import schemas
import database
import models
import uldk

log = logging.getLogger(__name__)

# 1. Creating table in the database (optional in serverless mode)
if database.DATABASE_ENABLED and database.engine is not None:
    models.Base.metadata.create_all(bind=database.engine)
    database.ensure_measurements_schema()
    database.migrate_measurements_drop_legacy_date()

@asynccontextmanager
async def lifespan(app: FastAPI):
    services.init_gee()
    if database.DATABASE_ENABLED:
        database.check_db_connection()
        db_kind = "sqlite" if database.SQLALCHEMY_DATABASE_URL.startswith("sqlite") else "remote"
        log.info(
            "Database connectivity check passed. backend=%s schema=%s table=%s",
            db_kind,
            database._active_schema() or "(default)",
            database.DB_TABLE_NAME,
        )
        print(
            "DB startup | "
            f"backend={db_kind} | "
            f"schema={database._active_schema() or '(default)'} | "
            f"table={database.DB_TABLE_NAME}"
        )
    else:
        log.warning("Database persistence is disabled (ENABLE_DB=0).")
    yield

app = FastAPI(title="Biomass Database Service", lifespan=lifespan)

# --- CORS configuration ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/favicon.ico", include_in_schema=False)
async def favicon():
    return FileResponse("static/favicon.png", media_type="image/png")

# --- API Endpoints ---

@app.post("/calculate/biomass", response_model=schemas.BiomassResponse)
async def calculate_biomass_endpoint(
    request: schemas.AnalysisRequest, 
    db: Session = Depends(database.get_db)
):
    try:
        result = services.calculate_biomass_logic(request)
        if db is not None:
            services.save_results_to_db(db, result)
        return result
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/history/{field_id}")
async def get_history(field_id: str, db: Session = Depends(database.get_db)):
    if db is None:
        return []
    try:
        field_id_num = int(field_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="field_id must be numeric.")
    records = db.query(models.Measurement).filter(models.Measurement.field_id == field_id_num).all()
    payload = []
    for record in records:
        item = {k: v for k, v in record.__dict__.items() if not k.startswith("_")}
        # Keep frontend compatibility after replacing legacy `date` column with `captured_at`.
        item["date"] = record.captured_at
        payload.append(item)
    return jsonable_encoder(payload)

@app.post("/visualize/map", response_model=schemas.MapResponse)
async def get_map_layer(request: schemas.AnalysisRequest):
    try:
        target_index = request.indices[0] if request.indices else "NDVI"
        result = services.generate_tile_url(request, index_name=target_index)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/visualize/batch", response_model=schemas.BatchLayerResponse)
async def get_batch_layers(request: schemas.BatchLayerRequest):
    """Generate tile URLs for ALL indices on a single date in one call.

    The collection is filtered / mosaicked ONCE and getMapId calls are
    parallelised with a thread pool, making this dramatically faster than
    calling /visualize/map N times.
    """
    try:
        result = services.generate_tile_urls_batch(
            date=request.date,
            sensor=request.sensor,
            indices=request.indices,
            geojson=request.geojson,
            cloud_cover=request.cloud_cover,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- Pixel Inspector ---

@app.post("/api/pixel-value", response_model=schemas.PixelQueryResponse)
async def pixel_value(request: schemas.PixelQueryRequest):
    """Sample index values at a single lat/lng for a given date/sensor."""
    try:
        result = services.query_pixel_value(
            lat=request.lat,
            lng=request.lng,
            date=request.date,
            sensor=request.sensor,
            indices=request.indices,
            geojson=request.geojson,
            cloud_cover=request.cloud_cover,
            start_date=request.start_date,
            end_date=request.end_date,
        )
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# --- ULDK Parcel Lookup ---

@app.get("/api/uldk/search")
async def uldk_search(q: str = Query(..., description="Parcel ID or region name + number")):
    """Proxy search to ULDK GetParcelByIdOrNr."""
    try:
        result = uldk.search_parcel(q)
        if result["count"] == 0:
            raise HTTPException(status_code=404, detail="No parcel found for the given query.")
        return result
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"ULDK service error: {e}")

@app.get("/api/uldk/locate")
async def uldk_locate(lat: float = Query(...), lng: float = Query(...)):
    """Proxy coordinate lookup to ULDK GetParcelByXY."""
    try:
        print(f"[ULDK locate] lat={lat}, lng={lng}")
        result = uldk.locate_parcel(lat, lng)
        if result["count"] == 0:
            raise HTTPException(status_code=404, detail="No parcel found at the given location.")
        return result
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ULDK locate] Error: {e}")
        raise HTTPException(status_code=502, detail=f"ULDK service error: {e}")

# --- Static Files & Frontend Route ---

app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def read_index():
    index_path = os.path.join("static", "index.html")
    if not os.path.exists(index_path):
        return {"error": "Plik index.html nie został znaleziony w folderze static"}
    return FileResponse(index_path)