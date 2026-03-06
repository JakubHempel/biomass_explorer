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


def get_pg_conn():
    with open(_DB_CONFIG_PATH, "r", encoding="utf-8") as f:
        cfg = json.load(f)
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