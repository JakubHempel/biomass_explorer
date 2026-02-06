from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

# Create SQLite database file
SQLALCHEMY_DATABASE_URL = "sqlite:///./biomass_results.db"

engine = create_engine(
    SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False}
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

# Get session
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()