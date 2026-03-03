import os
import re
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit
from dotenv import load_dotenv
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker

load_dotenv()

_ENABLE_DB_RAW = os.getenv("ENABLE_DB", "1").strip().lower()
DATABASE_ENABLED = _ENABLE_DB_RAW not in {"0", "false", "no", "off"}

# Default local SQLite DB (can be overridden by DATABASE_URL later, e.g. Azure Postgres)
SQLALCHEMY_DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./biomass_results.db")
DB_TABLE_NAME = os.getenv("DB_TABLE_NAME", "vegetation_indices")
DB_SCHEMA = os.getenv("DB_SCHEMA", "obs").strip()


def _validated_table_name() -> str:
    """Return a SQL-safe table identifier from env config."""
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", DB_TABLE_NAME or ""):
        raise ValueError(f"Invalid DB_TABLE_NAME: {DB_TABLE_NAME!r}")
    return DB_TABLE_NAME


def _validated_schema_name() -> str | None:
    """Return a SQL-safe schema identifier from env config."""
    if not DB_SCHEMA:
        return None
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", DB_SCHEMA):
        raise ValueError(f"Invalid DB_SCHEMA: {DB_SCHEMA!r}")
    return DB_SCHEMA


def _active_schema() -> str | None:
    """Use schema for remote DBs; skip schema for SQLite."""
    if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
        return None
    return _validated_schema_name()


def _qualified_table_name() -> str:
    schema = _active_schema()
    table = _validated_table_name()
    return f"{schema}.{table}" if schema else table


def _ensure_postgres_sslmode(db_url: str) -> str:
    """Force TLS for Postgres if caller forgot sslmode in DATABASE_URL."""
    if not db_url.startswith("postgresql"):
        return db_url

    parts = urlsplit(db_url)
    query = dict(parse_qsl(parts.query, keep_blank_values=True))
    if "sslmode" not in query:
        query["sslmode"] = "require"
        db_url = urlunsplit(
            (parts.scheme, parts.netloc, parts.path, urlencode(query, doseq=True), parts.fragment)
        )
    return db_url


engine = None
SessionLocal = None
if DATABASE_ENABLED:
    SQLALCHEMY_DATABASE_URL = _ensure_postgres_sslmode(SQLALCHEMY_DATABASE_URL)
    engine_kwargs = {}
    if SQLALCHEMY_DATABASE_URL.startswith("sqlite"):
        engine_kwargs["connect_args"] = {"check_same_thread": False}
    else:
        # Keep pooled connections healthy for managed cloud databases.
        engine_kwargs["pool_pre_ping"] = True
        engine_kwargs["pool_recycle"] = 1800
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


def check_db_connection() -> None:
    """Raises when DB connection is not healthy or cannot be established."""
    if not DATABASE_ENABLED or engine is None:
        return
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))


def ensure_measurements_schema() -> None:
    """Add missing optional columns for backward-compatible upgrades."""
    if not DATABASE_ENABLED or engine is None:
        return

    table_name = _validated_table_name()
    table_ref = _qualified_table_name()
    schema_name = _active_schema()
    inspector = inspect(engine)
    if not inspector.has_table(table_name, schema=schema_name):
        return

    existing_columns = {col["name"] for col in inspector.get_columns(table_name, schema=schema_name)}
    desired_columns = {
        "captured_at": "DATE",
        "canopy_cover": "FLOAT",
        "biomass_est": "FLOAT",
        "source_image_id": "VARCHAR",
        "source": "VARCHAR",
        "created_at": "TIMESTAMP",
    }

    with engine.begin() as connection:
        for column_name, column_type in desired_columns.items():
            if column_name in existing_columns:
                continue
            connection.execute(
                text(f"ALTER TABLE {table_ref} ADD COLUMN {column_name} {column_type}")
            )

        all_columns = existing_columns.union(desired_columns.keys())
        # Backfill for compatibility with earlier rows.
        if "captured_at" in all_columns and "date" in all_columns:
            connection.execute(
                text(f"UPDATE {table_ref} SET captured_at = date WHERE captured_at IS NULL")
            )
        if "canopy_cover" in all_columns:
            connection.execute(
                text(f"UPDATE {table_ref} SET canopy_cover = 1 WHERE canopy_cover IS NULL")
            )
        if "biomass_est" in all_columns:
            connection.execute(
                text(f"UPDATE {table_ref} SET biomass_est = 1 WHERE biomass_est IS NULL")
            )
        if "source_image_id" in all_columns:
            connection.execute(
                text(
                    f"UPDATE {table_ref} SET source_image_id = '1' "
                    "WHERE source_image_id IS NULL OR source_image_id = ''"
                )
            )


def migrate_measurements_drop_legacy_date() -> None:
    """Drop legacy `date` column after migrating values into `captured_at`."""
    if not DATABASE_ENABLED or engine is None:
        return

    table_name = _validated_table_name()
    table_ref = _qualified_table_name()
    schema_name = _active_schema()
    inspector = inspect(engine)
    if not inspector.has_table(table_name, schema=schema_name):
        return

    columns = inspector.get_columns(table_name, schema=schema_name)
    column_names = [c["name"] for c in columns]
    if "date" not in column_names:
        return

    with engine.begin() as connection:
        if "captured_at" not in column_names:
            connection.execute(text(f"ALTER TABLE {table_ref} ADD COLUMN captured_at DATE"))
        connection.execute(text(f"UPDATE {table_ref} SET captured_at = date WHERE captured_at IS NULL"))

        dialect = engine.dialect.name
        if dialect == "postgresql":
            index_name = f"uq_{table_name}_field_captured_sensor"
            qualified_index = f"{schema_name}.{index_name}" if schema_name else index_name
            connection.execute(text(f"DROP INDEX IF EXISTS {index_name}"))
            connection.execute(
                text(f"DROP INDEX IF EXISTS {qualified_index}")
            )
            connection.execute(
                text(
                    f"ALTER TABLE {table_ref} DROP CONSTRAINT IF EXISTS _field_date_sensor_uc"
                )
            )
            connection.execute(
                text(
                    f"CREATE UNIQUE INDEX IF NOT EXISTS {index_name} "
                    f"ON {table_ref}(field_id, captured_at, sensor)"
                )
            )
            connection.execute(text(f"ALTER TABLE {table_ref} DROP COLUMN IF EXISTS date"))
            return

        if dialect == "sqlite":
            pragma_rows = connection.execute(text(f"PRAGMA table_info({table_name})")).fetchall()
            keep_rows = [row for row in pragma_rows if row[1] != "date"]
            keep_cols = [row[1] for row in keep_rows]

            def _col_def(row):
                name = row[1]
                col_type = row[2] or "TEXT"
                not_null = bool(row[3])
                default = row[4]
                pk = bool(row[5])

                if pk and col_type.upper() == "INTEGER":
                    return f"{name} INTEGER PRIMARY KEY"

                parts = [name, col_type]
                if not_null:
                    parts.append("NOT NULL")
                if default is not None:
                    parts.append(f"DEFAULT {default}")
                if pk:
                    parts.append("PRIMARY KEY")
                return " ".join(parts)

            col_defs = ", ".join(_col_def(row) for row in keep_rows)
            keep_cols_csv = ", ".join(keep_cols)
            temp_table = f"{table_name}__new"

            connection.execute(
                text(
                    f"CREATE TABLE {temp_table} ("
                    f"{col_defs}, "
                    "UNIQUE(field_id, captured_at, sensor)"
                    ")"
                )
            )
            connection.execute(
                text(
                    f"INSERT INTO {temp_table} "
                    f"({keep_cols_csv}) "
                    f"SELECT {keep_cols_csv} FROM {table_name}"
                )
            )
            connection.execute(text(f"DROP TABLE {table_name}"))
            connection.execute(text(f"ALTER TABLE {temp_table} RENAME TO {table_name}"))