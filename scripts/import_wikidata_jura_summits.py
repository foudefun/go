"""Import Jura Mountains summits from Wikidata.

Preview is the default. Pass --apply to write rows.

The importer uses Wikidata items with mountain range (P4552) = Jura Mountains
(Q178611), instance/subclass of mountain (Q8502), and WGS84 coordinates.
Coordinates are stored as approximate display/search points.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
if not (BACKEND_DIR / "app").exists() and (REPO_ROOT / "app").exists():
    BACKEND_DIR = REPO_ROOT
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main as backend  # noqa: E402


WIKIDATA_SPARQL_URL = "https://query.wikidata.org/sparql"
WIKIDATA_JURA_MOUNTAINS_QID = "Q178611"
USER_AGENT = "rehab-outdoor-import/1.0 (personal outdoor database)"


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def wikidata_query(limit: int) -> str:
    return f"""
SELECT ?item ?itemLabel ?coord ?elevation ?countryLabel WHERE {{
  ?item wdt:P31/wdt:P279* wd:Q8502.
  ?item wdt:P4552 wd:{WIKIDATA_JURA_MOUNTAINS_QID}.
  ?item wdt:P625 ?coord.
  OPTIONAL {{ ?item wdt:P2044 ?elevation. }}
  OPTIONAL {{ ?item wdt:P17 ?country. }}
  SERVICE wikibase:label {{ bd:serviceParam wikibase:language "en,fr,de,it". }}
}}
ORDER BY DESC(?elevation) ?itemLabel
LIMIT {int(limit)}
""".strip()


def fetch_wikidata_rows(limit: int) -> list[dict]:
    url = f"{WIKIDATA_SPARQL_URL}?{urlencode({'query': wikidata_query(limit), 'format': 'json'})}"
    request = Request(url, headers={"Accept": "application/sparql-results+json", "User-Agent": USER_AGENT})
    with urlopen(request, timeout=60) as response:
        payload = response.read().decode("utf-8")
    data = json.loads(payload)
    rows = data.get("results", {}).get("bindings", [])
    if not isinstance(rows, list):
        raise ValueError("Unexpected Wikidata SPARQL response shape")
    return rows


def value(binding: dict, key: str) -> str:
    item = binding.get(key)
    if not isinstance(item, dict):
        return ""
    return str(item.get("value") or "").strip()


def qid_from_uri(uri: str) -> str:
    return str(uri or "").rstrip("/").split("/")[-1]


def parse_point(value_: str) -> tuple[float, float]:
    match = re.fullmatch(r"Point\(([-0-9.]+)\s+([-0-9.]+)\)", str(value_ or "").strip())
    if not match:
        raise ValueError(f"Unsupported coordinate value: {value_}")
    longitude = round(float(match.group(1)), 6)
    latitude = round(float(match.group(2)), 6)
    return latitude, longitude


def parse_elevation(value_: str) -> float | None:
    if not value_:
        return None
    try:
        return float(value_)
    except ValueError:
        return None


def better_candidate(existing: dict, incoming: dict) -> dict:
    existing_elevation = existing.get("elevation_meters")
    incoming_elevation = incoming.get("elevation_meters")
    if existing_elevation is None and incoming_elevation is not None:
        return incoming
    if existing_elevation is not None and incoming_elevation is not None and incoming_elevation > existing_elevation:
        return incoming
    return existing


def build_summit_previews(rows: list[dict]) -> list[dict]:
    by_qid: dict[str, dict] = {}
    for row in rows:
        qid = qid_from_uri(value(row, "item"))
        name = value(row, "itemLabel")
        coord = value(row, "coord")
        if not qid or not name or not coord:
            continue
        latitude, longitude = parse_point(coord)
        elevation = parse_elevation(value(row, "elevation"))
        country = value(row, "countryLabel")
        description_parts = ["Summit in the Jura Mountains."]
        if country:
            description_parts.append(f"Country context: {country}.")
        if elevation is not None:
            description_parts.append(f"Elevation: {elevation:g} m.")
        candidate = {
            "wikidata_qid": qid,
            "name": name,
            "aliases_json": "[]",
            "latitude": latitude,
            "longitude": longitude,
            "elevation_meters": elevation,
            "coordinate_status": "approximate",
            "description": " ".join(description_parts),
            "access_notes": "",
            "source_url": f"https://www.wikidata.org/wiki/{qid}",
            "country": country,
        }
        by_qid[qid] = better_candidate(by_qid[qid], candidate) if qid in by_qid else candidate
    return sorted(
        by_qid.values(),
        key=lambda item: (-(item["elevation_meters"] or 0), item["name"].casefold(), item["wikidata_qid"]),
    )


def ensure_user_exists(db, username: str) -> None:
    if not db.query(backend.UserModel).filter_by(username=username).first():
        raise ValueError(f"User '{username}' does not exist")


def values_conflict(existing: float | None, incoming: float | None, tolerance: float) -> bool:
    if existing is None or incoming is None:
        return existing != incoming
    return abs(float(existing) - float(incoming)) > tolerance


def existing_source_reference(db, summit_id: int, qid: str):
    return (
        db.query(backend.OutdoorSourceReferenceModel)
        .filter_by(entity_type="summit", entity_id=summit_id, source_type="website")
        .filter(backend.OutdoorSourceReferenceModel.url == f"https://www.wikidata.org/wiki/{qid}")
        .first()
    )


def upsert_source_reference(db, summit_id: int, preview: dict, now: str) -> None:
    reference = existing_source_reference(db, summit_id, preview["wikidata_qid"])
    if not reference:
        reference = backend.OutdoorSourceReferenceModel(
            entity_type="summit",
            entity_id=summit_id,
            source_type="website",
            created_at=now,
            updated_at=now,
        )
        db.add(reference)
    reference.title = f"Wikidata: {preview['name']}"
    reference.url = preview["source_url"]
    reference.publisher = "Wikidata"
    reference.accessed_at = now[:10]
    reference.license_notes = "Wikidata entity metadata is published under CC0; verify coordinates before navigation use."
    reference.notes = f"Wikidata item {preview['wikidata_qid']}; mountain range=Jura Mountains ({WIKIDATA_JURA_MOUNTAINS_QID})."
    reference.updated_at = now


def upsert_summit(db, username: str, preview: dict, now: str) -> str:
    row = db.query(backend.OutdoorSummitModel).filter_by(username=username, name=preview["name"]).first()
    action = "updated" if row else "created"
    if row and (
        values_conflict(row.latitude, preview["latitude"], 0.001)
        or values_conflict(row.longitude, preview["longitude"], 0.001)
        or values_conflict(row.elevation_meters, preview["elevation_meters"], 10)
    ):
        return "conflict"
    if not row:
        row = backend.OutdoorSummitModel(username=username, name=preview["name"], created_at=now, updated_at=now)
        db.add(row)
        db.flush()
    row.aliases_json = preview["aliases_json"]
    row.latitude = preview["latitude"]
    row.longitude = preview["longitude"]
    row.elevation_meters = preview["elevation_meters"]
    row.coordinate_status = preview["coordinate_status"]
    row.description = preview["description"]
    row.access_notes = preview["access_notes"]
    row.updated_at = now
    upsert_source_reference(db, row.id, preview, now)
    return action


def import_jura_summits(username: str, limit: int, apply: bool) -> int:
    previews = build_summit_previews(fetch_wikidata_rows(limit))
    print("Wikidata Jura summit import")
    print(f"mode={'apply' if apply else 'preview'}")
    print(f"username={username}")
    print(f"summits_ready={len(previews)}")
    if previews:
        print("\nPreview sample:")
        for preview in previews[:10]:
            elevation = preview["elevation_meters"]
            elevation_text = f"{elevation:g} m" if elevation is not None else "unknown elevation"
            print(f"- {preview['name']} ({elevation_text}) {preview['latitude']}, {preview['longitude']}")
    if not apply:
        print("\nNo rows written. Re-run with --apply to import these summits.")
        return 0

    db = backend.SessionLocal()
    try:
        ensure_user_exists(db, username)
        now = utc_now_iso()
        created = 0
        updated = 0
        conflicts = []
        for preview in previews:
            action = upsert_summit(db, username, preview, now)
            if action == "created":
                created += 1
            elif action == "updated":
                updated += 1
            else:
                conflicts.append(preview["name"])
        db.commit()
        print(f"\nImport complete: created={created}, updated={updated}, conflicts={len(conflicts)}")
        if conflicts:
            print("Conflicts skipped:")
            for name in conflicts[:20]:
                print(f"- {name}")
        return 0 if not conflicts else 1
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--username", default=backend.DEFAULT_USERNAME, help="Existing users.username owner for imported rows")
    parser.add_argument("--limit", type=int, default=300, help="Maximum raw Wikidata rows to request")
    parser.add_argument("--apply", action="store_true", help="Write validated summits to the database")
    args = parser.parse_args()
    return import_jura_summits(username=args.username, limit=args.limit, apply=args.apply)


if __name__ == "__main__":
    raise SystemExit(main())
