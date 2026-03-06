import json
import os

import psycopg2

os.chdir(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
with open("db_config.json", "r", encoding="utf-8") as f:
    cfg = json.load(f)
cp = {
    "host": cfg["host"],
    "port": cfg["port"],
    "database": cfg["database"],
    "user": cfg["admin_user"],
    "password": cfg["admin_password"],
    "sslmode": cfg["sslmode"],
}
conn = psycopg2.connect(**cp)
cur = conn.cursor()
for schema in ("core", "geo", "obs", "stg"):
    cur.execute(
        "SELECT table_name FROM information_schema.tables WHERE table_schema=%s ORDER BY table_name",
        (schema,),
    )
    rows = cur.fetchall()
    tables = [r[0] for r in rows]
    print(f"{schema}: {tables if tables else '(brak tabel)'}")
    for t in tables:
        cur.execute(
            "SELECT column_name, data_type FROM information_schema.columns "
            "WHERE table_schema=%s AND table_name=%s ORDER BY ordinal_position",
            (schema, t),
        )
        cols = cur.fetchall()
        for c in cols:
            print(f"  {c[0]:30s} {c[1]}")
conn.close()
