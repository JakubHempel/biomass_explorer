"""
Migracja: stg.field_survey → core.owners + core.field_owners

Kroki:
  1. Zbierz unikalne osoby/właścicieli z ankiety (deduplikacja po emailu)
  2. Wstaw do core.owners (pomijaj jeśli email już istnieje)
  3. Powiąż każde pole z właścicielem przez core.field_owners
     (valid_from = sygnatura_czasowa ankiety, is_primary = TRUE)

Warunek wejściowy: stg.field_survey.core_field_id musi być wypełniony
                   (uruchom najpierw migrate_survey_to_core.py)
"""

import json
import os
import sys

import psycopg2

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
cfg = json.load(open(os.path.join(BASE_DIR, "db_config.json"), encoding="utf-8"))

EMAIL_PLACEHOLDER_TMPL = "brak-emaila-survey-{survey_id}@brak.local"


def get_conn():
    return psycopg2.connect(
        host=cfg["host"], port=cfg["port"], dbname=cfg["database"],
        user=cfg["admin_user"], password=cfg["admin_password"],
        sslmode=cfg.get("sslmode", "prefer"),
    )


def main():
    conn = get_conn()
    try:
        with conn:
            with conn.cursor() as cur:

                # ── 1. Pobierz wiersze ankiety z core_field_id ─────────────
                cur.execute("""
                    SELECT
                        id                                                         AS survey_id,
                        core_field_id,
                        NULLIF(TRIM(adres_e_mail), '')                             AS email,
                        NULLIF(TRIM(prosze_wpisac_swoje_imie_i_nazwisko_do_celow_identyfikacyjnych), '') AS full_name,
                        NULLIF(TRIM(podaj_email_albo_telefon_w_celach_kontaktowych), '')                 AS phone_or_email,
                        NULLIF(TRIM(nazwa_gospodarstwa_obiektu), '')               AS farm_name,
                        COALESCE(sygnatura_czasowa, imported_at)                   AS valid_from
                    FROM stg.field_survey
                    WHERE core_field_id IS NOT NULL
                    ORDER BY id
                """)
                rows = cur.fetchall()
                print(f"Wierszy ankiety do przetworzenia: {len(rows)}")

                # ── 2. Pobierz istniejące emaile w core.owners ─────────────
                cur.execute("SELECT id, lower(email) FROM core.owners")
                email_to_owner_id: dict[str, int] = {
                    row[1]: row[0] for row in cur.fetchall()
                }

                owners_created  = 0
                owners_reused   = 0
                links_created   = 0
                links_skipped   = 0

                for (survey_id, core_field_id, email, full_name,
                     phone_or_email, farm_name, valid_from) in rows:

                    # ── Ustal email ────────────────────────────────────────
                    effective_email = email
                    if not effective_email:
                        # Próbuj wyciągnąć email z pola kontaktowego
                        if phone_or_email and "@" in phone_or_email:
                            effective_email = phone_or_email
                        else:
                            effective_email = EMAIL_PLACEHOLDER_TMPL.format(survey_id=survey_id)

                    effective_email_lower = effective_email.lower().strip()

                    # ── Ustal wyświetlaną nazwę ────────────────────────────
                    display_name = (
                        full_name
                        or farm_name
                        or effective_email.split("@")[0]
                    )

                    # ── Ustal telefon ──────────────────────────────────────
                    phone = None
                    if phone_or_email and "@" not in phone_or_email:
                        phone = phone_or_email

                    # ── 3a. Utwórz/znajdź core.owners ─────────────────────
                    if effective_email_lower in email_to_owner_id:
                        owner_id = email_to_owner_id[effective_email_lower]
                        owners_reused += 1
                    else:
                        cur.execute("""
                            INSERT INTO core.owners (email, name, phone, adress, created_at)
                            VALUES (%s, %s, %s, %s, NOW())
                            ON CONFLICT DO NOTHING
                            RETURNING id
                        """, (effective_email, display_name, phone, farm_name))
                        row = cur.fetchone()
                        if row:
                            owner_id = row[0]
                        else:
                            # wyścig – pobierz istniejący
                            cur.execute(
                                "SELECT id FROM core.owners WHERE lower(email) = %s",
                                (effective_email_lower,),
                            )
                            owner_id = cur.fetchone()[0]
                        email_to_owner_id[effective_email_lower] = owner_id
                        owners_created += 1

                    # ── 3b. Utwórz core.field_owners ──────────────────────
                    # PK: (field_id, owner_id, valid_from)
                    cur.execute("""
                        INSERT INTO core.field_owners
                            (field_id, owner_id, valid_from, is_primary)
                        VALUES (%s, %s, %s, TRUE)
                        ON CONFLICT DO NOTHING
                    """, (core_field_id, owner_id, valid_from))

                    if cur.rowcount:
                        links_created += 1
                    else:
                        links_skipped += 1

        print("\nCommit OK.")
        print(f"\nPodsumowanie:")
        print(f"  core.owners     nowe:    {owners_created}")
        print(f"  core.owners     reused:  {owners_reused}")
        print(f"  core.field_owners dodano: {links_created}")
        print(f"  core.field_owners skip:   {links_skipped}")

    except Exception as exc:
        conn.rollback()
        print(f"\nBlad – rollback: {exc}", file=sys.stderr)
        import traceback; traceback.print_exc()
        sys.exit(1)
    finally:
        conn.close()


if __name__ == "__main__":
    main()
