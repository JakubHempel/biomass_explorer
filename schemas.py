from pydantic import BaseModel
from typing import List, Dict, Optional

class AnalysisRequest(BaseModel):
    field_id: str
    geojson: dict
    start_date: str
    end_date: str
    indices: List[str] = ["NDVI", "GNDVI", "EVI", "MSAVI2", "SAVI", "OSAVI", "NDRE", "REIP", "NDWI"]
    cloud_cover: int = 20

class TimeseriesPoint(BaseModel):
    date: str
    values: Dict[str, float]

class BiomassResponse(BaseModel):
    metadata: Dict[str, str]
    period_summary: Dict[str, Optional[float]]
    timeseries: List[TimeseriesPoint]

class MapResponse(BaseModel):
    layer_url: str
    index_name: str