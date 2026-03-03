"""
Export measurements from biomass_results.db (SQLite) to obs.vegetation_indices (PostgreSQL).

Compatibility: table structure matches obs.vegetation_indices. Run after configuring
PG connection (e.g. DATABASE_URL env or conn params below).

Usage:
  python export_to_pg.py [--dry-run]

Requires: psycopg2-binary (or psycopg2), sqlalchemy. Add to requirements.txt if needed.
"""

import argparse
import os
import sqlite3
import sys

# Optional: use psycopg2 for direct insert; if not installed, script can print SQL only
try:
    import psycopg2
    from psycopg2.extras import execute_values
    HAS_PSYCOPG2 = True
except ImportError:
    HAS_PSYCOPG2 = False


def get_pg_conn():
    url = os.getenv("DATABASE_URL")
    if url and url.startswith("postgresql://"):
        return psycopg2.connect(url)
    return psycopg2.connect(
        host=os.getenv("PGHOST", "localhost"),
        port=os.getenv("PGPORT", "5432"),
        dbname=os.getenv("PGDATABASE", "postgres"),
        user=os.getenv("PGUSER", "postgres"),
        password=os.getenv("PGPASSWORD", ""),
    )


def export_sqlite_to_pg(dry_run: bool = False):
    db_path = os.path.join(os.path.dirname(__file__), "biomass_results.db")
    if not os.path.exists(db_path):
        print("biomass_results.db not found.", file=sys.stderr)
        sys.exit(1)

    conn_sqlite = sqlite3.connect(db_path)
    conn_sqlite.row_factory = sqlite3.Row
    cur = conn_sqlite.execute(
        "SELECT id, field_id, captured_at, sensor, source, ndvi, gndvi, evi, msavi2, savi, osavi, ndre, reip, ndwi, lai, canopy_cover, biomass_est, source_image_id, created_at FROM measurements ORDER BY id"
    )
    rows = cur.fetchall()
    conn_sqlite.close()

    if not rows:
        print("No rows in measurements.")
        return

    # Map to obs.vegetation_indices columns (field_id -> BIGINT)
    def row_to_tuple(r):
        try:
            field_id_int = int(r["field_id"]) if r["field_id"] else None
        except (ValueError, TypeError):
            field_id_int = None
        captured = r["captured_at"]
        if isinstance(captured, str) and "T" not in captured:
            captured = captured + "T00:00:00+00:00"
        return (
            field_id_int,
            captured,
            r["ndvi"],
            r["gndvi"],
            r["evi"],
            r["msavi2"],
            r["savi"],
            r["osavi"],
            r["ndre"],
            r["reip"],
            r["ndwi"],
            r["lai"],
            r["canopy_cover"],
            r["biomass_est"],
            r["source_image_id"],
            r["source"],
        )

    cols = "field_id, captured_at, ndvi, gndvi, evi, msavi2, savi, osavi, ndre, reip, ndwi, lai, canopy_cover, biomass_est, source_image_id, source"
    data = [row_to_tuple(r) for r in rows]

    if dry_run:
        print(f"Would insert {len(data)} rows into obs.vegetation_indices ({cols}).")
        for i, t in enumerate(data[:3]):
            print(f"  Sample {i+1}: field_id={t[0]}, captured_at={t[1]}, ndvi={t[2]}, source={t[-1]}")
        if len(data) > 3:
            print(f"  ... and {len(data) - 3} more")
        return

    if not HAS_PSYCOPG2:
        print("Install psycopg2-binary to insert into PostgreSQL.", file=sys.stderr)
        sys.exit(1)

    pg = None
    try:
        pg = get_pg_conn()
        with pg.cursor() as cur_pg:
            execute_values(
                cur_pg,
                f"INSERT INTO obs.vegetation_indices ({cols}) VALUES %s",
                data,
                template="(%s, %s::timestamptz, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)",
                page_size=500,
            )
        pg.commit()
        print(f"Inserted {len(data)} rows into obs.vegetation_indices.")
    except Exception as e:
        print(f"PostgreSQL error: {e}", file=sys.stderr)
        sys.exit(1)
    finally:
        if pg:
            pg.close()


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description="Export biomass_results.db to obs.vegetation_indices")
    ap.add_argument("--dry-run", action="store_true", help="Only show what would be inserted")
    args = ap.parse_args()
    export_sqlite_to_pg(dry_run=args.dry_run)
