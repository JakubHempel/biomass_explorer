from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware  # <--- WAŻNE!
from contextlib import asynccontextmanager
from sqlalchemy.orm import Session

import services
import schemas
import database
import models

# 1. Creating table in the database
models.Base.metadata.create_all(bind=database.engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    services.init_gee()
    yield

app = FastAPI(title="Biomass Database Service", lifespan=lifespan)

# --- CORS configuration (for the map_viewer) ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/calculate/biomass", response_model=schemas.BiomassResponse)
async def calculate_biomass_endpoint(
    request: schemas.AnalysisRequest, 
    db: Session = Depends(database.get_db)
):
    try:
        result = services.calculate_biomass_logic(request)
        services.save_results_to_db(db, result)
        
        return result
        
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/history/{field_id}")
async def get_history(field_id: str, db: Session = Depends(database.get_db)):
    records = db.query(models.Measurement).filter(models.Measurement.field_id == field_id).all()
    return records

@app.post("/visualize/map", response_model=schemas.MapResponse)
async def get_map_layer(request: schemas.AnalysisRequest):
    try:
        target_index = request.indices[0] if request.indices else "NDVI"
        
        result = services.generate_tile_url(request, index_name=target_index)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))