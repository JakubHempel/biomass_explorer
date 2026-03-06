import json
import os
from contextlib import contextmanager

import psycopg2
from dotenv import load_dotenv

load_dotenv()

_ENABLE_DB_RAW = os.getenv("ENABLE_DB", "1").strip().lower()
DATABASE_ENABLED = _ENABLE_DB_RAW not in {"0", "false", "no", "off"}

# Runtime measurements target is intentionally hardcoded for consistency.
DB_SCHEMA = "obs"
DB_TABLE_NAME = "vegetation_indices"
MEASUREMENTS_TABLE = f"{DB_SCHEMA}.{DB_TABLE_NAME}"
USERS_ACCOUNTS_TABLE = "users.accounts"

_DB_CONFIG_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "db_config.json")


def _env_db_config():
    """Return DB config from environment variables or None if not configured."""
    raw = {
        "host": (os.getenv("DB_HOST") or "").strip(),
        "port": (os.getenv("DB_PORT") or "").strip(),
        "database": (os.getenv("DB_NAME") or "").strip(),
        "user": (os.getenv("DB_USER") or "").strip(),
        "password": os.getenv("DB_PASSWORD"),
        "sslmode": (os.getenv("DB_SSLMODE") or "").strip(),
    }

    has_any = any(v for k, v in raw.items() if k != "sslmode")
    if not has_any:
        return None

    missing = [k for k in ("host", "port", "database", "user", "password") if not raw[k]]
    if missing:
        raise RuntimeError(
            "Incomplete DB environment configuration. Missing: "
            + ", ".join(f"DB_{m.upper() if m != 'database' else 'NAME'}" for m in missing)
        )

    try:
        port = int(raw["port"])
    except ValueError as exc:
        raise RuntimeError("DB_PORT must be an integer.") from exc

    return {
        "host": raw["host"],
        "port": port,
        "database": raw["database"],
        "user": raw["user"],
        "password": raw["password"],
        # For cloud Postgres (for example Azure) require SSL by default in env mode.
        "sslmode": raw["sslmode"] or "require",
    }


def _file_db_config():
    with open(_DB_CONFIG_PATH, "r", encoding="utf-8") as f:
        cfg = json.load(f)
    cfg["port"] = int(cfg["port"])
    return cfg


def _resolve_db_config():
    env_cfg = _env_db_config()
    if env_cfg is not None:
        return env_cfg
    if not os.path.exists(_DB_CONFIG_PATH):
        raise RuntimeError(
            "Database config missing. Set DB_* environment variables or provide db_config.json."
        )
    return _file_db_config()


def get_pg_conn():
    cfg = _resolve_db_config()
    return psycopg2.connect(
        host=cfg["host"],
        port=cfg["port"],
        database=cfg["database"],
        user=cfg["user"],
        password=cfg["password"],
        sslmode=cfg.get("sslmode", "prefer"),
    )


@contextmanager
def pg_cursor(write: bool = False):
    """Yield a PostgreSQL cursor using the unified app connection settings."""
    conn = get_pg_conn()
    try:
        if write:
            with conn:
                with conn.cursor() as cur:
                    yield cur
            return
        with conn.cursor() as cur:
            yield cur
    finally:
        conn.close()


def check_db_connection() -> None:
    if not DATABASE_ENABLED:
        return
    with pg_cursor() as cur:
        cur.execute("SELECT 1")
        cur.fetchone()