"""Import public Camptocamp route metadata into outdoor routes.

Preview is the default. Pass --apply to write rows. The importer stores route
metadata and linked waypoint/crag locations, not full guidebook text or topo
drawings.
"""

from __future__ import annotations

import argparse
import html
import json
import math
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


C2C_API_BASE = "https://api.camptocamp.org"
C2C_WEB_BASE = "https://www.camptocamp.org"
DEFAULT_AREA_ID = 14397  # Vaud administrative area
DEFAULT_ACTIVITY = "rock_climbing"
ACTIVITY_TO_APP_ACTIVITY = {
    "rock_climbing": "outdoor_climbing",
    "mountain_climbing": "alpinism",
    "ice_climbing": "outdoor_climbing",
    "via_ferrata": "outdoor_climbing",
    "skitouring": "ski_touring",
    "snow_ice_mixed": "alpinism",
    "hiking": "hiking",
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


def pick_locale(locales: list[dict] | None, language: str = "fr") -> dict:
    if not locales:
        return {}
    for lang in (language, "en", "de", "it"):
        for locale in locales:
            if locale.get("lang") == lang:
                return locale
    return locales[0] if isinstance(locales[0], dict) else {}


def compact_text(value) -> str:
    text = re.sub(r"<[^>]+>", " ", str(value or ""))
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def slugify(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or "").casefold())
    ascii_text = "".join(character for character in normalized if not unicodedata.combining(character))
    return re.sub(r"[^a-z0-9]+", "-", ascii_text).strip("-") or "route"


def c2c_route_url(route_id: int) -> str:
    return f"{C2C_WEB_BASE}/routes/{route_id}"


def c2c_waypoint_url(waypoint_id: int) -> str:
    return f"{C2C_WEB_BASE}/waypoints/{waypoint_id}"


def routes_url(area_id: int, activity: str, limit: int, offset: int = 0) -> str:
    params = {
        "act": activity,
        "a": area_id,
        "limit": limit,
        "offset": offset,
    }
    return f"{C2C_API_BASE}/routes?{urlencode(params)}"


def route_detail_url(route_id: int) -> str:
    return f"{C2C_API_BASE}/routes/{route_id}"


def web_mercator_to_wgs84(x: float, y: float) -> tuple[float, float]:
    longitude = (float(x) / 20037508.34) * 180
    latitude = (float(y) / 20037508.34) * 180
    latitude = (180 / math.pi) * (2 * math.atan(math.exp(latitude * math.pi / 180)) - math.pi / 2)
    return round(latitude, 6), round(longitude, 6)


def point_from_geometry(geometry: dict | None) -> tuple[float | None, float | None]:
    if not isinstance(geometry, dict):
        return None, None
    try:
        geom = json.loads(geometry.get("geom") or "{}")
    except (TypeError, json.JSONDecodeError):
        return None, None
    if geom.get("type") != "Point":
        return None, None
    coordinates = geom.get("coordinates") or []
    if len(coordinates) < 2:
        return None, None
    return web_mercator_to_wgs84(float(coordinates[0]), float(coordinates[1]))


def route_summary(row: dict, locale: dict, waypoint_name: str) -> str:
    parts = []
    prefix = compact_text(locale.get("title_prefix"))
    if prefix:
        parts.append(f"Sector: {prefix}")
    if waypoint_name and waypoint_name != prefix:
        parts.append(f"Waypoint: {waypoint_name}")
    if row.get("rock_free_rating"):
        parts.append(f"Free grade: {row['rock_free_rating']}")
    if row.get("rock_required_rating"):
        parts.append(f"Required grade: {row['rock_required_rating']}")
    if row.get("height_diff_difficulties") is not None:
        parts.append(f"Climbing height: {row['height_diff_difficulties']} m")
    if row.get("elevation_min") is not None or row.get("elevation_max") is not None:
        parts.append(f"Elevation: {row.get('elevation_min') or '-'}-{row.get('elevation_max') or '-'} m")
    if row.get("orientations"):
        parts.append(f"Orientation: {', '.join(row['orientations'])}")
    if row.get("equipment_rating"):
        parts.append(f"Equipment: {row['equipment_rating']}")
    if row.get("climbing_outdoor_type"):
        parts.append(f"Climbing type: {row['climbing_outdoor_type']}")
    parts.append("Source: Camptocamp public route metadata.")
    return ". ".join(parts) + "."


def linked_waypoint(detail: dict) -> dict:
    waypoints = (detail.get("associations") or {}).get("waypoints") or []
    for waypoint in waypoints:
        if waypoint.get("document_id") == detail.get("main_waypoint_id"):
            return waypoint
    return waypoints[0] if waypoints else {}


def normalize_route(row: dict, detail: dict | None, now: str) -> dict:
    detail = detail or {}
    route_id = int(row.get("document_id") or detail.get("document_id"))
    source = detail or row
    locale = pick_locale(source.get("locales"))
    title = compact_text(locale.get("title")) or f"Camptocamp route {route_id}"
    prefix = compact_text(locale.get("title_prefix"))
    name = f"{prefix} - {title}" if prefix and not title.startswith(prefix) else title
    waypoint = linked_waypoint(detail)
    waypoint_locale = pick_locale(waypoint.get("locales"))
    waypoint_name = compact_text(waypoint_locale.get("title")) or prefix
    waypoint_latitude, waypoint_longitude = point_from_geometry(waypoint.get("geometry"))
    route_latitude, route_longitude = point_from_geometry(source.get("geometry"))
    latitude = waypoint_latitude if waypoint_latitude is not None else route_latitude
    longitude = waypoint_longitude if waypoint_longitude is not None else route_longitude
    description = compact_text(locale.get("description"))
    activities = source.get("activities") or row.get("activities") or []
    activity = next((item for item in activities if item in ACTIVITY_TO_APP_ACTIVITY), DEFAULT_ACTIVITY)
    preview = {
        "camptocamp_route_id": route_id,
        "slug": f"c2c-{route_id}-{slugify(name)}",
        "name": name,
        "activity_type": ACTIVITY_TO_APP_ACTIVITY.get(activity, "outdoor_climbing"),
        "route_category": "climb",
        "summary": route_summary(source, locale, waypoint_name),
        "description": description,
        "visibility": "private",
        "status": "draft",
        "distance_km": None,
        "elevation_gain_meters": source.get("height_diff_up"),
        "elevation_loss_meters": source.get("height_diff_down"),
        "min_elevation_meters": source.get("elevation_min"),
        "max_elevation_meters": source.get("elevation_max"),
        "estimated_duration_minutes": None,
        "difficulty_label": str(source.get("rock_free_rating") or source.get("rock_required_rating") or ""),
        "waypoint": {
            "camptocamp_waypoint_id": waypoint.get("document_id"),
            "name": waypoint_name or prefix or f"Camptocamp waypoint {route_id}",
            "latitude": latitude,
            "longitude": longitude,
            "elevation_meters": waypoint.get("elevation") or source.get("elevation_min"),
            "description": f"Camptocamp climbing waypoint linked to Vaud route imports.",
            "access_notes": "Imported as a route reference point only. Check Camptocamp and local access information before planning.",
        },
        "source_references": [
            {
                "source_type": "community",
                "title": f"Camptocamp route: {name}",
                "url": c2c_route_url(route_id),
                "publisher": "Camptocamp.org",
                "accessed_at": now[:10],
                "license_notes": "Imported from public Camptocamp API metadata; attribution and source URL retained.",
                "notes": f"camptocamp_route_id={route_id}; activity={','.join(activities)}",
            }
        ],
    }
    waypoint_id = preview["waypoint"]["camptocamp_waypoint_id"]
    if waypoint_id:
        preview["waypoint"]["source_references"] = [
            {
                "source_type": "community",
                "title": f"Camptocamp waypoint: {preview['waypoint']['name']}",
                "url": c2c_waypoint_url(int(waypoint_id)),
                "publisher": "Camptocamp.org",
                "accessed_at": now[:10],
                "license_notes": "Imported from public Camptocamp API metadata; attribution and source URL retained.",
                "notes": f"camptocamp_waypoint_id={waypoint_id}",
            }
        ]
    else:
        preview["waypoint"]["source_references"] = []
    preview["pitch_count"] = len(backend.parse_pitch_segments_from_description(description))
    return preview


def fetch_camptocamp_route_previews(area_id: int, activity: str, limit: int, include_details: bool = True):
    now = utc_now_iso()
    payload = fetch_json(routes_url(area_id, activity, limit))
    rows = payload.get("documents") or []
    total = payload.get("total")
    previews = []
    detail_errors = []
    for row in rows[:limit]:
        detail = {}
        if include_details:
            route_id = row.get("document_id")
            try:
                detail = fetch_json(route_detail_url(int(route_id)))
            except Exception as exc:  # pragma: no cover - network diagnostics
                detail_errors.append({"id": route_id, "error": str(exc)})
        previews.append(normalize_route(row, detail, now))
    return total, previews, detail_errors


def ensure_user_exists(db, username: str) -> None:
    if not db.query(backend.UserModel).filter_by(username=username).first():
        raise ValueError(f"User '{username}' does not exist")


def upsert_other_location(db, username: str, waypoint: dict, now: str) -> backend.OutdoorOtherLocationModel:
    name = waypoint["name"]
    row = db.query(backend.OutdoorOtherLocationModel).filter_by(username=username, name=name).first()
    if not row:
        row = backend.OutdoorOtherLocationModel(username=username, name=name, created_at=now, updated_at=now)
        db.add(row)
    row.aliases_json = json.dumps([], ensure_ascii=False)
    row.latitude = waypoint["latitude"]
    row.longitude = waypoint["longitude"]
    row.elevation_meters = waypoint["elevation_meters"]
    row.coordinate_status = "approximate" if waypoint["latitude"] is not None and waypoint["longitude"] is not None else "unknown"
    row.description = waypoint["description"]
    row.access_notes = waypoint["access_notes"]
    row.updated_at = now
    db.flush()
    replace_source_references(db, "other_location", row.id, waypoint.get("source_references") or [], now)
    return row


def replace_source_references(db, entity_type: str, entity_id: int, references: list[dict], now: str) -> None:
    db.query(backend.OutdoorSourceReferenceModel).filter_by(entity_type=entity_type, entity_id=entity_id).delete()
    for reference in references:
        db.add(
            backend.OutdoorSourceReferenceModel(
                entity_type=entity_type,
                entity_id=entity_id,
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
    replace_source_references(db, "route", row.id, preview["source_references"], now)
    return action, row


def upsert_location_role(db, route_id: int, location_id: int, now: str) -> None:
    role = (
        db.query(backend.OutdoorRouteLocationRoleModel)
        .filter_by(
            entity_type="route",
            entity_id=route_id,
            location_entity_type="other_location",
            location_entity_id=location_id,
            role="main_objective",
        )
        .first()
    )
    if not role:
        role = backend.OutdoorRouteLocationRoleModel(
            entity_type="route",
            entity_id=route_id,
            location_entity_type="other_location",
            location_entity_id=location_id,
            role="main_objective",
            created_at=now,
            updated_at=now,
        )
        db.add(role)
    role.updated_at = now


def count_existing_pitch_segments(db, route_id: int) -> int:
    return (
        db.query(backend.OutdoorRouteSegmentModel)
        .join(backend.OutdoorRouteVariantModel, backend.OutdoorRouteSegmentModel.route_variant_id == backend.OutdoorRouteVariantModel.id)
        .filter(
            backend.OutdoorRouteVariantModel.route_id == route_id,
            backend.OutdoorRouteSegmentModel.segment_type == "pitch",
        )
        .count()
    )


def replace_pitch_segments(db, variant_id: int) -> None:
    segment_ids = [
        row.id
        for row in db.query(backend.OutdoorRouteSegmentModel.id)
        .filter_by(route_variant_id=variant_id, segment_type="pitch")
        .all()
    ]
    if segment_ids:
        db.query(backend.OutdoorSourceReferenceModel).filter(
            backend.OutdoorSourceReferenceModel.entity_type == "route_segment",
            backend.OutdoorSourceReferenceModel.entity_id.in_(segment_ids),
        ).delete(synchronize_session=False)
    db.query(backend.OutdoorRouteSegmentModel).filter_by(route_variant_id=variant_id, segment_type="pitch").delete()


def extract_pitches_for_route(db, route: backend.OutdoorRouteModel, now: str, replace_existing: bool = False) -> str:
    pitches = backend.parse_pitch_segments_from_description(route.description or "")
    if not pitches:
        return "none"
    variant = backend.ensure_route_pitch_variant(db, route, now)
    existing_count = count_existing_pitch_segments(db, route.id)
    if existing_count and not replace_existing:
        return "skipped"
    if existing_count and replace_existing:
        replace_pitch_segments(db, variant.id)
    for pitch in pitches:
        db.add(
            backend.OutdoorRouteSegmentModel(
                route_variant_id=variant.id,
                order_index=pitch["order_index"],
                segment_type=pitch["segment_type"],
                name=pitch["name"],
                difficulty_label=pitch["difficulty_label"],
                description=pitch["description"],
                notes=pitch["notes"],
                created_at=now,
                updated_at=now,
            )
        )
    variant.updated_at = now
    route.updated_at = now
    return "created" if not existing_count else "replaced"


def import_camptocamp_routes(
    username: str,
    apply: bool,
    area_id: int,
    activity: str,
    limit: int,
    include_details: bool = True,
    extract_pitches: bool = False,
    replace_pitches: bool = False,
) -> int:
    total, previews, detail_errors = fetch_camptocamp_route_previews(area_id, activity, limit, include_details)
    print("Camptocamp route metadata import")
    print(f"mode={'apply' if apply else 'preview'}")
    print(f"username={username}")
    print(f"area_id={area_id}")
    print(f"activity={activity}")
    print(f"extract_pitches={extract_pitches}")
    print(f"replace_pitches={replace_pitches}")
    print(f"api_total_count={total}")
    print(f"routes_ready={len(previews)}")
    print(f"detail_errors={len(detail_errors)}")
    pitch_ready_count = sum(1 for preview in previews if int(preview.get("pitch_count") or 0) > 0)
    pitch_total_count = sum(int(preview.get("pitch_count") or 0) for preview in previews)
    print(f"routes_with_detected_pitches={pitch_ready_count}")
    print(f"detected_pitch_total={pitch_total_count}")

    if not apply:
        print("\nPreview:")
        for preview in previews[:20]:
            waypoint = preview["waypoint"]["name"]
            print(
                f"- {preview['slug']} | {preview['name']} | {preview['difficulty_label'] or '-'}"
                f" | waypoint={waypoint} | coords={preview['waypoint']['latitude']},{preview['waypoint']['longitude']}"
                f" | pitches={preview.get('pitch_count') or 0}"
            )
        if len(previews) > 20:
            print(f"- ... {len(previews) - 20} more")
        if extract_pitches:
            print(f"\nPitch extraction preview: {pitch_ready_count} route(s), {pitch_total_count} pitch segment(s) detected.")
        print("\nNo rows written. Re-run with --apply to import these routes.")
        return 0

    db = backend.SessionLocal()
    try:
        ensure_user_exists(db, username)
        now = utc_now_iso()
        created = 0
        updated = 0
        locations = 0
        pitches_created = 0
        pitches_replaced = 0
        pitches_skipped = 0
        pitches_none = 0
        for preview in previews:
            route_action, route = upsert_route(db, username, preview, now)
            location = upsert_other_location(db, username, preview["waypoint"], now)
            upsert_location_role(db, route.id, location.id, now)
            locations += 1
            if extract_pitches:
                pitch_action = extract_pitches_for_route(db, route, now, replace_existing=replace_pitches)
                if pitch_action == "created":
                    pitches_created += 1
                elif pitch_action == "replaced":
                    pitches_replaced += 1
                elif pitch_action == "skipped":
                    pitches_skipped += 1
                else:
                    pitches_none += 1
            if route_action == "created":
                created += 1
            else:
                updated += 1
        db.commit()
        print(f"\nImport complete: created={created}, updated={updated}, linked_locations={locations}")
        if extract_pitches:
            print(
                "Pitch extraction: "
                f"created={pitches_created}, replaced={pitches_replaced}, skipped_existing={pitches_skipped}, no_pitches={pitches_none}"
            )
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--username", default=backend.DEFAULT_USERNAME, help="Existing users.username owner for imported rows")
    parser.add_argument("--apply", action="store_true", help="Write Camptocamp route metadata to the database")
    parser.add_argument("--area-id", type=int, default=DEFAULT_AREA_ID, help="Camptocamp area id, default Vaud")
    parser.add_argument("--activity", default=DEFAULT_ACTIVITY, help="Camptocamp activity key, default rock_climbing")
    parser.add_argument("--limit", type=int, default=50, help="Maximum route rows to request")
    parser.add_argument("--no-details", action="store_true", help="Skip per-route public detail fetches")
    parser.add_argument("--extract-pitches", action="store_true", help="Extract L# pitch lines into route segments during apply")
    parser.add_argument("--replace-pitches", action="store_true", help="Replace existing pitch segments when extracting")
    args = parser.parse_args()
    return import_camptocamp_routes(
        username=args.username,
        apply=args.apply,
        area_id=args.area_id,
        activity=args.activity,
        limit=args.limit,
        include_details=not args.no_details,
        extract_pitches=args.extract_pitches,
        replace_pitches=args.replace_pitches,
    )


if __name__ == "__main__":
    raise SystemExit(main())
