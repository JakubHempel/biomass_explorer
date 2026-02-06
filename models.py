from sqlalchemy import Column, Integer, String, Float, UniqueConstraint
from database import Base

class Measurement(Base):
    __tablename__ = "measurements"

    id = Column(Integer, primary_key=True, index=True)
    field_id = Column(String, index=True)
    date = Column(String, index=True)
    
    # --- Pełna lista indeksów (9 sztuk) ---
    ndvi = Column(Float, nullable=True)
    gndvi = Column(Float, nullable=True)
    evi = Column(Float, nullable=True)
    
    msavi2 = Column(Float, nullable=True)
    savi = Column(Float, nullable=True)
    osavi = Column(Float, nullable=True)
    
    ndre = Column(Float, nullable=True)
    reip = Column(Float, nullable=True)
    
    ndwi = Column(Float, nullable=True)
    
    __table_args__ = (UniqueConstraint('field_id', 'date', name='_field_date_uc'),)