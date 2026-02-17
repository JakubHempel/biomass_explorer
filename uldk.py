"""
ULDK (Usługa Lokalizacji Działek Katastralnych) integration.
Proxies requests to the GUGiK cadastral parcel service and converts
WKT geometry responses to GeoJSON.

API docs: https://uldk.gugik.gov.pl/opis.html

Coordinate handling (GetParcelByXY):
  The ULDK API defaults to EPSG:2180 (PUWG 1992 — Polish national grid).
  Rather than relying on the ambiguous SRID parameter for EPSG:4326,
  we convert incoming WGS-84 (lat/lng) coordinates to EPSG:2180 with
  pyproj and send them in the API's native format.
  Output geometry is still requested as EPSG:4326 via the `srid` param.
"""

import logging
import requests
from pyproj import Transformer
from shapely import wkt
from shapely.geometry import mapping

log = logging.getLogger(__name__)

# Coordinate transformer:  WGS-84 (EPSG:4326)  →  PUWG 1992 (EPSG:2180)
# always_xy=True  ⇒  input/output order is (longitude, latitude) / (easting, northing)
_to_2180 = Transformer.from_crs("EPSG:4326", "EPSG:2180", always_xy=True)

ULDK_BASE = "https://uldk.gugik.gov.pl/"
TIMEOUT = 15  # seconds


# -------------------------------------------------------------------------
#  Shared helpers
# -------------------------------------------------------------------------

def _parse_uldk_response(text: str, fields: list[str], multi: bool = False) -> list[dict]:
    """Parse the raw text returned by ULDK.

    For multi-result endpoints (GetParcelByIdOrNr) the first line is the
    result count.  For single-result endpoints (GetParcelByXY) there is no
    count line — just a single data line on success or an error line
    (often starting with '-1') on failure.

    Each data line contains semicolon-separated values in the order given
    by the `result` query parameter.
    """
    lines = [l.strip() for l in text.strip().splitlines() if l.strip()]
    if not lines:
        log.warning("ULDK returned empty response")
        return []

    data_lines = lines
    if multi:
        # First line is the count; skip it
        first = lines[0]
        try:
            count = int(first)
        except ValueError:
            log.warning("ULDK multi-response first line is not a count: %r", first)
            count = 0
        if count == 0:
            log.info("ULDK returned count=0")
            return []
        data_lines = lines[1:]

    results = []
    for line in data_lines:
        # Skip ULDK error/status lines (e.g. "-1 Nie znaleziono obiektu")
        if line.startswith("-1") or line.startswith("ERROR"):
            log.info("ULDK error/status line: %r", line)
            continue
        # Skip pure-numeric status lines (e.g. "0" for success)
        stripped = line.strip()
        if stripped.isdigit() or (stripped.startswith("-") and stripped[1:].isdigit()):
            log.debug("ULDK numeric status line: %r", stripped)
            continue

        # Handle EWKT: ULDK returns geometry as "SRID=4326;POLYGON((...))".
        # Strip the SRID prefix so the WKT is a clean value.
        if stripped.upper().startswith("SRID="):
            semi_pos = stripped.index(";")
            stripped = stripped[semi_pos + 1:]
            log.debug("Stripped EWKT SRID prefix, line now starts with: %s", stripped[:60])

        # ULDK uses PIPE "|" as the field delimiter (not semicolon)
        parts = stripped.split("|")
        if len(parts) < len(fields):
            log.debug("ULDK line has fewer fields than expected (%d < %d): %r",
                       len(parts), len(fields), stripped[:120])
            continue
        row = {}
        for i, key in enumerate(fields):
            row[key] = parts[i].strip() if i < len(parts) else ""
        results.append(row)
    return results


def _wkt_to_geojson(wkt_str: str) -> dict | None:
    """Convert a WKT string to a GeoJSON geometry dict."""
    if not wkt_str or not wkt_str.strip():
        return None
    try:
        geom = wkt.loads(wkt_str)
        return mapping(geom)
    except Exception as exc:
        log.warning("Failed to parse WKT: %s — %r", exc, wkt_str[:120])
        return None


def _build_parcel_result(row: dict) -> dict | None:
    """Given a parsed row dict, return a clean result with GeoJSON."""
    geojson = _wkt_to_geojson(row.get("geom_wkt", ""))
    if not geojson:
        return None
    return {
        "geojson": geojson,
        "parcel_id": row.get("id", ""),
        "voivodeship": row.get("voivodeship", ""),
        "county": row.get("county", ""),
        "commune": row.get("commune", ""),
        "region": row.get("region", ""),
        "parcel": row.get("parcel", ""),
    }


# -------------------------------------------------------------------------
#  Public functions
# -------------------------------------------------------------------------

def search_parcel(query: str) -> dict:
    """Search for a cadastral parcel by ID or region-name + number.

    Uses the `GetParcelByIdOrNr` endpoint which accepts either:
      - a full parcel ID  (e.g. "141201_1.0001.6509")
      - region name + parcel number (e.g. "Krzewina 134")

    Returns a dict with `results` (list) and `count`.
    Each result contains `geojson`, `parcel_id`, `voivodeship`, `county`,
    `commune`, `region`, `parcel`.
    """
    fields = ["geom_wkt", "id", "voivodeship", "county", "commune", "region", "parcel"]
    params = {
        "request": "GetParcelByIdOrNr",
        "id": query,
        "result": ",".join(fields),
        "srid": "4326",
    }

    log.info("ULDK search_parcel → %s  params=%s", ULDK_BASE, params)
    resp = requests.get(ULDK_BASE, params=params, timeout=TIMEOUT)
    resp.raise_for_status()
    log.debug("ULDK search_parcel raw response:\n%s", resp.text[:500])

    rows = _parse_uldk_response(resp.text, fields, multi=True)
    results = []
    for row in rows:
        r = _build_parcel_result(row)
        if r:
            results.append(r)

    log.info("ULDK search_parcel → %d results", len(results))
    return {"count": len(results), "results": results}


def locate_parcel(lat: float, lng: float) -> dict:
    """Find the cadastral parcel at a given WGS-84 coordinate.

    Uses the `GetParcelByXY` endpoint.

    We convert the incoming WGS-84 (lat, lng) to EPSG:2180 (easting,
    northing) so the `xy` parameter uses the API's default coordinate
    system.  The *output* geometry is still requested in EPSG:4326 via
    the ``srid`` parameter.

    Returns a single-result dict (same structure as search_parcel results),
    or an empty result set if nothing is found.
    """
    fields = ["geom_wkt", "id", "voivodeship", "county", "commune", "region", "parcel"]

    # Convert WGS-84 → EPSG:2180  (always_xy: input = lng,lat → output = easting,northing)
    easting, northing = _to_2180.transform(lng, lat)
    xy_value = f"{easting:.1f},{northing:.1f}"
    log.info("ULDK locate_parcel: WGS84(%s, %s) → EPSG:2180(%s, %s)",
             lat, lng, easting, northing)

    params = {
        "request": "GetParcelByXY",
        "xy": xy_value,
        "result": ",".join(fields),
        "srid": "4326",          # return geometry in WGS-84
    }

    log.info("ULDK locate_parcel → %s  params=%s", ULDK_BASE, params)
    resp = requests.get(ULDK_BASE, params=params, timeout=TIMEOUT)
    resp.raise_for_status()
    log.debug("ULDK locate_parcel raw response:\n%s", resp.text[:500])

    rows = _parse_uldk_response(resp.text, fields, multi=False)
    if not rows:
        log.info("ULDK locate_parcel → no results for lat=%s lng=%s", lat, lng)
        return {"count": 0, "results": []}

    results = []
    for row in rows:
        r = _build_parcel_result(row)
        if r:
            results.append(r)

    log.info("ULDK locate_parcel → %d results", len(results))
    return {"count": len(results), "results": results}
