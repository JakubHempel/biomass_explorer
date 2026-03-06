"""
Admin & field-editor service layer.

- User CRUD in PostgreSQL (users.accounts)
- save_field_to_pg: inserts a drawn polygon into:
    core.fields           – field record
    geo.fields_location   – centroid pin
    stg.field_geom        – full polygon
"""
from __future__ import annotations

import re
from typing import Optional

from pyproj import Geod
from shapely.geometry import shape

import auth
import database
import schemas


# ---------------------------------------------------------------------------
# PG connection helper (single shared path from database.py)
# ---------------------------------------------------------------------------
def _get_pg_conn():
    return database.get_pg_conn()


# ---------------------------------------------------------------------------
# User CRUD  (PostgreSQL users.accounts via psycopg2)
# ---------------------------------------------------------------------------

_USER_SELECT = (
    "SELECT id, username, email, full_name, hashed_password, role, is_active, "
    "to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') "
    f"FROM {database.USERS_ACCOUNTS_TABLE}"
)


def _row_to_dict(row) -> dict:
    return {
        "id": row[0], "username": row[1], "email": row[2],
        "full_name": row[3], "role": row[5],
        "is_active": row[6], "created_at": row[7],
    }


def list_users() -> list[dict]:
    conn = _get_pg_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(_USER_SELECT + " ORDER BY id")
            return [_row_to_dict(r) for r in cur.fetchall()]
    finally:
        conn.close()


def get_user(user_id: int) -> Optional[dict]:
    conn = _get_pg_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(_USER_SELECT + " WHERE id = %s", (user_id,))
            row = cur.fetchone()
            return _row_to_dict(row) if row else None
    finally:
        conn.close()


def create_user(data: schemas.UserCreate) -> dict:
    conn = _get_pg_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"SELECT 1 FROM {database.USERS_ACCOUNTS_TABLE} WHERE username = %s", (data.username,)
                )
                if cur.fetchone():
                    raise ValueError(f"Username '{data.username}' already exists")
                if data.email:
                    cur.execute(
                        f"SELECT 1 FROM {database.USERS_ACCOUNTS_TABLE} WHERE lower(email) = lower(%s)",
                        (data.email,),
                    )
                    if cur.fetchone():
                        raise ValueError(f"Email '{data.email}' already exists")
                cur.execute(
                    f"""
                    INSERT INTO {database.USERS_ACCOUNTS_TABLE}
                        (username, email, full_name, hashed_password, role, is_active)
                    VALUES (%s, %s, %s, %s, %s, TRUE)
                    RETURNING id
                    """,
                    (data.username, data.email or None, data.full_name,
                     auth.get_password_hash(data.password), data.role),
                )
                new_id = cur.fetchone()[0]
        return get_user(new_id)
    finally:
        conn.close()


def update_user(user_id: int, data: schemas.UserUpdate) -> Optional[dict]:
    conn = _get_pg_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                sets, params = [], []
                if data.email is not None:
                    sets.append("email = %s"); params.append(data.email or None)
                if data.full_name is not None:
                    sets.append("full_name = %s"); params.append(data.full_name)
                if data.role is not None:
                    sets.append("role = %s"); params.append(data.role)
                if data.is_active is not None:
                    sets.append("is_active = %s"); params.append(data.is_active)
                if data.password:
                    sets.append("hashed_password = %s")
                    params.append(auth.get_password_hash(data.password))
                if not sets:
                    return get_user(user_id)
                params.append(user_id)
                cur.execute(
                    f"UPDATE {database.USERS_ACCOUNTS_TABLE} SET {', '.join(sets)} WHERE id = %s",
                    params,
                )
        return get_user(user_id)
    finally:
        conn.close()


def delete_user(user_id: int) -> bool:
    conn = _get_pg_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(
                    f"UPDATE {database.USERS_ACCOUNTS_TABLE} SET is_active = FALSE WHERE id = %s",
                    (user_id,),
                )
                return cur.rowcount > 0
    finally:
        conn.close()


def ensure_default_admin() -> None:
    """Create default admin in PG on first startup if no users exist."""
    conn = _get_pg_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                cur.execute(f"SELECT COUNT(*) FROM {database.USERS_ACCOUNTS_TABLE}")
                if cur.fetchone()[0] == 0:
                    cur.execute(
                        f"""
                        INSERT INTO {database.USERS_ACCOUNTS_TABLE}
                            (username, full_name, hashed_password, role, is_active)
                        VALUES ('admin', 'Administrator', %s, 'admin', TRUE)
                        ON CONFLICT DO NOTHING
                        """,
                        (auth.get_password_hash("admin123"),),
                    )
                    print("Created default admin: admin / admin123  (CHANGE THIS!)")
    except Exception as exc:
        print(f"[warn] ensure_default_admin: {exc}")
    finally:
        conn.close()


def ensure_users_from_owners() -> int:
    """Create PG user accounts for owners in core.owners who don't have one yet.

    Username = cleaned email prefix.  Default password = haslo123.
    Skips placeholder @brak.local addresses.
    """
    conn = _get_pg_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT email, name FROM core.owners "
                "WHERE email IS NOT NULL AND email NOT LIKE '%%@brak.local' "
                "ORDER BY name"
            )
            owners = cur.fetchall()
    except Exception as exc:
        print(f"[warn] ensure_users_from_owners: {exc}")
        conn.close()
        return 0

    created = 0
    hashed = auth.get_password_hash("haslo123")
    try:
        with conn:
            with conn.cursor() as cur:
                for email, name in owners:
                    if not email:
                        continue
                    # Skip if already exists by email
                    cur.execute(
                        f"SELECT 1 FROM {database.USERS_ACCOUNTS_TABLE} WHERE lower(email) = lower(%s)",
                        (email,),
                    )
                    if cur.fetchone():
                        continue

                    # Build unique username from email prefix
                    base = re.sub(r"[^a-z0-9]", "_", email.split("@")[0].lower())[:28]
                    username = base
                    suffix = 1
                    while True:
                        cur.execute(
                            f"SELECT 1 FROM {database.USERS_ACCOUNTS_TABLE} WHERE username = %s", (username,)
                        )
                        if not cur.fetchone():
                            break
                        username = f"{base[:25]}_{suffix}"
                        suffix += 1

                    cur.execute(
                        f"""
                        INSERT INTO {database.USERS_ACCOUNTS_TABLE}
                            (username, email, full_name, hashed_password, role, is_active)
                        VALUES (%s, %s, %s, %s, 'user', TRUE)
                        ON CONFLICT DO NOTHING
                        """,
                        (username, email, name, hashed),
                    )
                    if cur.rowcount:
                        created += 1

        if created:
            print(f"[info] Created {created} user account(s) from core.owners")
        return created
    finally:
        conn.close()


def check_field_owner(field_id: int, owner_email: str) -> bool:
    """Return True if the given email is linked to this field in core.field_owners."""
    conn = _get_pg_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT 1 FROM core.field_owners fo
                JOIN core.owners o ON o.id = fo.owner_id
                WHERE fo.field_id = %s AND lower(o.email) = lower(%s)
                LIMIT 1
                """,
                (field_id, owner_email),
            )
            return cur.fetchone() is not None
    finally:
        conn.close()


# ---------------------------------------------------------------------------
# Field save → PostgreSQL  (core + geo + stg)
# ---------------------------------------------------------------------------

def save_field_to_pg(
    name: str,
    geojson_geometry: dict,
    owner_email: str,
    owner_name: Optional[str],
    owner_valid_from: str,   # ISO date "YYYY-MM-DD"
    crop_name: str,
    sowing_date: str,        # ISO date "YYYY-MM-DD"
    notes: Optional[str] = None,
) -> dict:
    """
    Full field save flow:
      1. core.fields             – field record
      2. core.owners             – find or create owner by email
      3. core.field_owners       – link field ↔ owner (valid_from)
      4. geo.fields_location     – centroid Point (lat/lng are GENERATED)
      5. agro.crops              – find or create crop by name
      6. agro.field_crops        – crop season record
      7. geo.field_crop_geometry – full polygon linked to field_crop
    """
    geom = shape(geojson_geometry)
    if geom.is_empty:
        raise ValueError("Empty geometry")

    centroid = geom.centroid
    lat, lng = centroid.y, centroid.x

    geod = Geod(ellps="WGS84")
    area_m2 = abs(geod.geometry_area_perimeter(geom)[0])

    pin_link = f"https://maps.google.com/?q={lat:.6f},{lng:.6f}"
    polygon_wkt = geom.wkt
    point_wkt = f"POINT({lng} {lat})"

    conn = _get_pg_conn()
    try:
        with conn:
            with conn.cursor() as cur:

                # 1. core.fields
                cur.execute(
                    "INSERT INTO core.fields (name, created_at) VALUES (%s, NOW()) RETURNING id",
                    (name,),
                )
                field_id = cur.fetchone()[0]

                # 2. core.owners – find by email or create
                cur.execute("SELECT id FROM core.owners WHERE email = %s LIMIT 1", (owner_email,))
                row = cur.fetchone()
                if row:
                    owner_id = row[0]
                else:
                    cur.execute(
                        "INSERT INTO core.owners (email, name, created_at) VALUES (%s, %s, NOW()) RETURNING id",
                        (owner_email, owner_name or owner_email),
                    )
                    owner_id = cur.fetchone()[0]

                # 3. core.field_owners
                cur.execute(
                    """
                    INSERT INTO core.field_owners (field_id, owner_id, valid_from, is_primary)
                    VALUES (%s, %s, %s::timestamptz, TRUE)
                    ON CONFLICT DO NOTHING
                    """,
                    (field_id, owner_id, owner_valid_from),
                )

                # 4. geo.fields_location – only geom (lat/lng are GENERATED columns)
                cur.execute(
                    """
                    INSERT INTO geo.fields_location (field_id, geom, pin_link, created_at)
                    VALUES (%s, ST_SetSRID(ST_GeomFromText(%s), 4326), %s, NOW())
                    """,
                    (field_id, point_wkt, pin_link),
                )

                # 5. agro.crops – find or create
                cur.execute("SELECT id FROM agro.crops WHERE lower(name) = lower(%s) LIMIT 1", (crop_name,))
                row = cur.fetchone()
                if row:
                    crop_id = row[0]
                else:
                    cur.execute(
                        "INSERT INTO agro.crops (name) VALUES (%s) RETURNING id",
                        (crop_name,),
                    )
                    crop_id = cur.fetchone()[0]

                # 6. agro.field_crops
                cur.execute(
                    """
                    INSERT INTO agro.field_crops
                        (field_id, crop_id, sowing_date, valid_from, is_current)
                    VALUES (%s, %s, %s::date, %s::date, TRUE) RETURNING id
                    """,
                    (field_id, crop_id, sowing_date, sowing_date),
                )
                field_crop_id = cur.fetchone()[0]

                # 7. geo.field_crop_geometry – full polygon
                cur.execute(
                    """
                    INSERT INTO geo.field_crop_geometry
                        (field_crop_id, geom, source, notes, created_at, updated_at)
                    VALUES (%s, ST_SetSRID(ST_GeomFromText(%s), 4326), %s, %s, NOW(), NOW())
                    """,
                    (field_crop_id, polygon_wkt, "field_editor", notes),
                )

        return {
            "field_id": field_id,
            "lat": round(lat, 6),
            "lng": round(lng, 6),
            "area_m2": round(area_m2, 2),
            "crop_id": crop_id,
            "field_crop_id": field_crop_id,
        }
    finally:
        conn.close()


def get_field_detail(field_id: int) -> Optional[dict]:
    """Return full field details including polygon GeoJSON for the editor."""
    conn = _get_pg_conn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT
                    f.id,
                    f.name,
                    to_char(f.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS created_at,
                    fo.valid_from  AS owner_valid_from,
                    o.email        AS owner_email,
                    o.name         AS owner_name,
                    fl.lat,
                    fl.lng
                FROM core.fields f
                LEFT JOIN core.field_owners fo ON fo.field_id = f.id
                LEFT JOIN core.owners       o  ON o.id = fo.owner_id
                LEFT JOIN geo.fields_location fl ON fl.field_id = f.id
                WHERE f.id = %s
                LIMIT 1
                """,
                (field_id,),
            )
            row = cur.fetchone()
            if not row:
                return None
            d = {
                "field_id":         row[0],
                "name":             row[1],
                "created_at":       row[2],
                "owner_valid_from": row[3].date().isoformat() if row[3] else None,
                "owner_email":      row[4],
                "owner_name":       row[5],
                "lat":              float(row[6]) if row[6] is not None else None,
                "lng":              float(row[7]) if row[7] is not None else None,
            }

            # Current crop
            cur.execute(
                """
                SELECT c.name, fc.sowing_date, fc.harvest_date, fc.id
                FROM agro.field_crops fc
                JOIN agro.crops c ON c.id = fc.crop_id
                WHERE fc.field_id = %s AND fc.is_current = TRUE
                LIMIT 1
                """,
                (field_id,),
            )
            crop = cur.fetchone()
            if crop:
                d["crop_name"]     = crop[0]
                d["sowing_date"]   = crop[1].isoformat() if crop[1] else None
                d["harvest_date"]  = crop[2].isoformat() if crop[2] else None
                d["field_crop_id"] = crop[3]

            # Polygon GeoJSON (prefer current geo.field_crop_geometry, fallback stg.field_geom)
            geom = None
            if d.get("field_crop_id"):
                cur.execute(
                    """
                    SELECT ST_AsGeoJSON(geom), ST_Area(geom::geography)
                    FROM geo.field_crop_geometry
                    WHERE field_crop_id = %s
                    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
                    LIMIT 1
                    """,
                    (d["field_crop_id"],),
                )
                geom = cur.fetchone()

            if not geom or not geom[0]:
                cur.execute(
                    "SELECT ST_AsGeoJSON(geom), area FROM stg.field_geom WHERE base_id = %s ORDER BY id DESC LIMIT 1",
                    (field_id,),
                )
                geom = cur.fetchone()

            if geom and geom[0]:
                import json as _json
                d["geojson"] = _json.loads(geom[0])
                d["area_m2"] = float(geom[1]) if geom[1] is not None else None

            return d
    finally:
        conn.close()


def update_field_in_pg(
    field_id: int,
    name: str,
    crop_name: str,
    sowing_date: str,
    harvest_date: Optional[str],
    notes: Optional[str],
    geojson_geometry: Optional[dict],
) -> dict:
    """Update an existing field. Polygon is updated only when geojson_geometry is provided."""
    conn = _get_pg_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                # 1. core.fields
                cur.execute(
                    "UPDATE core.fields SET name = %s WHERE id = %s",
                    (name, field_id),
                )

                # 2. crop – find or create
                cur.execute(
                    "SELECT id FROM agro.crops WHERE lower(name) = lower(%s) LIMIT 1",
                    (crop_name,),
                )
                row = cur.fetchone()
                if row:
                    crop_id = row[0]
                else:
                    cur.execute(
                        "INSERT INTO agro.crops (name) VALUES (%s) RETURNING id",
                        (crop_name,),
                    )
                    crop_id = cur.fetchone()[0]

                # 3. agro.field_crops (current record)
                cur.execute(
                    """
                    UPDATE agro.field_crops
                    SET crop_id = %s, sowing_date = %s::date, harvest_date = %s::date
                    WHERE field_id = %s AND is_current = TRUE
                    RETURNING id
                    """,
                    (crop_id, sowing_date, harvest_date or None, field_id),
                )
                row = cur.fetchone()
                field_crop_id = row[0] if row else None

                if geojson_geometry:
                    geom = shape(geojson_geometry)
                    centroid = geom.centroid
                    lat, lng = centroid.y, centroid.x
                    geod = Geod(ellps="WGS84")
                    area_m2 = abs(geod.geometry_area_perimeter(geom)[0])
                    polygon_wkt = geom.wkt
                    point_wkt = f"POINT({lng} {lat})"
                    pin_link = f"https://maps.google.com/?q={lat:.6f},{lng:.6f}"

                    # 4. geo.fields_location – centroid
                    cur.execute(
                        """
                        UPDATE geo.fields_location
                        SET geom = ST_SetSRID(ST_GeomFromText(%s), 4326), pin_link = %s
                        WHERE field_id = %s
                        """,
                        (point_wkt, pin_link, field_id),
                    )

                    # 5. geo.field_crop_geometry – polygon
                    if field_crop_id:
                        cur.execute(
                            """
                            UPDATE geo.field_crop_geometry
                            SET geom = ST_SetSRID(ST_GeomFromText(%s), 4326),
                                notes = %s, updated_at = NOW()
                            WHERE field_crop_id = %s
                            """,
                            (polygon_wkt, notes, field_crop_id),
                        )

                    # 6. stg.field_geom
                    cur.execute(
                        """
                        UPDATE stg.field_geom
                        SET geom = ST_SetSRID(ST_GeomFromText(%s), 4326), area = %s
                        WHERE base_id = %s
                        """,
                        (polygon_wkt, round(area_m2, 2), field_id),
                    )

        return {"field_id": field_id, "ok": True}
    finally:
        conn.close()


DEFAULT_CROPS = [
    "Pszenica ozima", "Pszenica jara", "Żyto", "Pszenżyto", "Owies",
    "Jęczmień ozimy", "Jęczmień jary", "Kukurydza", "Rzepak ozimy", "Rzepak jary",
    "Burak cukrowy", "Ziemniaki", "Soja", "Słonecznik", "Groch", "Bobik",
    "Łąka / pastwisko", "Ugór",
]


def ensure_default_crops() -> None:
    """Insert default crop list into agro.crops if not already present."""
    conn = _get_pg_conn()
    try:
        with conn:
            with conn.cursor() as cur:
                for name in DEFAULT_CROPS:
                    cur.execute(
                        "INSERT INTO agro.crops (name) VALUES (%s) ON CONFLICT DO NOTHING",
                        (name,),
                    )
    except Exception as exc:
        print(f"[warn] ensure_default_crops: {exc}")
    finally:
        conn.close()


def list_crops_from_pg() -> list[dict]:
    """Return all crops from agro.crops ordered by name."""
    conn = _get_pg_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT id, name FROM agro.crops ORDER BY name COLLATE \"pl-PL-x-icu\"")
            return [{"id": r[0], "name": r[1]} for r in cur.fetchall()]
    except Exception:
        conn2 = _get_pg_conn()
        try:
            with conn2.cursor() as cur:
                cur.execute("SELECT id, name FROM agro.crops ORDER BY name")
                return [{"id": r[0], "name": r[1]} for r in cur.fetchall()]
        finally:
            conn2.close()
    finally:
        conn.close()


def list_fields_full(owner_email: Optional[str] = None) -> list[dict]:
    """Rich field listing for the browse page: owner, crop, area, polygon GeoJSON.

    If owner_email is provided only fields belonging to that owner are returned.
    """
    import json as _json
    conn = _get_pg_conn()
    try:
        with conn.cursor() as cur:
            where = "WHERE lower(o.email) = lower(%s)" if owner_email else ""
            params = (owner_email,) if owner_email else ()
            cur.execute(f"""
                SELECT
                    f.id,
                    f.name,
                    to_char(f.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS created_at,
                    fl.lat,
                    fl.lng,
                    c.name          AS crop,
                    fc.sowing_date,
                    fc.harvest_date,
                    o.id            AS owner_id,
                    o.name          AS owner_name,
                    o.email         AS owner_email,
                    round((COALESCE(fg_cur.area_m2, fg_legacy.area)::numeric / 10000.0), 4) AS area_ha,
                    ST_AsGeoJSON(COALESCE(fg_cur.geom, fg_legacy.geom)) AS geojson
                FROM core.fields f
                LEFT JOIN geo.fields_location fl ON fl.field_id = f.id
                LEFT JOIN agro.field_crops fc
                    ON fc.field_id = f.id AND fc.is_current = TRUE
                LEFT JOIN agro.crops c ON c.id = fc.crop_id
                LEFT JOIN LATERAL (
                    SELECT owner_id FROM core.field_owners
                    WHERE field_id = f.id AND is_primary = TRUE
                    ORDER BY valid_from DESC LIMIT 1
                ) fo ON true
                LEFT JOIN core.owners o ON o.id = fo.owner_id
                LEFT JOIN LATERAL (
                    SELECT geom, ST_Area(geom::geography) AS area_m2
                    FROM geo.field_crop_geometry
                    WHERE field_crop_id = fc.id
                    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
                    LIMIT 1
                ) fg_cur ON true
                LEFT JOIN LATERAL (
                    SELECT geom, area FROM stg.field_geom
                    WHERE base_id = f.id ORDER BY id DESC LIMIT 1
                ) fg_legacy ON true
                {where}
                ORDER BY f.name
                LIMIT 500
            """, params)
            cols = [d[0] for d in cur.description]
            rows = []
            for row in cur.fetchall():
                d = dict(zip(cols, row))
                for date_col in ("sowing_date", "harvest_date"):
                    if d.get(date_col):
                        d[date_col] = d[date_col].isoformat()
                if d.get("geojson"):
                    d["geojson"] = _json.loads(d["geojson"])
                if d.get("area_ha") is not None:
                    d["area_ha"] = float(d["area_ha"])
                rows.append(d)
            return rows
    finally:
        conn.close()


def list_owners_from_pg() -> list[dict]:
    """Return all owners with their field count."""
    conn = _get_pg_conn()
    try:
        with conn.cursor() as cur:
            cur.execute("""
                SELECT
                    o.id,
                    o.name,
                    o.email,
                    COUNT(DISTINCT fo.field_id) AS field_count
                FROM core.owners o
                LEFT JOIN core.field_owners fo ON fo.owner_id = o.id
                GROUP BY o.id, o.name, o.email
                ORDER BY o.name
            """)
            return [
                {"id": r[0], "name": r[1] or r[2], "email": r[2], "field_count": r[3]}
                for r in cur.fetchall()
            ]
    finally:
        conn.close()


def list_fields_from_pg(owner_email: Optional[str] = None) -> list[dict]:
    """Return fields from core.fields joined with centroid and current crop.

    If owner_email is provided only fields belonging to that owner are returned.
    """
    conn = _get_pg_conn()
    try:
        with conn.cursor() as cur:
            if owner_email:
                where = "LEFT JOIN core.field_owners fo ON fo.field_id = f.id LEFT JOIN core.owners o ON o.id = fo.owner_id WHERE lower(o.email) = lower(%s)"
                params: tuple = (owner_email,)
            else:
                where = ""
                params = ()
            cur.execute(
                f"""
                SELECT
                    f.id,
                    f.name,
                    to_char(f.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI') AS created_at,
                    fl.lat,
                    fl.lng,
                    c.name AS crop,
                    fc.sowing_date,
                    round((COALESCE(fg_cur.area_m2, fg_legacy.area)::numeric / 10000.0), 4) AS area_ha
                FROM core.fields f
                LEFT JOIN geo.fields_location fl ON fl.field_id = f.id
                LEFT JOIN agro.field_crops fc ON fc.field_id = f.id AND fc.is_current = TRUE
                LEFT JOIN agro.crops c ON c.id = fc.crop_id
                LEFT JOIN LATERAL (
                    SELECT geom, ST_Area(geom::geography) AS area_m2
                    FROM geo.field_crop_geometry
                    WHERE field_crop_id = fc.id
                    ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST
                    LIMIT 1
                ) fg_cur ON true
                LEFT JOIN LATERAL (
                    SELECT geom, area FROM stg.field_geom
                    WHERE base_id = f.id ORDER BY id DESC LIMIT 1
                ) fg_legacy ON true
                {where}
                ORDER BY f.created_at DESC
                LIMIT 200
                """,
                params,
            )
            cols = [d[0] for d in cur.description]
            rows = []
            for row in cur.fetchall():
                d = dict(zip(cols, row))
                if d.get("sowing_date"):
                    d["sowing_date"] = d["sowing_date"].isoformat()
                if d.get("area_ha") is not None:
                    d["area_ha"] = float(d["area_ha"])
                rows.append(d)
            return rows
    finally:
        conn.close()
