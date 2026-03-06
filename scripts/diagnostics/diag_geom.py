import json
import os

import psycopg2

BASE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
cfg = json.load(open(os.path.join(BASE, "db_config.json")))
conn = psycopg2.connect(
    host=cfg["host"],
    port=cfg["port"],
    dbname=cfg["database"],
    user=cfg["admin_user"],
    password=cfg["admin_password"],
    sslmode=cfg.get("sslmode", "prefer"),
)
cur = conn.cursor()

cur.execute("SELECT COUNT(*), COUNT(base_id), COUNT(geom) FROM stg.field_geom")
r = cur.fetchone()
print(f"stg.field_geom:       total={r[0]}  base_id set={r[1]}  has_geom={r[2]}")

cur.execute("SELECT COUNT(*), COUNT(geom) FROM geo.fields_location")
r = cur.fetchone()
print(f"geo.fields_location:  total={r[0]}  has_geom={r[1]}")

cur.execute("SELECT COUNT(*) FROM geo.field_crop_geometry")
print(f"geo.field_crop_geometry: total={cur.fetchone()[0]}")

cur.execute("SELECT COUNT(*) FROM agro.field_crops")
print(f"agro.field_crops:     total={cur.fetchone()[0]}")

cur.execute(
    """
    SELECT COUNT(*)
    FROM stg.field_geom fg
    JOIN geo.fields_location fl ON ST_Contains(fg.geom, fl.geom)
"""
)
print(f"\nSpatial matches (punkt w poligonie): {cur.fetchone()[0]}")

cur.execute(
    """
    SELECT COUNT(*)
    FROM stg.field_geom fg
    JOIN geo.fields_location fl ON ST_Contains(fg.geom, fl.geom)
    JOIN agro.field_crops fc ON fc.field_id = fl.field_id
"""
)
print(f"Matches z agro.field_crops:          {cur.fetchone()[0]}")

cur.execute("SELECT id, base_id, area, ST_GeometryType(geom), source_file FROM stg.field_geom LIMIT 5")
print("\nstg.field_geom sample:")
for r in cur.fetchall():
    print(" ", r)

cur.execute(
    "SELECT column_name, is_nullable FROM information_schema.columns "
    "WHERE table_schema='geo' AND table_name='field_crop_geometry' ORDER BY ordinal_position"
)
print("\ngeo.field_crop_geometry columns:")
for r in cur.fetchall():
    print(" ", r)

conn.close()
