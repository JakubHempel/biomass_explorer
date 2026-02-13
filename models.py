from sqlalchemy import Column, Integer, String, Float, UniqueConstraint
from database import Base

class Measurement(Base):
    __tablename__ = "measurements"

    id = Column(Integer, primary_key=True, index=True)
    field_id = Column(String, index=True)
    date = Column(String, index=True)
    sensor = Column(String, index=True)          # "Sentinel-2" or "Landsat 8/9"
    
    # --- Sentinel-2 spectral indices (10) ---
    ndvi = Column(Float, nullable=True)
    ndre = Column(Float, nullable=True)
    gndvi = Column(Float, nullable=True)
    evi = Column(Float, nullable=True)
    savi = Column(Float, nullable=True)
    cire = Column(Float, nullable=True)
    mtci = Column(Float, nullable=True)
    ireci = Column(Float, nullable=True)
    ndmi = Column(Float, nullable=True)
    nmdi = Column(Float, nullable=True)

    # --- Landsat 8/9 thermal & drought indices (5) ---
    lst = Column(Float, nullable=True)
    vswi = Column(Float, nullable=True)
    tvdi = Column(Float, nullable=True)
    tci = Column(Float, nullable=True)
    vhi = Column(Float, nullable=True)
    
    __table_args__ = (UniqueConstraint('field_id', 'date', 'sensor', name='_field_date_sensor_uc'),)