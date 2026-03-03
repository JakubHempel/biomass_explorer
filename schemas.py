from pydantic import BaseModel
from typing import List, Dict, Optional, Any


# ---------------------------------------------------------------------------
# Auth
# ---------------------------------------------------------------------------

class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    username: str
    full_name: Optional[str] = None


# ---------------------------------------------------------------------------
# User management
# ---------------------------------------------------------------------------

class UserCreate(BaseModel):
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    password: str
    role: str = "user"


class UserUpdate(BaseModel):
    email: Optional[str] = None
    full_name: Optional[str] = None
    password: Optional[str] = None
    role: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponse(BaseModel):
    id: int
    username: str
    email: Optional[str] = None
    full_name: Optional[str] = None
    role: str
    is_active: bool
    created_at: Optional[str] = None


# ---------------------------------------------------------------------------
# Field editor
# ---------------------------------------------------------------------------

class FieldCreateRequest(BaseModel):
    name: str
    geojson: Dict[str, Any]         # GeoJSON Polygon geometry
    owner_valid_from: str           # ISO date "YYYY-MM-DD" — owner since
    crop_name: str
    sowing_date: str                # ISO date "YYYY-MM-DD"
    notes: Optional[str] = None


class FieldUpdateRequest(BaseModel):
    name: str
    crop_name: str
    sowing_date: str                # ISO date "YYYY-MM-DD"
    harvest_date: Optional[str] = None
    notes: Optional[str] = None
    geojson: Optional[Dict[str, Any]] = None   # only if polygon was redrawn


class FieldResponse(BaseModel):
    field_id: int
    name: str
    lat: float
    lng: float
    area_m2: float
    crop_id: int
    field_crop_id: int


class FieldDetailResponse(BaseModel):
    field_id: int
    name: str
    owner_valid_from: Optional[str] = None
    owner_email: Optional[str] = None
    owner_name: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    area_m2: Optional[float] = None
    crop_name: Optional[str] = None
    sowing_date: Optional[str] = None
    harvest_date: Optional[str] = None
    field_crop_id: Optional[int] = None
    geojson: Optional[Dict[str, Any]] = None
    created_at: Optional[str] = None

class AnalysisRequest(BaseModel):
    field_id: str
    geojson: dict
    start_date: str
    end_date: str
    indices: List[str] = ["NDVI", "NDRE", "GNDVI", "EVI", "SAVI", "CIre", "MTCI", "IRECI", "NDMI", "NMDI",
                          "LST", "VSWI", "TVDI", "TCI", "VHI"]
    cloud_cover: int = 20
    sensor: Optional[str] = None   # "Sentinel-2" or "Landsat 8/9" (used for RGB routing)

class TimeseriesPoint(BaseModel):
    date: str
    sensor: str = ""
    values: Dict[str, float]

class IndexStats(BaseModel):
    """Rich statistics for a single index across the analysis period."""
    mean: Optional[float] = None
    min: Optional[float] = None
    max: Optional[float] = None
    std_dev: Optional[float] = None
    median: Optional[float] = None
    p10: Optional[float] = None
    p90: Optional[float] = None
    count: int = 0

class FieldConditionDriver(BaseModel):
    index: str
    damaged_pct: float
    score_0_10: float
    note: str

class FieldConditionResponse(BaseModel):
    score_0_10: float
    label: str
    confidence: str
    confidence_score: float
    base_score_0_10: float
    damage_penalty: float
    variability_penalty: float
    damaged_area_pct: float
    drivers: List[FieldConditionDriver] = []
    index_breakdown: Dict[str, Dict[str, float]] = {}

class BiomassResponse(BaseModel):
    metadata: Dict[str, str]
    period_summary: Dict[str, Optional[float]]
    period_stats: Dict[str, IndexStats] = {}   # richer statistics per index
    field_condition: Optional[FieldConditionResponse] = None
    timeseries: List[TimeseriesPoint]

class MapResponse(BaseModel):
    layer_url: str
    index_name: str
    native_scale: Optional[int] = None


class BatchLayerRequest(BaseModel):
    """Request tile URLs for multiple indices on a single date."""
    date: str
    sensor: str                    # "Sentinel-2" or "Landsat 8/9"
    indices: List[str]             # e.g. ["NDVI", "EVI", "RGB"]
    geojson: dict
    cloud_cover: int = 20


class BatchLayerItem(BaseModel):
    layer_url: str
    index_name: str
    native_scale: Optional[int] = None


class BatchLayerResponse(BaseModel):
    date: str
    sensor: str
    layers: List[BatchLayerItem]
    elapsed_ms: int


class PixelQueryRequest(BaseModel):
    lat: float
    lng: float
    date: str
    sensor: str
    indices: List[str]
    geojson: dict
    cloud_cover: int = 20
    start_date: Optional[str] = None
    end_date: Optional[str] = None


class PixelQueryResponse(BaseModel):
    lat: float
    lng: float
    date: str
    values: Dict[str, Optional[float]]