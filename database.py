import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

_ENABLE_DB_RAW = os.getenv("ENABLE_DB", "1").strip().lower()
DATABASE_ENABLED = _ENABLE_DB_RAW not in {"0", "false", "no", "off"}

# Default local SQLite DB (can be overridden by DATABASE_URL later, e.g. Azure Postgres)
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./biomass_results.db")

engine = None
SessionLocal = None
if DATABASE_ENABLED:
    engine_kwargs = {}
    if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
        engine_kwargs["connect_args"] = {"check_same_thread": False}
    engine = create_engine(SQLALCHEMY_DATABASE_URL, **engine_kwargs)
    SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()


def get_db():
    """Yield DB session; yield None when DB is disabled."""
    if not DATABASE_ENABLED or SessionLocal is None:
        yield None
        return

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()