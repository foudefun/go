"""Import Swiss Alpine Club huts from the SAC route portal API.

The script previews by default. Pass --apply to write rows.
Coordinates from SAC are LV95 and are converted to WGS84 for the app.
"""

from __future__ import annotations

import argparse
import json
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


SAC_API_BASE = "https://www.suissealpine.sac-cas.ch/api/1"
SAC_ASSOCIATION_ID = 1


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def fetch_json(url: str) -> dict:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "rehab-outdoor-import/1.0"})
    with urlopen(request, timeout=45) as response:
        payload = response.read().decode("utf-8")
    data = json.loads(payload)
    if not isinstance(data, dict):
        raise ValueError(f"Expected object response from {url}")
    return data


def sac_search_url(limit: int, scope: str) -> str:
    params = {
        "mode": "per_discipline",
        "lang": "en",
        "type": "hut",
        "sortField": "display_name",
        "limit": limit,
    }
    if scope == "sac":
        params["association_id"] = SAC_ASSOCIATION_ID
        params["is_private"] = "false"
    query = urlencode(params)
    return f"{SAC_API_BASE}/poi/search?{query}"


def sac_detail_url(sac_id: int) -> str:
    return f"{SAC_API_BASE}/sacplus/poi/{sac_id}?output_lang=en"


def pick_text(value, language: str = "en") -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    if isinstance(value, dict):
        for key in (language, "de", "fr", "it"):
            text = value.get(key)
            if isinstance(text, str) and text.strip():
                return text.strip()
    return ""


def lv95_to_wgs84(easting: float, northing: float) -> tuple[float, float]:
    e_aux = (float(easting) - 2600000.0) / 1000000.0
    n_aux = (float(northing) - 1200000.0) / 1000000.0
    lat = (
        16.9023892
        + (3.238272 * n_aux)
        - (0.270978 * e_aux * e_aux)
        - (0.002528 * n_aux * n_aux)
        - (0.0447 * e_aux * e_aux * n_aux)
        - (0.0140 * n_aux * n_aux * n_aux)
    )
    lon = (
        2.6779094
        + (4.728982 * e_aux)
        + (0.791484 * e_aux * n_aux)
        + (0.1306 * e_aux * n_aux * n_aux)
        - (0.0436 * e_aux * e_aux * e_aux)
    )
    return round(lat * 100.0 / 36.0, 6), round(lon * 100.0 / 36.0, 6)


def month_list(month_flags: dict, active_values: set[int]) -> str:
    months = []
    for month in range(1, 13):
        value = month_flags.get(f"month_{month:02d}") if isinstance(month_flags, dict) else None
        if value in active_values:
            months.append(f"{month:02d}")
    return ", ".join(months)


def true_keys(value: dict) -> list[str]:
    if not isinstance(value, dict):
        return []
    return [key for key, enabled in sorted(value.items()) if enabled]


def first_photo_url(detail: dict) -> str:
    for item in detail.get("photos") or []:
        photo = item.get("photo") if isinstance(item, dict) else None
        if not isinstance(photo, dict):
            continue
        thumbnails = photo.get("thumbnails") or {}
        for key in ("1200x750", "500x313", "1800x1125"):
            if thumbnails.get(key):
                return str(thumbnails[key])
        if photo.get("url"):
            return str(photo["url"])
    return ""


def build_access_notes(detail: dict) -> str:
    lines = []
    owner = str(detail.get("owner") or "").strip()
    if owner:
        lines.append(f"Owner: {owner}")
    if detail.get("sleeps") is not None:
        lines.append(f"Sleeps: {detail.get('sleeps')}")
    opening = month_list(detail.get("opening") or {}, {1})
    if opening:
        lines.append(f"Open months: {opening}")
    catered = month_list(detail.get("catering") or {}, {1})
    if catered:
        lines.append(f"Catered months: {catered}")
    services = true_keys(detail.get("services") or {})
    if services:
        lines.append(f"Services: {', '.join(services)}")
    suitable = true_keys(detail.get("suitable") or {})
    if suitable:
        lines.append(f"Suitable for: {', '.join(suitable)}")
    opentext = pick_text(detail.get("opentext"))
    if opentext:
        lines.append(f"Notes: {opentext}")
    contact = []
    for label, key in (("Phone", "tel"), ("Email", "email"), ("Website", "url")):
        value = str(detail.get(key) or "").strip()
        if value:
            contact.append(f"{label}: {value}")
    if contact:
        lines.append("Contact: " + " | ".join(contact))
    association_id = detail.get("association_id")
    if association_id != SAC_ASSOCIATION_ID or detail.get("is_private") is not False:
        lines.append("Catalog: non-CAS hut POI from the SAC route portal.")
    return "\n".join(lines)


def build_references(detail: dict, now: str) -> list[dict]:
    sac_id = int(detail["id"])
    references = [
        {
            "source_type": "hut",
            "title": f"SAC route portal API: {pick_text(detail.get('display_name')) or sac_id}",
            "url": sac_detail_url(sac_id),
            "publisher": "Swiss Alpine Club SAC",
            "accessed_at": now[:10],
            "license_notes": "Imported from the public SAC route portal API for personal route-planning reference.",
            "notes": f"SAC POI id {sac_id}",
        }
    ]
    website = str(detail.get("url") or "").strip()
    if website.startswith("https://"):
        references.append(
            {
                "source_type": "hut",
                "title": "Hut website",
                "url": website,
                "publisher": str(detail.get("owner") or ""),
                "accessed_at": now[:10],
                "license_notes": "",
                "notes": "",
            }
        )
    photo_url = first_photo_url(detail)
    if photo_url.startswith("https://"):
        references.append(
            {
                "source_type": "website",
                "title": "SAC hut photo",
                "url": photo_url,
                "publisher": "Swiss Alpine Club SAC",
                "accessed_at": now[:10],
                "license_notes": "Photo URL from SAC route portal metadata; copyright remains with the listed SAC photographer/rightsholder.",
                "notes": "",
            }
        )
    return references


def build_hut_preview(detail: dict, now: str) -> dict:
    coordinates = (detail.get("geom") or {}).get("coordinates") or []
    latitude = None
    longitude = None
    coordinate_status = "unknown"
    if len(coordinates) >= 2:
        latitude, longitude = lv95_to_wgs84(coordinates[0], coordinates[1])
        coordinate_status = "approximate"

    name = pick_text(detail.get("display_name")) or pick_text(detail.get("geographical_name"))
    aliases = []
    for value in (detail.get("name_internet"), pick_text(detail.get("geographical_name"))):
        alias = str(value or "").strip()
        if alias and alias != name and alias not in aliases:
            aliases.append(alias)

    return {
        "sac_id": int(detail["id"]),
        "association_id": detail.get("association_id"),
        "is_private": bool(detail.get("is_private")),
        "name": name,
        "aliases_json": json.dumps(aliases, ensure_ascii=False),
        "latitude": latitude,
        "longitude": longitude,
        "elevation_meters": detail.get("altitude"),
        "coordinate_status": coordinate_status,
        "description": pick_text(detail.get("description")),
        "access_notes": build_access_notes(detail),
        "source_references": build_references(detail, now),
    }


def include_detail_for_scope(detail: dict, scope: str) -> bool:
    is_sac_hut = detail.get("association_id") == SAC_ASSOCIATION_ID and detail.get("is_private") is False
    if scope == "sac":
        return is_sac_hut
    if scope == "other":
        return not is_sac_hut
    return True


def fetch_sac_huts(limit: int, scope: str) -> list[dict]:
    search = fetch_json(sac_search_url(limit, scope))
    results = search.get("results") or []
    if not isinstance(results, list):
        raise ValueError("SAC hut search response did not include a results list")
    if search.get("cursor"):
        raise ValueError("SAC hut search returned a cursor; increase --limit before importing")
    details = []
    for row in results:
        sac_id = row.get("id")
        if sac_id is None:
            continue
        detail = fetch_json(sac_detail_url(int(sac_id)))
        if include_detail_for_scope(detail, scope):
            details.append(detail)
    return details


def ensure_user_exists(db, username: str) -> None:
    if not db.query(backend.UserModel).filter_by(username=username).first():
        raise ValueError(f"User '{username}' does not exist")


def replace_source_references(db, entity_id: int, references: list[dict], now: str) -> None:
    db.query(backend.OutdoorSourceReferenceModel).filter_by(entity_type="hut", entity_id=entity_id).delete()
    for reference in references:
        db.add(
            backend.OutdoorSourceReferenceModel(
                entity_type="hut",
                entity_id=entity_id,
                source_type=str(reference.get("source_type") or "hut"),
                title=str(reference.get("title") or ""),
                url=str(reference.get("url") or ""),
                author=str(reference.get("author") or ""),
                publisher=str(reference.get("publisher") or ""),
                published_at=str(reference.get("published_at") or ""),
                accessed_at=str(reference.get("accessed_at") or ""),
                license_notes=str(reference.get("license_notes") or ""),
                notes=str(reference.get("notes") or ""),
                created_at=now,
                updated_at=now,
            )
        )


def upsert_hut(db, username: str, preview: dict, now: str) -> str:
    row = db.query(backend.OutdoorHutModel).filter_by(username=username, name=preview["name"]).first()
    action = "updated" if row else "created"
    if not row:
        row = backend.OutdoorHutModel(username=username, name=preview["name"], created_at=now, updated_at=now)
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
    replace_source_references(db, row.id, preview["source_references"], now)
    return action


def import_sac_huts(username: str, apply: bool, limit: int, scope: str) -> int:
    now = utc_now_iso()
    details = fetch_sac_huts(limit, scope)
    previews = [build_hut_preview(detail, now) for detail in details]
    previews.sort(key=lambda item: item["name"].casefold())

    missing_coordinates = sum(1 for item in previews if item["latitude"] is None or item["longitude"] is None)
    print("SAC hut import")
    print(f"mode={'apply' if apply else 'preview'}")
    print(f"scope={scope}")
    print(f"username={username}")
    print(f"huts_ready={len(previews)}")
    print(f"missing_coordinates={missing_coordinates}")

    if not apply:
        print("\nPreview:")
        for item in previews[:20]:
            print(f"- {item['name']} ({item['elevation_meters']} m) {item['latitude']}, {item['longitude']}")
        if len(previews) > 20:
            print(f"- ... {len(previews) - 20} more")
        print("\nNo rows written. Re-run with --apply to import these huts.")
        return 0

    db = backend.SessionLocal()
    try:
        ensure_user_exists(db, username)
        created = 0
        updated = 0
        for preview in previews:
            action = upsert_hut(db, username, preview, now)
            if action == "created":
                created += 1
            else:
                updated += 1
        db.commit()
        print(f"\nImport complete: created={created}, updated={updated}")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--username", default=backend.DEFAULT_USERNAME, help="Existing users.username owner for imported rows")
    parser.add_argument("--apply", action="store_true", help="Write SAC huts to the database")
    parser.add_argument(
        "--scope",
        choices=["sac", "other", "all"],
        default="sac",
        help="Hut scope: sac imports CAS/SAC-associated huts, other imports the remaining hut POIs from the SAC route portal, all imports both.",
    )
    parser.add_argument("--limit", type=int, default=1000, help="Maximum hut rows to request from SAC")
    args = parser.parse_args()
    return import_sac_huts(args.username, args.apply, args.limit, args.scope)


if __name__ == "__main__":
    raise SystemExit(main())
