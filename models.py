from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, UniqueConstraint
from sqlalchemy.sql import func
from database import Base


class Measurement(Base):
    """Local SQLite table compatible with obs.vegetation_indices for export to PostgreSQL."""
    __tablename__ = "measurements"

    id = Column(Integer, primary_key=True, index=True)
    field_id = Column(String, index=True)  # store as string; cast to BIGINT when loading to PG
    captured_at = Column(DateTime(timezone=True), nullable=False, index=True)  # maps to TIMESTAMPTZ
    sensor = Column(String, index=True)  # "Sentinel-2" or "Landsat 8/9" (kept for API compatibility)
    source = Column(String, index=True)  # same as sensor; maps to obs.vegetation_indices.source

    # --- Classic indices (match obs.vegetation_indices) ---
    ndvi = Column(Float, nullable=True)
    gndvi = Column(Float, nullable=True)
    evi = Column(Float, nullable=True)
    msavi2 = Column(Float, nullable=True)
    savi = Column(Float, nullable=True)
    osavi = Column(Float, nullable=True)
    ndre = Column(Float, nullable=True)
    reip = Column(Float, nullable=True)
    ndwi = Column(Float, nullable=True)

    # --- Optional (obs.vegetation_indices) ---
    lai = Column(Float, nullable=True)
    canopy_cover = Column(Float, nullable=True)
    biomass_est = Column(Float, nullable=True)
    source_image_id = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), nullable=False, default=func.now())

    # --- Extra Sentinel-2 indices (not in obs.vegetation_indices; kept for local use) ---
    cire = Column(Float, nullable=True)
    mtci = Column(Float, nullable=True)
    ireci = Column(Float, nullable=True)
    ndmi = Column(Float, nullable=True)
    nmdi = Column(Float, nullable=True)

    # --- Landsat 8/9 thermal & drought (not in obs.vegetation_indices; kept for local use) ---
    lst = Column(Float, nullable=True)
    vswi = Column(Float, nullable=True)
    tvdi = Column(Float, nullable=True)
    tci = Column(Float, nullable=True)
    vhi = Column(Float, nullable=True)

    __table_args__ = (UniqueConstraint('field_id', 'captured_at', 'source', name='_field_captured_source_uc'),)


# User authentication has been moved to PostgreSQL (users.accounts).
# See auth.UserRecord dataclass and admin_service user CRUD functions.