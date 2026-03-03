import json, os, psycopg2
BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg = json.load(open(os.path.join(BASE, "db_config.json")))
conn = psycopg2.connect(host=cfg["host"], port=cfg["port"], dbname=cfg["database"],
    user=cfg["admin_user"], password=cfg["admin_password"], sslmode=cfg.get("sslmode","prefer"))
cur = conn.cursor()

# core.owners columns
cur.execute("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='core' AND table_name='owners' ORDER BY ordinal_position")
print("=== core.owners ===")
for r in cur.fetchall(): print(" ", r)

# core.field_owners columns + constraints
cur.execute("SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_schema='core' AND table_name='field_owners' ORDER BY ordinal_position")
print("\n=== core.field_owners ===")
for r in cur.fetchall(): print(" ", r)

# Unique/PK constraints on field_owners
cur.execute("""
    SELECT conname, contype, pg_get_constraintdef(oid)
    FROM pg_constraint
    WHERE conrelid = 'core.field_owners'::regclass
""")
print("\nConstraints na core.field_owners:")
for r in cur.fetchall(): print(" ", r)

# Current state
cur.execute("SELECT COUNT(*) FROM core.owners")
print(f"\ncore.owners rows: {cur.fetchone()[0]}")
cur.execute("SELECT COUNT(*) FROM core.field_owners")
print(f"core.field_owners rows: {cur.fetchone()[0]}")

# Survey owner data sample
cur.execute("""
    SELECT
        id, core_field_id,
        adres_e_mail,
        prosze_wpisac_swoje_imie_i_nazwisko_do_celow_identyfikacyjnych,
        podaj_email_albo_telefon_w_celach_kontaktowych,
        nazwa_gospodarstwa_obiektu,
        sygnatura_czasowa
    FROM stg.field_survey
    WHERE core_field_id IS NOT NULL
    LIMIT 8
""")
print("\n=== stg.field_survey owner sample ===")
for r in cur.fetchall(): print(" ", r)

# Unique emails in survey
cur.execute("""
    SELECT COUNT(DISTINCT NULLIF(TRIM(adres_e_mail),'')) FROM stg.field_survey WHERE core_field_id IS NOT NULL
""")
print(f"\nUnique emails in survey: {cur.fetchone()[0]}")

conn.close()
