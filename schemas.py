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

class BiomassResponse(BaseModel):
    metadata: Dict[str, str]
    period_summary: Dict[str, Optional[float]]
    period_stats: Dict[str, IndexStats] = {}   # richer statistics per index
    timeseries: List[TimeseriesPoint]

class MapResponse(BaseModel):
    layer_url: str
    index_name: str


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


class PixelQueryResponse(BaseModel):
    lat: float
    lng: float
    date: str
    values: Dict[str, Optional[float]]