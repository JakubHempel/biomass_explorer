"""
Migracja: stg.field_survey  →  core.fields  +  geo.fields_location

Kroki:
  0. Dodaj kolumnę stg.field_survey.core_field_id (jeśli nie istnieje)
  1. Dla każdego wiersza bez core_field_id:
       a) wstaw rekord do core.fields
       b) zaktualizuj stg.field_survey.core_field_id
       c) jeśli jest geometria (geom lub lat+lng) → wstaw do geo.fields_location
  2. Podsumuj wyniki
"""

import json
import os
import sys

import psycopg2

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
cfg = json.load(open(os.path.join(BASE_DIR, "db_config.json"), encoding="utf-8"))


def get_conn():
    return psycopg2.connect(
        host=cfg["host"],
        port=cfg["port"],
        dbname=cfg["database"],
        user=cfg["admin_user"],
        password=cfg["admin_password"],
        sslmode=cfg.get("sslmode", "prefer"),
    )


def main():
    conn = get_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                # 0. Dodaj kolumnę referencyjną
                cur.execute(
                    """
                    ALTER TABLE stg.field_survey
                    ADD COLUMN IF NOT EXISTS core_field_id BIGINT
                        REFERENCES core.fields(id) ON DELETE SET NULL
                """
                )
                print("Kolumna stg.field_survey.core_field_id gotowa.")

                # 1. Pobierz wiersze do migracji
                cur.execute(
                    """
                    SELECT
                        id,
                        COALESCE(
                            NULLIF(TRIM(nazwa_gospodarstwa_obiektu), ''),
                            'Pole #' || id::text
                        )                          AS field_name,
                        COALESCE(sygnatura_czasowa, imported_at) AS created_at,
                        lat,
                        lng,
                        geom IS NOT NULL           AS has_geom,
                        ST_AsText(geom)             AS geom_wkt,
                        lokalizacja_pola_pinezka_google
                    FROM stg.field_survey
                    WHERE core_field_id IS NULL
                    ORDER BY id
                """
                )
                rows = cur.fetchall()
                print(f"  Wierszy do migracji: {len(rows)}")

                if not rows:
                    print("Nic do zrobienia – wszystkie wiersze mają core_field_id.")
                    return

                migrated = 0
                geo_inserted = 0
                geo_skipped = 0

                for (
                    survey_id,
                    field_name,
                    created_at,
                    lat,
                    lng,
                    has_geom,
                    geom_wkt,
                    pin_link_raw,
                ) in rows:
                    # a) core.fields
                    cur.execute(
                        "INSERT INTO core.fields (name, created_at) VALUES (%s, %s) RETURNING id",
                        (field_name, created_at),
                    )
                    field_id = cur.fetchone()[0]

                    # b) zaktualizuj stg
                    cur.execute(
                        "UPDATE stg.field_survey SET core_field_id = %s WHERE id = %s",
                        (field_id, survey_id),
                    )

                    # c) geo.fields_location
                    if has_geom and geom_wkt:
                        insert_geom_wkt = geom_wkt
                    elif lat is not None and lng is not None:
                        insert_geom_wkt = f"POINT({lng} {lat})"
                    else:
                        insert_geom_wkt = None

                    if insert_geom_wkt:
                        pin_link = pin_link_raw or (
                            f"https://maps.google.com/?q={lat:.6f},{lng:.6f}" if lat and lng else None
                        )
                        cur.execute(
                            """
                            INSERT INTO geo.fields_location
                                (field_id, geom, pin_link, created_at)
                            VALUES (
                                %s,
                                ST_SetSRID(ST_GeomFromText(%s), 4326),
                                %s,
                                NOW()
                            )
                            ON CONFLICT DO NOTHING
                        """,
                            (field_id, insert_geom_wkt, pin_link),
                        )
                        geo_inserted += 1
                    else:
                        geo_skipped += 1
                        print(
                            f"  [ostrzezenie] survey.id={survey_id} – brak geometrii, "
                            "pominieto geo.fields_location"
                        )

                    migrated += 1

                print("\nMigracja zakonczona:")
                print(f"   core.fields         dodano: {migrated}")
                print(f"   geo.fields_location dodano: {geo_inserted}")
                print(f"   geo.fields_location pominieto (brak geom): {geo_skipped}")

        print("\nCommit OK.")
    except Exception as exc:
        conn.rollback()
        print(f"\nBlad – rollback: {exc}", file=sys.stderr)
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
