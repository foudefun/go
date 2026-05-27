"""Import public SAC route portal metadata into outdoor routes.

Preview is the default. Pass --apply to write rows.

This importer deliberately stores only public route metadata that maps cleanly to
the app model. It does not import protected guidebook text, map geometry, or
segments.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main as backend  # noqa: E402


SAC_API_BASE = "https://www.suissealpine.sac-cas.ch/api/1"

DISCIPLINE_TO_ACTIVITY = {
    "alpine_tour": "alpinism",
    "ski_tour": "ski_touring",
    "mountain_hiking": "hiking",
    "climbing": "outdoor_climbing",
    "via_ferrata": "outdoor_climbing",
    "snowshoe_tour": "hiking",
}

DISCIPLINE_TO_CATEGORY = {
    "alpine_tour": "normal_route",
    "ski_tour": "ski_tour",
    "mountain_hiking": "hike",
    "climbing": "climb",
    "via_ferrata": "climb",
    "snowshoe_tour": "hike",
}

LOCATION_MODEL_BY_TYPE = {
    "summit": backend.OutdoorSummitModel,
    "hut": backend.OutdoorHutModel,
    "trailhead": backend.OutdoorTrailheadModel,
    "parking": backend.OutdoorParkingModel,
    "station": backend.OutdoorStationModel,
    "pass": backend.OutdoorPassModel,
    "waypoint": backend.OutdoorWaypointModel,
    "other_location": backend.OutdoorOtherLocationModel,
}


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


def route_search_url(discipline: str, limit: int, cursor: str | None = None) -> str:
    params = {
        "mode": "per_discipline",
        "lang": "en",
        "output_lang": "en",
        "type": discipline,
        "limit": limit,
    }
    if cursor:
        params["cursor"] = cursor
    return f"{SAC_API_BASE}/route/search?{urlencode(params)}"


def route_count_url(discipline: str) -> str:
    return f"{SAC_API_BASE}/route/search_count?{urlencode({'mode': 'per_discipline', 'lang': 'en', 'type': discipline})}"


def route_detail_url(route_id: int) -> str:
    return f"{SAC_API_BASE}/route/{route_id}/published?output_lang=en"


def slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(value or "").lower()).strip("-")
    return slug or "route"


def normalize_location_key(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or "").casefold())
    ascii_text = "".join(character for character in normalized if not unicodedata.combining(character))
    ascii_text = ascii_text.replace("ß", "ss")
    ascii_text = re.sub(r"[^a-z0-9]+", " ", ascii_text)
    return " ".join(ascii_text.split())


def location_name_parts(value: str) -> set[str]:
    parts = {str(value or "")}
    for part in re.split(r"\s*/\s*|\s+or\s+|\s+oder\s+|\s+ou\s+", str(value or ""), flags=re.IGNORECASE):
        if part.strip():
            parts.add(part.strip())
    return {normalize_location_key(part) for part in parts if normalize_location_key(part)}


def compact_photos(value) -> list[dict]:
    photos = []
    for item in value or []:
        if not isinstance(item, dict):
            continue
        photo = item.get("photo") if isinstance(item.get("photo"), dict) else {}
        thumbnails = photo.get("thumbnails") or {}
        url = ""
        for key in ("1200x750", "500x313", "1800x1125"):
            if thumbnails.get(key):
                url = str(thumbnails[key])
                break
        if not url:
            url = str(photo.get("url") or "")
        photos.append(
            {
                "caption": pick_text(item.get("caption")),
                "url": url,
                "copyright": str(photo.get("copyright") or "").strip(),
                "season": str(photo.get("season") or "").strip(),
            }
        )
    return photos


def route_duration_minutes(detail: dict, row: dict) -> int | None:
    ascent = detail.get("ascent_time_max", row.get("ascent_time_max"))
    descent = detail.get("descent_time_max", row.get("descent_time_max"))
    values = [value for value in (ascent, descent) if isinstance(value, (int, float))]
    return int(sum(values)) if values else None


def merged_destination(detail: dict, row: dict) -> dict:
    row_destination = row.get("destination_poi") if isinstance(row.get("destination_poi"), dict) else {}
    detail_destination = detail.get("destination_poi") if isinstance(detail.get("destination_poi"), dict) else {}
    merged = dict(row_destination)
    for key, value in detail_destination.items():
        if value not in (None, "", [], {}):
            merged[key] = value
    return merged


def build_summary(detail: dict, row: dict, discipline: str) -> str:
    destination = merged_destination(detail, row)
    parts = []
    destination_name = pick_text(destination.get("display_name") or destination.get("geographical_name"))
    if destination_name:
        parts.append(f"Destination: {destination_name}")
    difficulty = detail.get("main_difficulty") or row.get("main_difficulty")
    if difficulty:
        parts.append(f"Grade: {difficulty}")
    gain = detail.get("ascent_altitude", row.get("ascent_altitude"))
    loss = detail.get("descent_altitude", row.get("descent_altitude"))
    if gain is not None:
        parts.append(f"Ascent: {gain} m")
    if loss is not None:
        parts.append(f"Descent: {loss} m")
    duration = route_duration_minutes(detail, row)
    if duration is not None:
        parts.append(f"Time: {duration} min")
    availability = detail.get("availability") or row.get("availability")
    if availability:
        parts.append(f"Availability: {availability}")
    parts.append(f"SAC discipline: {discipline}")
    return ". ".join(parts) + "."


def normalize_route(row: dict, detail: dict, discipline: str, now: str) -> dict:
    route_id = int(row.get("id") or detail.get("id"))
    destination = merged_destination(detail, row)
    title = pick_text(detail.get("title")) or pick_text(row.get("title")) or f"SAC route {route_id}"
    difficulty = detail.get("main_difficulty") or row.get("main_difficulty") or ""
    photos = compact_photos(detail.get("photos") or row.get("photos"))
    source_references = [
        {
            "source_type": "official_agency",
            "title": f"SAC route portal API: {title}",
            "url": route_detail_url(route_id),
            "publisher": "Swiss Alpine Club SAC",
            "accessed_at": now[:10],
            "license_notes": "Imported from the public SAC route portal API for personal route-planning reference.",
            "notes": f"SAC route id {route_id}; discipline={discipline}",
        }
    ]
    for photo in photos[:1]:
        if str(photo.get("url") or "").startswith("https://"):
            source_references.append(
                {
                    "source_type": "photo",
                    "title": photo.get("caption") or "SAC route photo",
                    "url": photo["url"],
                    "publisher": "Swiss Alpine Club SAC",
                    "accessed_at": now[:10],
                    "license_notes": "Photo URL from SAC route portal metadata; copyright remains with the listed photographer/rightsholder.",
                    "notes": photo.get("copyright") or "",
                }
            )
    return {
        "sac_route_id": route_id,
        "discipline": discipline,
        "slug": f"sac-{slugify(discipline)}-{route_id}",
        "name": title,
        "activity_type": DISCIPLINE_TO_ACTIVITY.get(discipline, "alpinism"),
        "route_category": DISCIPLINE_TO_CATEGORY.get(discipline, "other"),
        "summary": build_summary(detail, row, discipline),
        "description": "",
        "visibility": "private",
        "status": "draft",
        "distance_km": None,
        "elevation_gain_meters": detail.get("ascent_altitude", row.get("ascent_altitude")),
        "elevation_loss_meters": detail.get("descent_altitude", row.get("descent_altitude")),
        "min_elevation_meters": None,
        "max_elevation_meters": None,
        "estimated_duration_minutes": route_duration_minutes(detail, row),
        "difficulty_label": str(difficulty or ""),
        "destination_name": pick_text(destination.get("display_name") or destination.get("geographical_name")),
        "destination_type": destination.get("type") or "",
        "source_references": source_references,
    }


def fetch_search_rows(discipline: str, limit: int) -> list[dict]:
    rows = []
    cursor = None
    while len(rows) < limit:
        batch_limit = min(100, limit - len(rows))
        payload = fetch_json(route_search_url(discipline, batch_limit, cursor))
        batch = payload.get("results") or []
        if not isinstance(batch, list):
            raise ValueError("SAC route search response did not include a results list")
        rows.extend(batch)
        cursor = payload.get("cursor")
        if not cursor or not batch:
            break
    return rows[:limit]


def fetch_sac_route_previews(discipline: str, limit: int, include_details: bool = True) -> tuple[int | None, list[dict], list[dict]]:
    now = utc_now_iso()
    total = fetch_json(route_count_url(discipline)).get("count")
    rows = fetch_search_rows(discipline, limit)
    previews = []
    detail_errors = []
    for row in rows:
        detail = {}
        if include_details:
            route_id = row.get("id")
            try:
                detail = fetch_json(route_detail_url(int(route_id)))
            except Exception as exc:  # pragma: no cover - network diagnostics
                detail_errors.append({"id": route_id, "error": str(exc)})
        previews.append(normalize_route(row, detail, discipline, now))
    return total, previews, detail_errors


def ensure_user_exists(db, username: str) -> None:
    if not db.query(backend.UserModel).filter_by(username=username).first():
        raise ValueError(f"User '{username}' does not exist")


def row_location_keys(row) -> set[str]:
    keys = set()
    for key in location_name_parts(row.name):
        keys.add(key)
    try:
        aliases = json.loads(row.aliases_json or "[]")
    except (TypeError, json.JSONDecodeError):
        aliases = []
    for alias in aliases:
        if isinstance(alias, str):
            keys.update(location_name_parts(alias))
    return keys


def get_location_by_type_and_name(db, username: str, location_type: str, name: str):
    model = LOCATION_MODEL_BY_TYPE.get(location_type)
    if not model or not name:
        return None
    rows = db.query(model).filter_by(username=username).all()
    target_keys = location_name_parts(name)
    matches = [row for row in rows if target_keys & row_location_keys(row)]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        ranked = sorted(matches, key=lambda row: (float(row.elevation_meters or 0), -int(row.id or 0)), reverse=True)
        if len(ranked) < 2 or (ranked[0].elevation_meters or 0) != (ranked[1].elevation_meters or 0):
            return ranked[0]
    return None


def get_location_by_any_type_and_name(db, username: str, name: str):
    matches = []
    for location_type in LOCATION_MODEL_BY_TYPE:
        location = get_location_by_type_and_name(db, username, location_type, name)
        if location:
            matches.append((location_type, location))
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        ranked = sorted(matches, key=lambda item: (float(item[1].elevation_meters or 0), -int(item[1].id or 0)), reverse=True)
        if len(ranked) < 2 or (ranked[0][1].elevation_meters or 0) != (ranked[1][1].elevation_meters or 0):
            return ranked[0]
    return None, None


def replace_source_references(db, route_id: int, references: list[dict], now: str) -> None:
    db.query(backend.OutdoorSourceReferenceModel).filter_by(entity_type="route", entity_id=route_id).delete()
    for reference in references:
        db.add(
            backend.OutdoorSourceReferenceModel(
                entity_type="route",
                entity_id=route_id,
                source_type=str(reference.get("source_type") or "other"),
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


def upsert_route(db, username: str, preview: dict, now: str) -> tuple[str, backend.OutdoorRouteModel]:
    row = db.query(backend.OutdoorRouteModel).filter_by(username=username, slug=preview["slug"]).first()
    action = "updated" if row else "created"
    if not row:
        row = backend.OutdoorRouteModel(username=username, slug=preview["slug"], created_at=now, updated_at=now)
        db.add(row)
    row.name = preview["name"]
    row.activity_type = preview["activity_type"]
    row.route_category = preview["route_category"]
    row.summary = preview["summary"]
    row.description = preview["description"]
    row.visibility = preview["visibility"]
    row.status = preview["status"]
    row.distance_km = preview["distance_km"]
    row.elevation_gain_meters = preview["elevation_gain_meters"]
    row.elevation_loss_meters = preview["elevation_loss_meters"]
    row.min_elevation_meters = preview["min_elevation_meters"]
    row.max_elevation_meters = preview["max_elevation_meters"]
    row.estimated_duration_minutes = preview["estimated_duration_minutes"]
    row.difficulty_label = preview["difficulty_label"]
    row.updated_at = now
    db.flush()
    replace_source_references(db, row.id, preview["source_references"], now)
    return action, row


def upsert_destination_role(db, username: str, route_id: int, preview: dict, now: str) -> bool:
    location_type = preview["destination_type"]
    location_name = preview["destination_name"]
    location = get_location_by_type_and_name(db, username, location_type, location_name)
    if not location and not location_type:
        location_type, location = get_location_by_any_type_and_name(db, username, location_name)
    if not location:
        return False
    role = (
        db.query(backend.OutdoorRouteLocationRoleModel)
        .filter_by(
            entity_type="route",
            entity_id=route_id,
            location_entity_type=location_type,
            location_entity_id=location.id,
            role="main_objective",
        )
        .first()
    )
    if not role:
        role = backend.OutdoorRouteLocationRoleModel(
            entity_type="route",
            entity_id=route_id,
            location_entity_type=location_type,
            location_entity_id=location.id,
            role="main_objective",
            created_at=now,
            updated_at=now,
        )
        db.add(role)
    role.updated_at = now
    return True


def import_sac_routes(
    username: str,
    apply: bool,
    discipline: str,
    limit: int,
    include_details: bool = True,
) -> int:
    disciplines = sorted(DISCIPLINE_TO_ACTIVITY) if discipline == "all" else [discipline]
    all_previews = []
    totals = {}
    detail_errors = []
    for item in disciplines:
        total, previews, errors = fetch_sac_route_previews(item, limit, include_details=include_details)
        totals[item] = total
        all_previews.extend(previews)
        detail_errors.extend(errors)

    print("SAC route metadata import")
    print(f"mode={'apply' if apply else 'preview'}")
    print(f"username={username}")
    print(f"discipline={discipline}")
    print("api_total_count=" + json.dumps(totals, sort_keys=True))
    print(f"routes_ready={len(all_previews)}")
    print(f"detail_errors={len(detail_errors)}")

    if not apply:
        print("\nPreview:")
        for preview in all_previews[:20]:
            destination = f" -> {preview['destination_name']}" if preview["destination_name"] else ""
            print(
                f"- {preview['slug']} | {preview['name']} | {preview['difficulty_label'] or '-'}"
                f" | {preview['activity_type']}{destination}"
            )
        if len(all_previews) > 20:
            print(f"- ... {len(all_previews) - 20} more")
        print("\nNo rows written. Re-run with --apply to import these routes.")
        return 0

    db = backend.SessionLocal()
    try:
        ensure_user_exists(db, username)
        now = utc_now_iso()
        created = 0
        updated = 0
        linked_destinations = 0
        for preview in all_previews:
            action, route = upsert_route(db, username, preview, now)
            db.flush()
            if upsert_destination_role(db, username, route.id, preview, now):
                linked_destinations += 1
            if action == "created":
                created += 1
            else:
                updated += 1
        db.commit()
        print(f"\nImport complete: created={created}, updated={updated}, linked_destinations={linked_destinations}")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--username", default=backend.DEFAULT_USERNAME, help="Existing users.username owner for imported rows")
    parser.add_argument("--apply", action="store_true", help="Write SAC route metadata to the database")
    parser.add_argument("--discipline", default="alpine_tour", choices=["all", *sorted(DISCIPLINE_TO_ACTIVITY)])
    parser.add_argument("--limit", type=int, default=50, help="Maximum route rows to request per discipline")
    parser.add_argument("--no-details", action="store_true", help="Skip per-route public detail fetches")
    args = parser.parse_args()
    return import_sac_routes(args.username, args.apply, args.discipline, args.limit, include_details=not args.no_details)


if __name__ == "__main__":
    raise SystemExit(main())
