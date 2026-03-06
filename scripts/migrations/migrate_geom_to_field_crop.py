"""
Migracja: stg.field_geom  →  geo.field_crop_geometry

Kroki:
  1. Dopasowanie przestrzenne: polygon z stg.field_geom  ST_Contains  punkt z geo.fields_location
     → ustal core.fields.id dla każdego poligonu i zaktualizuj stg.field_geom.base_id
  2. Utwórz agro.crops (deduplikacja po nazwie) i agro.field_crops z danych stg.field_survey
     (połączonych przez stg.field_survey.core_field_id)
  3. Wstaw polygon do geo.field_crop_geometry (jeśli jeszcze nie istnieje dla danego field_crop_id)

Warunek wejściowy: migrate_survey_to_core.py musi być wykonany wcześniej
                   (stg.field_survey.core_field_id musi być wypełniony)
"""

import json
import os
import sys

import psycopg2

BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
cfg = json.load(open(os.path.join(BASE_DIR, "db_config.json"), encoding="utf-8"))

UNKNOWN_CROP = "Nieznana uprawa"


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
                # 1. Spatial join: stg.field_geom ↔ geo.fields_location
                print("Krok 1: dopasowanie przestrzenne polygon → punkt …")
                cur.execute(
                    """
                    SELECT
                        fg.id           AS geom_id,
                        fg.geom,
                        fg.area,
                        fl.field_id     AS core_field_id,
                        fl.id           AS location_id
                    FROM stg.field_geom fg
                    JOIN geo.fields_location fl
                         ON ST_Contains(fg.geom, fl.geom)
                    ORDER BY fg.id
                """
                )
                matches = cur.fetchall()
                print(f"  Dopasowano przestrzennie: {len(matches)} par")

                if not matches:
                    print("  Brak dopasowań – sprawdź czy geometrie są w tym samym SRID.")
                    return

                # Słownik: stg.field_geom.id → core.fields.id
                geom_to_field = {m[0]: m[3] for m in matches}

                # 2. Zaktualizuj stg.field_geom.base_id
                print("Krok 2: aktualizacja stg.field_geom.base_id …")
                updated_base = 0
                for geom_id, core_field_id in geom_to_field.items():
                    cur.execute(
                        "UPDATE stg.field_geom SET base_id = %s WHERE id = %s AND base_id IS DISTINCT FROM %s",
                        (core_field_id, geom_id, core_field_id),
                    )
                    if cur.rowcount:
                        updated_base += 1
                print(f"  Zaktualizowano base_id: {updated_base}")

                # 3. Pobierz dane upraw z stg.field_survey
                print("Krok 3: pobieranie danych upraw ze stg.field_survey …")
                cur.execute(
                    """
                    SELECT
                        fs.core_field_id,
                        NULLIF(TRIM(fs.odmiana_uprawy_rodzaj_rosliny), '') AS crop_name,
                        fs.data_siewu_prosze_wybrac_date_siewu_zrealizowana_lub_planowana AS sowing_date,
                        fs.sygnatura_czasowa
                    FROM stg.field_survey fs
                    WHERE fs.core_field_id IS NOT NULL
                    ORDER BY fs.core_field_id
                """
                )
                survey_crops = cur.fetchall()

                # 4. Upewnij się, że agro.crops istnieją
                print("Krok 4: synchronizacja agro.crops …")
                crop_name_to_id = {}

                # Pobierz istniejące
                cur.execute("SELECT id, lower(name) FROM agro.crops")
                for cid, cname in cur.fetchall():
                    crop_name_to_id[cname] = cid

                def ensure_crop(name: str) -> int:
                    key = name.lower().strip()
                    if key not in crop_name_to_id:
                        cur.execute(
                            "INSERT INTO agro.crops (name) VALUES (%s) ON CONFLICT DO NOTHING RETURNING id",
                            (name,),
                        )
                        row = cur.fetchone()
                        if row:
                            crop_name_to_id[key] = row[0]
                        else:
                            cur.execute("SELECT id FROM agro.crops WHERE lower(name) = %s", (key,))
                            crop_name_to_id[key] = cur.fetchone()[0]
                    return crop_name_to_id[key]

                # 5. Utwórz agro.field_crops dla każdego pola
                print("Krok 5: tworzenie agro.field_crops …")
                field_to_crop_id = {}  # core.fields.id → agro.field_crops.id

                # Zacznij od istniejących
                cur.execute(
                    """
                    SELECT field_id, id FROM agro.field_crops
                    WHERE is_current = TRUE
                """
                )
                for fid, fcid in cur.fetchall():
                    field_to_crop_id[fid] = fcid

                fc_created = 0
                for core_field_id, crop_name, sowing_date, survey_ts in survey_crops:
                    if core_field_id in field_to_crop_id:
                        continue  # już istnieje

                    crop_label = crop_name or UNKNOWN_CROP
                    crop_id = ensure_crop(crop_label)

                    valid_from = sowing_date or (survey_ts.date() if survey_ts else None)

                    cur.execute(
                        """
                        INSERT INTO agro.field_crops
                            (field_id, crop_id, sowing_date, valid_from, is_current)
                        VALUES (%s, %s, %s, %s, TRUE)
                        ON CONFLICT DO NOTHING
                        RETURNING id
                    """,
                        (core_field_id, crop_id, sowing_date, valid_from),
                    )
                    row = cur.fetchone()
                    if row:
                        field_to_crop_id[core_field_id] = row[0]
                        fc_created += 1

                print(f"  agro.field_crops utworzono: {fc_created}")

                # 6. Wstaw geo.field_crop_geometry
                print("Krok 6: wstawianie geo.field_crop_geometry …")
                geom_inserted = 0
                geom_skipped = 0

                for geom_id, poly_geom_obj, area, core_field_id, location_id in matches:
                    field_crop_id = field_to_crop_id.get(core_field_id)
                    if not field_crop_id:
                        print(f"  [pominięto] field_id={core_field_id}: brak agro.field_crops")
                        geom_skipped += 1
                        continue

                    # Sprawdź czy już istnieje
                    cur.execute(
                        "SELECT 1 FROM geo.field_crop_geometry WHERE field_crop_id = %s",
                        (field_crop_id,),
                    )
                    if cur.fetchone():
                        geom_skipped += 1
                        continue

                    cur.execute(
                        """
                        INSERT INTO geo.field_crop_geometry
                            (field_crop_id, geom, source, created_at, updated_at)
                        VALUES (
                            %s,
                            (SELECT geom FROM stg.field_geom WHERE id = %s),
                            'stg.field_geom',
                            NOW(), NOW()
                        )
                    """,
                        (field_crop_id, geom_id),
                    )
                    geom_inserted += 1

                print(f"  geo.field_crop_geometry wstawiono: {geom_inserted}")
                print(f"  pominięto (już istnieje lub brak field_crop): {geom_skipped}")

        print("\nCommit OK.")
        print("\nPodsumowanie:")
        print(f"  stg.field_geom.base_id  poprawiono: {updated_base}")
        print(f"  agro.field_crops        utworzono:  {fc_created}")
        print(f"  geo.field_crop_geometry wstawiono:  {geom_inserted}")

    except Exception as exc:
        conn.rollback()
        print(f"\nBlad – rollback: {exc}", file=sys.stderr)
        import traceback

        traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
