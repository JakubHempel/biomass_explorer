from pydantic import BaseModel
from typing import List, Dict, Optional

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