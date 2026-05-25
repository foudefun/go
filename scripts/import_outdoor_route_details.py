"""Import route variants, segments, and route-location roles.

This is for the second-stage route detail payloads where the base route and
locations already exist. Preview is the default; pass --apply to write rows.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import urlparse


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main as backend  # noqa: E402


LOCATION_MODEL_BY_TYPE = {
    "summit": backend.OutdoorSummitModel,
    "trailhead": backend.OutdoorTrailheadModel,
    "parking": backend.OutdoorParkingModel,
    "hut": backend.OutdoorHutModel,
    "station": backend.OutdoorStationModel,
    "pass": backend.OutdoorPassModel,
    "waypoint": backend.OutdoorWaypointModel,
    "other_location": backend.OutdoorOtherLocationModel,
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def load_payload(path: Path) -> dict:
    with path.open("r", encoding="utf-8-sig") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError("Top-level JSON must be an object")
    return payload


def is_plain_https_url(value: str) -> bool:
    parsed = urlparse(str(value or ""))
    return parsed.scheme == "https" and bool(parsed.netloc)


def validate_source_references(item: dict, label: str) -> list[str]:
    issues = []
    references = item.get("source_references", [])
    if references is None:
        return issues
    if not isinstance(references, list):
        return [f"{label}: source_references must be a list"]
    for index, reference in enumerate(references, start=1):
        if not isinstance(reference, dict):
            issues.append(f"{label}: source reference {index} must be an object")
            continue
        url = str(reference.get("url", "") or "").strip()
        notes = str(reference.get("notes", "") or "")
        if url and not is_plain_https_url(url):
            issues.append(f"{label}: source reference {index} has non-plain https URL: {url}")
        if "[" in url or "]" in url or "[" in notes or "]" in notes:
            issues.append(f"{label}: source reference {index} contains Markdown artifacts")
    return issues


def hours_to_minutes(value) -> int | None:
    if value is None or value == "":
        return None
    return round(float(value) * 60)


def build_preview(payload: dict) -> tuple[dict | None, list[dict], list[dict], list[dict], list[str], list[str]]:
    issues = []
    warnings = []
    route = payload.get("route")
    if not isinstance(route, dict):
        return None, [], [], [], ["Top-level route must be an object"], warnings
    route_name = str(route.get("name", "") or "").strip()
    if not route_name:
        issues.append("route.name is required")
    route_preview = {"name": route_name}

    variants = payload.get("route_variants", [])
    if not isinstance(variants, list):
        issues.append("route_variants must be a list")
        variants = []
    variant_previews = []
    known_variant_names = set()
    for index, variant in enumerate(variants, start=1):
        label = f"route variant {index}"
        if not isinstance(variant, dict):
            issues.append(f"{label}: must be an object")
            continue
        name = str(variant.get("name", "") or "").strip()
        variant_type = str(variant.get("variant_type", "") or "other").strip()
        if not name:
            issues.append(f"{label}: name is required")
        if variant_type not in backend.OUTDOOR_ROUTE_VARIANT_TYPES:
            issues.append(f"{label} '{name}': unsupported variant_type '{variant_type}'")
        issues.extend(validate_source_references(variant, f"{label} '{name}'"))
        preview = {
            "name": name,
            "variant_type": variant_type,
            "distance_km": variant.get("distance_km"),
            "elevation_gain_meters": variant.get("elevation_gain_meters"),
            "elevation_loss_meters": variant.get("elevation_loss_meters"),
            "min_elevation_meters": variant.get("min_elevation_meters"),
            "max_elevation_meters": variant.get("max_elevation_meters"),
            "estimated_duration_minutes": variant.get("estimated_duration_minutes")
            or hours_to_minutes(variant.get("estimated_duration_hours")),
            "route_shape": str(variant.get("route_shape") or "other"),
            "geometry": backend.normalize_line_string_geometry(variant.get("geometry") or variant.get("geometry_json")),
            "summary": str(variant.get("summary", "") or ""),
            "description": str(variant.get("description", "") or ""),
            "recommended_direction": str(variant.get("recommended_direction", "") or ""),
            "difficulty_label": str(variant.get("difficulty_label", "") or ""),
            "exposure_level": str(variant.get("exposure_level", "") or ""),
            "commitment_level": str(variant.get("commitment_level", "") or ""),
            "source_references": variant.get("source_references") or [],
        }
        if preview["route_shape"] not in backend.OUTDOOR_ROUTE_SHAPES:
            issues.append(f"{label} '{name}': unsupported route_shape '{preview['route_shape']}'")
        if (variant.get("geometry") or variant.get("geometry_json")) and not preview["geometry"]:
            issues.append(f"{label} '{name}': geometry must be a GeoJSON LineString or coordinate array")
        variant_previews.append(preview)
        known_variant_names.add(name)

    segments = payload.get("route_segments", [])
    if not isinstance(segments, list):
        issues.append("route_segments must be a list")
        segments = []
    segment_previews = []
    for index, segment in enumerate(segments, start=1):
        label = f"route segment {index}"
        if not isinstance(segment, dict):
            issues.append(f"{label}: must be an object")
            continue
        variant_name = str(segment.get("variant_name", "") or "").strip()
        name = str(segment.get("name", "") or "").strip()
        segment_type = str(segment.get("segment_type", "") or "other").strip()
        if not variant_name:
            issues.append(f"{label}: variant_name is required")
        elif variant_name not in known_variant_names:
            issues.append(f"{label} '{name}': references unknown variant '{variant_name}'")
        if not name:
            issues.append(f"{label}: name is required")
        if segment_type not in backend.OUTDOOR_ROUTE_SEGMENT_TYPES:
            issues.append(f"{label} '{name}': unsupported segment_type '{segment_type}'")
        issues.extend(validate_source_references(segment, f"{label} '{name}'"))
        segment_previews.append(
            {
                "variant_name": variant_name,
                "order_index": int(segment.get("order_index") or index),
                "segment_type": segment_type,
                "name": name,
                "description": str(segment.get("description", "") or ""),
                "distance_km": segment.get("distance_km"),
                "elevation_gain_meters": segment.get("elevation_gain_meters"),
                "elevation_loss_meters": segment.get("elevation_loss_meters"),
                "estimated_duration_minutes": segment.get("estimated_duration_minutes")
                or hours_to_minutes(segment.get("typical_duration_hours")),
                "difficulty_label": str(segment.get("difficulty_label", "") or ""),
                "notes": str(segment.get("required_gear_notes", "") or ""),
                "source_references": segment.get("source_references") or [],
            }
        )

    roles = payload.get("route_location_roles_suggestions", [])
    if not isinstance(roles, list):
        issues.append("route_location_roles_suggestions must be a list")
        roles = []
    role_previews = []
    for index, role in enumerate(roles, start=1):
        label = f"route location role {index}"
        if not isinstance(role, dict):
            issues.append(f"{label}: must be an object")
            continue
        location_type = str(role.get("location_entity_type", "") or "").strip()
        role_value = str(role.get("role", "") or "").strip()
        location_name = str(role.get("location_name", "") or "").strip()
        if location_type not in LOCATION_MODEL_BY_TYPE:
            issues.append(f"{label}: unsupported location_entity_type '{location_type}'")
        if role_value not in backend.OUTDOOR_ROUTE_LOCATION_ROLES:
            issues.append(f"{label}: unsupported role '{role_value}'")
        if not location_name:
            issues.append(f"{label}: location_name is required")
        role_previews.append(
            {
                "location_entity_type": location_type,
                "location_name": location_name,
                "role": role_value,
                "order_index": role.get("order_index"),
                "notes": str(role.get("notes", "") or ""),
            }
        )

    return route_preview, variant_previews, segment_previews, role_previews, issues, warnings


def ensure_user_exists(db, username: str) -> None:
    if not db.query(backend.UserModel).filter_by(username=username).first():
        raise ValueError(f"User '{username}' does not exist")


def get_location_by_type_and_name(db, username: str, location_type: str, name: str):
    model = LOCATION_MODEL_BY_TYPE[location_type]
    return db.query(model).filter_by(username=username, name=name).first()


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


def upsert_variant(db, route_id: int, preview: dict, now: str) -> tuple[str, backend.OutdoorRouteVariantModel]:
    row = db.query(backend.OutdoorRouteVariantModel).filter_by(route_id=route_id, name=preview["name"]).first()
    action = "updated" if row else "created"
    if not row:
        row = backend.OutdoorRouteVariantModel(route_id=route_id, name=preview["name"], created_at=now, updated_at=now)
        db.add(row)
    row.variant_type = preview["variant_type"]
    row.distance_km = preview["distance_km"]
    row.elevation_gain_meters = preview["elevation_gain_meters"]
    row.elevation_loss_meters = preview["elevation_loss_meters"]
    row.min_elevation_meters = preview["min_elevation_meters"]
    row.max_elevation_meters = preview["max_elevation_meters"]
    row.estimated_duration_minutes = preview["estimated_duration_minutes"]
    row.route_shape = preview["route_shape"]
    row.geometry_json = json.dumps(preview["geometry"], ensure_ascii=False) if preview["geometry"] else ""
    row.summary = preview["summary"]
    row.description = preview["description"]
    row.recommended_direction = preview["recommended_direction"]
    row.difficulty_label = preview["difficulty_label"]
    row.exposure_level = preview["exposure_level"]
    row.commitment_level = preview["commitment_level"]
    row.updated_at = now
    return action, row


def upsert_route_location_role(db, route_id: int, role_preview: dict, location_id: int, now: str) -> None:
    row = (
        db.query(backend.OutdoorRouteLocationRoleModel)
        .filter_by(
            entity_type="route",
            entity_id=route_id,
            location_entity_type=role_preview["location_entity_type"],
            location_entity_id=location_id,
            role=role_preview["role"],
        )
        .first()
    )
    if not row:
        row = backend.OutdoorRouteLocationRoleModel(
            entity_type="route",
            entity_id=route_id,
            location_entity_type=role_preview["location_entity_type"],
            location_entity_id=location_id,
            role=role_preview["role"],
            created_at=now,
            updated_at=now,
        )
        db.add(row)
    row.order_index = role_preview["order_index"]
    row.notes = role_preview["notes"]
    row.updated_at = now


def import_details(path: Path, username: str, apply: bool = False) -> int:
    payload = load_payload(path)
    route_preview, variant_previews, segment_previews, role_previews, issues, warnings = build_preview(payload)
    db = backend.SessionLocal()
    try:
        route = None
        if route_preview:
            route = db.query(backend.OutdoorRouteModel).filter_by(username=username, name=route_preview["name"]).first()
            if not route:
                issues.append(f"route '{route_preview['name']}' is not imported")
        for role_preview in role_previews:
            if role_preview["location_entity_type"] not in LOCATION_MODEL_BY_TYPE:
                continue
            if not get_location_by_type_and_name(
                db, username, role_preview["location_entity_type"], role_preview["location_name"]
            ):
                issues.append(
                    f"role '{role_preview['role']}': location '{role_preview['location_name']}' "
                    f"({role_preview['location_entity_type']}) is not imported"
                )

        print("Outdoor route detail import")
        print(f"mode={'apply' if apply else 'preview'}")
        print(f"username={username}")
        print(f"route={route_preview['name'] if route_preview else ''}")
        print(f"variants_ready={len(variant_previews)}")
        print(f"segments_ready={len(segment_previews)}")
        print(f"route_location_roles_ready={len(role_previews)}")
        print(f"warnings={len(warnings)}")
        print(f"errors={len(issues)}")

        if warnings:
            print("\nWarnings:")
            for warning in warnings:
                print(f"- {warning}")
        if issues:
            print("\nErrors:")
            for issue in issues:
                print(f"- {issue}")
            print("\nNo rows written.")
            return 1
        if not apply:
            print("\nNo rows written. Re-run with --apply to import these route details.")
            return 0

        ensure_user_exists(db, username)
        now = utc_now_iso()
        variants_created = 0
        variants_updated = 0
        variant_rows = {}
        for preview in variant_previews:
            action, variant = upsert_variant(db, route.id, preview, now)
            db.flush()
            db.query(backend.OutdoorRouteSegmentModel).filter_by(route_variant_id=variant.id).delete()
            replace_source_references(db, "route_variant", variant.id, preview["source_references"], now)
            variant_rows[preview["name"]] = variant
            if action == "created":
                variants_created += 1
            else:
                variants_updated += 1

        segments_created = 0
        for preview in segment_previews:
            variant = variant_rows[preview["variant_name"]]
            segment = backend.OutdoorRouteSegmentModel(
                route_variant_id=variant.id,
                order_index=preview["order_index"],
                segment_type=preview["segment_type"],
                name=preview["name"],
                description=preview["description"],
                distance_km=preview["distance_km"],
                elevation_gain_meters=preview["elevation_gain_meters"],
                elevation_loss_meters=preview["elevation_loss_meters"],
                estimated_duration_minutes=preview["estimated_duration_minutes"],
                difficulty_label=preview["difficulty_label"],
                notes=preview["notes"],
                created_at=now,
                updated_at=now,
            )
            db.add(segment)
            db.flush()
            replace_source_references(db, "route_segment", segment.id, preview["source_references"], now)
            segments_created += 1

        for role_preview in role_previews:
            location = get_location_by_type_and_name(
                db, username, role_preview["location_entity_type"], role_preview["location_name"]
            )
            upsert_route_location_role(db, route.id, role_preview, location.id, now)

        db.commit()
        print(
            "\nImport complete: "
            f"variants_created={variants_created}, variants_updated={variants_updated}, "
            f"segments_created={segments_created}, route_location_roles={len(role_previews)}"
        )
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("json_path", type=Path, help="Path to the route detail JSON file")
    parser.add_argument("--username", default=backend.DEFAULT_USERNAME, help="Existing users.username owner")
    parser.add_argument("--apply", action="store_true", help="Write validated details to the database")
    args = parser.parse_args()
    return import_details(args.json_path, args.username, args.apply)


if __name__ == "__main__":
    raise SystemExit(main())
