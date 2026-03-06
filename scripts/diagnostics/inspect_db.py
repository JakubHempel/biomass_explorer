import json
import os

import psycopg2

os.chdir(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
with open("db_config.json", "r") as f:
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

# agro tables
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='agro' ORDER BY table_name")
print("agro tables:", [r[0] for r in cur.fetchall()])


def show_cols(schema, table):
    cur.execute(
        """
        SELECT column_name, data_type, is_nullable, column_default, is_generated
        FROM information_schema.columns
        WHERE table_schema=%s AND table_name=%s ORDER BY ordinal_position
    """,
        (schema, table),
    )
    rows = cur.fetchall()
    if not rows:
        print(f"  (table {schema}.{table} not found)")
        return
    for r in rows:
        gen = " [GENERATED]" if r[4] == "ALWAYS" else ""
        print(f"  {r[0]:30s} {r[1]:25s} null={r[2]}{gen}")


for t in ["crops", "field_crop"]:
    print(f"\nagro.{t}:")
    show_cols("agro", t)

print("\ngeo.fields_location:")
show_cols("geo", "fields_location")

print("\ngeo.field_crop_geometry:")
show_cols("geo", "field_crop_geometry")

print("\ncore.owners:")
show_cols("core", "owners")

print("\ncore.field_owners:")
show_cols("core", "field_owners")

conn.close()
