from fastapi import FastAPI, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.security import OAuth2PasswordRequestForm
from contextlib import asynccontextmanager
from sqlalchemy.orm import Session
import os

import services
import schemas
import database
import models
import uldk
import auth
import admin_service

# 1. Creating tables in the database (SQLite)
models.Base.metadata.create_all(bind=database.engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    admin_service.ensure_default_admin()
    admin_service.ensure_users_from_owners()
    admin_service.ensure_default_crops()
    services.init_gee()
    yield


def _owner_filter(user: auth.UserRecord) -> str | None:
    """Return email to filter fields by for non-admin users, None for admins."""
    if user.role == "admin":
        return None
    return user.email or f"{user.username}@biomass.local"


def _assert_field_access(field_id: int, user: auth.UserRecord):
    """Raise 403 if a non-admin user does not own the field."""
    if user.role == "admin":
        return
    email = _owner_filter(user)
    if not admin_service.check_field_owner(field_id, email):
        raise HTTPException(
            status_code=403,
            detail="Brak dostępu do tego pola.",
        )

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
        services.save_results_to_db(db, result)
        return result
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

def _measurement_to_dict(r: models.Measurement) -> dict:
    """Serialize Measurement for API; add date from captured_at for backward compatibility."""
    from sqlalchemy.inspection import inspect as sa_inspect
    d = {c.key: getattr(r, c.key) for c in sa_inspect(r).mapper.column_attrs}
    for k, v in d.items():
        if hasattr(v, "isoformat") and v is not None:
            d[k] = v.isoformat()
    d["date"] = r.captured_at.date().isoformat() if r.captured_at else None
    return d


@app.get("/history/{field_id}")
async def get_history(field_id: str, db: Session = Depends(database.get_db)):
    records = db.query(models.Measurement).filter(models.Measurement.field_id == field_id).all()
    return [_measurement_to_dict(r) for r in records]

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

# ===========================================================================
# Auth endpoints
# ===========================================================================

@app.post("/auth/login", response_model=schemas.TokenResponse, tags=["auth"])
async def login(data: schemas.LoginRequest):
    user = auth.authenticate_user(data.username, data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    token = auth.create_access_token({"sub": user.username, "role": user.role})
    return schemas.TokenResponse(
        access_token=token, role=user.role,
        username=user.username, full_name=user.full_name,
    )


@app.post("/auth/token", tags=["auth"], include_in_schema=False)
async def login_form(form: OAuth2PasswordRequestForm = Depends()):
    """OAuth2 form endpoint for Swagger UI 'Authorize'."""
    user = auth.authenticate_user(form.username, form.password)
    if not user:
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    token = auth.create_access_token({"sub": user.username, "role": user.role})
    return {"access_token": token, "token_type": "bearer"}


@app.get("/auth/me", tags=["auth"])
async def me(current_user: auth.UserRecord = Depends(auth.get_current_user)):
    return {
        "id": current_user.id, "username": current_user.username,
        "full_name": current_user.full_name, "role": current_user.role,
    }


# ===========================================================================
# Admin – user management  (admin only)
# ===========================================================================

@app.get("/admin/users", tags=["admin"])
async def list_users(_: auth.UserRecord = Depends(auth.require_admin)):
    return [schemas.UserResponse(**u) for u in admin_service.list_users()]


@app.post("/admin/users", response_model=schemas.UserResponse, tags=["admin"])
async def create_user(
    data: schemas.UserCreate,
    _: auth.UserRecord = Depends(auth.require_admin),
):
    try:
        return schemas.UserResponse(**admin_service.create_user(data))
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.put("/admin/users/{user_id}", response_model=schemas.UserResponse, tags=["admin"])
async def update_user(
    user_id: int,
    data: schemas.UserUpdate,
    _: auth.UserRecord = Depends(auth.require_admin),
):
    user = admin_service.update_user(user_id, data)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return schemas.UserResponse(**user)


@app.delete("/admin/users/{user_id}", tags=["admin"])
async def deactivate_user(
    user_id: int,
    current_user: auth.UserRecord = Depends(auth.require_admin),
):
    if current_user.id == user_id:
        raise HTTPException(status_code=400, detail="Cannot deactivate your own account")
    if not admin_service.delete_user(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return {"ok": True}


# ===========================================================================
# Fields  (logged-in users)
# ===========================================================================

# NOTE: static-path routes MUST come before /{field_id} to avoid being
#       matched as an integer path parameter.

@app.get("/api/fields/browse", tags=["fields"])
async def browse_fields(current_user: auth.UserRecord = Depends(auth.get_current_user)):
    """Rich field listing with owner, crop, area and polygon GeoJSON.
    Admin sees all fields; regular users see only their own."""
    try:
        return admin_service.list_fields_full(owner_email=_owner_filter(current_user))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/fields", tags=["fields"])
async def get_fields(current_user: auth.UserRecord = Depends(auth.get_current_user)):
    try:
        return admin_service.list_fields_from_pg(owner_email=_owner_filter(current_user))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/fields/{field_id}", response_model=schemas.FieldDetailResponse, tags=["fields"])
async def get_field(
    field_id: int,
    current_user: auth.UserRecord = Depends(auth.get_current_user),
):
    _assert_field_access(field_id, current_user)
    detail = admin_service.get_field_detail(field_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Field not found")
    return detail


@app.put("/api/fields/{field_id}", tags=["fields"])
async def update_field(
    field_id: int,
    data: schemas.FieldUpdateRequest,
    current_user: auth.UserRecord = Depends(auth.get_current_user),
):
    _assert_field_access(field_id, current_user)
    try:
        result = admin_service.update_field_in_pg(
            field_id=field_id,
            name=data.name,
            crop_name=data.crop_name,
            sowing_date=data.sowing_date,
            harvest_date=data.harvest_date,
            notes=data.notes,
            geojson_geometry=data.geojson,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/crops", tags=["fields"])
async def get_crops(_: auth.UserRecord = Depends(auth.get_current_user)):
    """List all crops from agro.crops (for dropdown in field editor)."""
    try:
        return admin_service.list_crops_from_pg()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/owners", tags=["fields"])
async def get_owners(_: auth.UserRecord = Depends(auth.get_current_user)):
    """List all owners with field count."""
    try:
        return admin_service.list_owners_from_pg()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/fields", response_model=schemas.FieldResponse, tags=["fields"])
async def create_field(
    data: schemas.FieldCreateRequest,
    current_user: auth.UserRecord = Depends(auth.get_current_user),
):
    # Owner email: use user's email; fall back to username@biomass.local
    owner_email = current_user.email or f"{current_user.username}@biomass.local"
    owner_name = current_user.full_name or current_user.username
    try:
        result = admin_service.save_field_to_pg(
            name=data.name,
            geojson_geometry=data.geojson,
            owner_email=owner_email,
            owner_name=owner_name,
            owner_valid_from=data.owner_valid_from,
            crop_name=data.crop_name,
            sowing_date=data.sowing_date,
            notes=data.notes,
        )
        return schemas.FieldResponse(
            field_id=result["field_id"],
            name=data.name,
            lat=result["lat"],
            lng=result["lng"],
            area_m2=result["area_m2"],
            crop_id=result["crop_id"],
            field_crop_id=result["field_crop_id"],
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ===========================================================================
# Static files & page routes
# ===========================================================================

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def read_index():
    index_path = os.path.join("static", "index.html")
    if not os.path.exists(index_path):
        return {"error": "Plik index.html nie został znaleziony w folderze static"}
    return FileResponse(index_path)


@app.get("/login")
async def login_page():
    return FileResponse(os.path.join("static", "login.html"))


@app.get("/admin")
async def admin_page():
    return FileResponse(os.path.join("static", "admin.html"))


@app.get("/field-editor")
async def field_editor_page():
    return FileResponse(os.path.join("static", "field_editor.html"))


@app.get("/fields")
async def fields_page():
    return FileResponse(os.path.join("static", "fields.html"))