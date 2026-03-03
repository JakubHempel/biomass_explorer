"""
Migracja: SQLite users → PostgreSQL users.accounts

- Przenosi wszystkich aktywnych użytkowników
- Ustawia nowe hasło: haslo123 dla WSZYSTKICH
- Zachowuje role (admin/user)
- Deduplication po username
"""
import json
import os
import sqlite3
import sys

import bcrypt
import psycopg2

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg = json.load(open(os.path.join(BASE, "db_config.json"), encoding="utf-8"))

NEW_PASSWORD = "haslo123"


def hash_pw(pw: str) -> str:
    return bcrypt.hashpw(pw.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def main():
    # --- SQLite source ---
    sqlite_path = os.path.join(BASE, "biomass_results.db")
    if not os.path.exists(sqlite_path):
        print(f"Brak pliku SQLite: {sqlite_path}")
        sys.exit(1)

    sq = sqlite3.connect(sqlite_path)
    sq_rows = sq.execute(
        "SELECT username, email, full_name, role, is_active FROM users ORDER BY id"
    ).fetchall()
    sq.close()
    print(f"Znaleziono {len(sq_rows)} użytkowników w SQLite")

    # --- PostgreSQL target ---
    conn = psycopg2.connect(
        host=cfg["host"], port=cfg["port"], dbname=cfg["database"],
        user=cfg["admin_user"], password=cfg["admin_password"],
        sslmode=cfg.get("sslmode", "prefer"),
    )
    hashed = hash_pw(NEW_PASSWORD)
    inserted = skipped = 0

    try:
        with conn:
            with conn.cursor() as cur:
                for username, email, full_name, role, is_active in sq_rows:
                    # Tylko admin i user – odrzuć inne role
                    if role not in ("admin", "user"):
                        role = "user"

                    try:
                        cur.execute("""
                            INSERT INTO users.accounts
                                (username, email, full_name, hashed_password, role, is_active)
                            VALUES (%s, %s, %s, %s, %s, %s)
                            ON CONFLICT (username) DO NOTHING
                        """, (username, email or None, full_name, hashed, role, bool(is_active)))

                        if cur.rowcount:
                            inserted += 1
                            print(f"  + {username:20s} | {role:5s} | is_active={bool(is_active)}")
                        else:
                            skipped += 1
                            print(f"  ~ {username:20s} (już istnieje, pomijam)")
                    except Exception as e:
                        print(f"  ! {username}: {e}")

        print(f"\nGotowe. Wstawiono: {inserted}, pominięto: {skipped}")
        print(f"Hasło wszystkich: {NEW_PASSWORD}")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
