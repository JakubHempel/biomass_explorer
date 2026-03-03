from sqlalchemy import Column, Integer, BigInteger, String, Float, Date, DateTime, UniqueConstraint, func, text
import database
from database import Base


class Measurement(Base):
    __tablename__ = "vegetation_indices"

    id = Column(Integer, primary_key=True, index=True)
    field_id = Column(BigInteger, index=True)
    captured_at = Column(Date, index=True, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=True)
    sensor = Column(String, index=True)          # "Sentinel-2" or "Landsat 8/9"
    source = Column(String, nullable=True)
    source_image_id = Column(String, nullable=True, default="1", server_default=text("'1'"))

    # --- Spectral indices ---
    ndvi = Column(Float, nullable=True)
    gndvi = Column(Float, nullable=True)
    evi = Column(Float, nullable=True)
    msavi2 = Column(Float, nullable=True)
    savi = Column(Float, nullable=True)
    osavi = Column(Float, nullable=True)
    ndre = Column(Float, nullable=True)
    reip = Column(Float, nullable=True)
    ndwi = Column(Float, nullable=True)
    lai = Column(Float, nullable=True)
    canopy_cover = Column(Float, nullable=True, default=1.0, server_default=text("1"))
    biomass_est = Column(Float, nullable=True, default=1.0, server_default=text("1"))
    cire = Column(Float, nullable=True)
    mtci = Column(Float, nullable=True)
    ireci = Column(Float, nullable=True)
    ndmi = Column(Float, nullable=True)
    nmdi = Column(Float, nullable=True)

    # --- Landsat 8/9 thermal & drought ---
    lst = Column(Float, nullable=True)
    vswi = Column(Float, nullable=True)
    tvdi = Column(Float, nullable=True)
    tci = Column(Float, nullable=True)
    vhi = Column(Float, nullable=True)

    _schema = database._active_schema()
    __table_args__ = (
        UniqueConstraint('field_id', 'captured_at', 'sensor', name='_field_captured_sensor_uc'),
        {"schema": _schema} if _schema else {},
    )


# User authentication has been moved to PostgreSQL (users.accounts).
# See auth.UserRecord dataclass and admin_service user CRUD functions.
