"""Import validated outdoor route inventory JSON into Phase 2 route tables.

The script previews by default. Pass --apply to write rows.
Each route is linked to an existing summit as its main objective.
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


def validate_source_references(route: dict, route_label: str) -> list[str]:
    issues = []
    references = route.get("source_references", [])
    if references is None:
        return issues
    if not isinstance(references, list):
        return [f"{route_label}: source_references must be a list"]
    for index, reference in enumerate(references, start=1):
        if not isinstance(reference, dict):
            issues.append(f"{route_label}: source reference {index} must be an object")
            continue
        url = str(reference.get("url", "") or "").strip()
        notes = str(reference.get("notes", "") or "")
        if url and not is_plain_https_url(url):
            issues.append(f"{route_label}: source reference {index} has non-plain https URL: {url}")
        if "[" in url or "]" in url or "[" in notes or "]" in notes:
            issues.append(f"{route_label}: source reference {index} contains Markdown artifacts")
    return issues


def validate_route(route: dict, index: int) -> tuple[dict | None, list[str], list[str]]:
    label = f"route {index}"
    issues = []
    warnings = []
    if not isinstance(route, dict):
        return None, [f"{label}: must be an object"], warnings

    name = str(route.get("name", "") or "").strip()
    activity_type = backend.normalize_outdoor_route_activity_type(route.get("activity_type"))
    route_category = str(route.get("route_category", "") or "").strip() or "other"
    primary_location_name = str(route.get("primary_location_name", "") or "").strip()

    if not name:
        issues.append(f"{label}: name is required")
    if not activity_type:
        issues.append(f"{label} '{name}': unsupported activity_type '{route.get('activity_type')}'")
    if route_category not in backend.OUTDOOR_ROUTE_CATEGORIES:
        issues.append(f"{label} '{name}': unsupported route_category '{route_category}'")
    if not primary_location_name:
        issues.append(f"{label} '{name}': primary_location_name is required")

    issues.extend(validate_source_references(route, f"{label} '{name}'"))

    if issues:
        return None, issues, warnings

    preview = {
        "name": name,
        "activity_type": activity_type,
        "primary_location_name": primary_location_name,
        "route_category": route_category,
        "summary": str(route.get("summary", "") or ""),
        "description": str(route.get("description", "") or ""),
        "visibility": str(route.get("visibility", "") or "private"),
        "status": str(route.get("status", "") or "draft"),
        "distance_km": route.get("distance_km"),
        "elevation_gain_meters": route.get("elevation_gain_meters"),
        "elevation_loss_meters": route.get("elevation_loss_meters"),
        "min_elevation_meters": route.get("min_elevation_meters"),
        "max_elevation_meters": route.get("max_elevation_meters"),
        "estimated_duration_minutes": route.get("estimated_duration_minutes"),
        "difficulty_label": str(route.get("difficulty_label") or route.get("difficulty_grade") or ""),
        "source_references": route.get("source_references") or [],
    }
    if preview["visibility"] not in backend.OUTDOOR_ROUTE_VISIBILITIES:
        issues.append(f"{label} '{name}': unsupported visibility '{preview['visibility']}'")
    if preview["status"] not in backend.OUTDOOR_ROUTE_STATUSES:
        issues.append(f"{label} '{name}': unsupported status '{preview['status']}'")
    if issues:
        return None, issues, warnings
    return preview, issues, warnings


def build_preview(payload: dict) -> tuple[list[dict], list[str], list[str]]:
    route_previews = []
    issues = []
    warnings = []
    routes = payload.get("routes", [])
    if not isinstance(routes, list):
        return [], ["Top-level routes must be a list"], warnings
    for index, route in enumerate(routes, start=1):
        preview, route_issues, route_warnings = validate_route(route, index)
        issues.extend(route_issues)
        warnings.extend(route_warnings)
        if preview:
            route_previews.append(preview)
    return route_previews, issues, warnings


def ensure_user_exists(db, username: str) -> None:
    if not db.query(backend.UserModel).filter_by(username=username).first():
        raise ValueError(f"User '{username}' does not exist")


def get_summit_by_name(db, username: str, name: str):
    return db.query(backend.OutdoorSummitModel).filter_by(username=username, name=name).first()


def upsert_route(db, username: str, preview: dict, now: str) -> tuple[str, backend.OutdoorRouteModel]:
    row = db.query(backend.OutdoorRouteModel).filter_by(username=username, name=preview["name"]).first()
    action = "updated" if row else "created"
    if not row:
        row = backend.OutdoorRouteModel(username=username, name=preview["name"], created_at=now, updated_at=now)
        db.add(row)

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
    return action, row


def upsert_main_objective_role(db, route_id: int, summit_id: int, now: str) -> None:
    row = (
        db.query(backend.OutdoorRouteLocationRoleModel)
        .filter_by(
            entity_type="route",
            entity_id=route_id,
            location_entity_type="summit",
            location_entity_id=summit_id,
            role="main_objective",
        )
        .first()
    )
    if not row:
        row = backend.OutdoorRouteLocationRoleModel(
            entity_type="route",
            entity_id=route_id,
            location_entity_type="summit",
            location_entity_id=summit_id,
            role="main_objective",
            created_at=now,
            updated_at=now,
        )
        db.add(row)
    row.updated_at = now


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


def import_inventory(path: Path, username: str, apply: bool = False) -> int:
    payload = load_payload(path)
    route_previews, issues, warnings = build_preview(payload)

    db = backend.SessionLocal()
    try:
        existing_summits = {
            preview["primary_location_name"]
            for preview in route_previews
            if get_summit_by_name(db, username, preview["primary_location_name"])
        }
        for preview in route_previews:
            if preview["primary_location_name"] not in existing_summits:
                issues.append(
                    f"route '{preview['name']}': primary summit '{preview['primary_location_name']}' is not imported"
                )

        print("Outdoor route inventory import")
        print(f"mode={'apply' if apply else 'preview'}")
        print(f"username={username}")
        print(f"routes_ready={len(route_previews)}")
        print(f"main_objective_links_ready={len(route_previews) - sum(1 for issue in issues if 'primary summit' in issue)}")
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
            print("\nNo rows written. Re-run with --apply to import these routes.")
            return 0

        ensure_user_exists(db, username)
        now = utc_now_iso()
        created = 0
        updated = 0
        for preview in route_previews:
            summit = get_summit_by_name(db, username, preview["primary_location_name"])
            action, route = upsert_route(db, username, preview, now)
            db.flush()
            upsert_main_objective_role(db, route.id, summit.id, now)
            replace_source_references(db, route.id, preview["source_references"], now)
            if action == "created":
                created += 1
            else:
                updated += 1
        db.commit()
        print(f"\nImport complete: created={created}, updated={updated}, linked_main_objectives={len(route_previews)}")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("json_path", type=Path, help="Path to the ChatGPT route inventory JSON file")
    parser.add_argument("--username", default=backend.DEFAULT_USERNAME, help="Existing users.username owner for imported rows")
    parser.add_argument("--apply", action="store_true", help="Write validated routes to the database")
    args = parser.parse_args()
    return import_inventory(args.json_path, args.username, args.apply)


if __name__ == "__main__":
    raise SystemExit(main())
