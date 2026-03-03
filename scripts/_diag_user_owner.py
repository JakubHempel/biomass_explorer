import json, os, psycopg2
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg = json.load(open(os.path.join(BASE, "db_config.json")))
conn = psycopg2.connect(host=cfg["host"], port=cfg["port"], dbname=cfg["database"],
    user=cfg["admin_user"], password=cfg["admin_password"], sslmode=cfg.get("sslmode","prefer"))
cur = conn.cursor()

print("=== users.accounts (logowanie do aplikacji) ===")
cur.execute("SELECT id, username, email, role, is_active FROM users.accounts ORDER BY id")
for r in cur.fetchall():
    print(f"  {r[0]:3} | {r[1]:20} | {str(r[2] or '-'):38} | {r[3]:5} | active={r[4]}")

print()
print("=== core.owners (właściciele pól w bazie) ===")
cur.execute("SELECT id, name, email FROM core.owners ORDER BY id")
for r in cur.fetchall():
    print(f"  {r[0]:3} | {str(r[1] or '-'):30} | {str(r[2] or '-')}")

print()
print("=== Powiązanie users.accounts <-> core.owners (przez email) ===")
cur.execute("""
    SELECT
        u.username, u.role,
        o.id AS owner_id, o.name AS owner_name,
        COUNT(fo.field_id) AS field_count
    FROM users.accounts u
    LEFT JOIN core.owners o ON lower(o.email) = lower(u.email)
    LEFT JOIN core.field_owners fo ON fo.owner_id = o.id
    GROUP BY u.id, u.username, u.role, o.id, o.name
    ORDER BY u.id
""")
print(f"  {'login':20} {'rola':6} {'owner_id':10} {'owner_name':30} {'pol':5}")
print("  " + "-"*75)
for r in cur.fetchall():
    oid = str(r[2]) if r[2] else "BRAK"
    print(f"  {r[0]:20} {r[1]:6} {oid:10} {str(r[3] or '-'):30} {r[4]}")

print()
print("=== Użytkownicy bez powiązanego core.owner ===")
cur.execute("""
    SELECT u.username, u.email FROM users.accounts u
    LEFT JOIN core.owners o ON lower(o.email) = lower(u.email)
    WHERE o.id IS NULL AND u.email IS NOT NULL
""")
rows = cur.fetchall()
if rows:
    for r in rows: print(f"  {r[0]} ({r[1]})")
else:
    print("  Brak - wszyscy użytkownicy z emailem mają odpowiadający core.owner")

conn.close()
