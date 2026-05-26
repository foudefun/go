"""Import validated outdoor location inventory JSON into Phase 3 tables.

The script previews by default. Pass --apply to write rows.
Crag/sector rows are intentionally skipped until the climbing topo bridge exists.
"""

from __future__ import annotations

import argparse
import sys
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
SCRIPT_DIR = Path(__file__).resolve().parent
if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from preview_outdoor_location_inventory import build_preview, load_payload  # noqa: E402

BACKEND_DIR = REPO_ROOT / "backend"
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main as backend  # noqa: E402


MODEL_BY_TABLE = {
    "outdoor_summits": backend.OutdoorSummitModel,
    "outdoor_trailheads": backend.OutdoorTrailheadModel,
    "outdoor_parkings": backend.OutdoorParkingModel,
    "outdoor_huts": backend.OutdoorHutModel,
    "outdoor_stations": backend.OutdoorStationModel,
    "outdoor_passes": backend.OutdoorPassModel,
    "outdoor_waypoints": backend.OutdoorWaypointModel,
    "outdoor_other_locations": backend.OutdoorOtherLocationModel,
}


COORDINATE_CONFLICT_DEGREES = 0.001
ELEVATION_CONFLICT_METERS = 10


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def ensure_user_exists(db, username: str) -> None:
    if not db.query(backend.UserModel).filter_by(username=username).first():
        raise ValueError(f"User '{username}' does not exist")


def values_conflict(existing: float | None, incoming: float | None, tolerance: float) -> bool:
    if existing is None or incoming is None:
        return existing != incoming
    return abs(float(existing) - float(incoming)) > tolerance


def find_location_conflicts(db, username: str, location_previews: list[dict]) -> list[str]:
    conflicts = []
    for preview in location_previews:
        model = MODEL_BY_TABLE[preview["table"]]
        row = db.query(model).filter_by(username=username, name=preview["name"]).first()
        if not row:
            continue
        has_conflict = (
            values_conflict(row.latitude, preview["latitude"], COORDINATE_CONFLICT_DEGREES)
            or values_conflict(row.longitude, preview["longitude"], COORDINATE_CONFLICT_DEGREES)
            or values_conflict(row.elevation_meters, preview["elevation_meters"], ELEVATION_CONFLICT_METERS)
        )
        if has_conflict:
            conflicts.append(
                f"{preview['name']} already exists in {preview['table']} with different "
                "coordinates/elevation; rename or merge explicitly before importing"
            )
    return conflicts


def upsert_location(db, username: str, preview: dict, now: str) -> str:
    model = MODEL_BY_TABLE[preview["table"]]
    row = db.query(model).filter_by(username=username, name=preview["name"]).first()
    action = "updated" if row else "created"
    if not row:
        row = model(username=username, name=preview["name"], created_at=now, updated_at=now)
        db.add(row)

    row.aliases_json = preview["aliases_json"]
    row.latitude = preview["latitude"]
    row.longitude = preview["longitude"]
    row.elevation_meters = preview["elevation_meters"]
    row.coordinate_status = preview["coordinate_status"]
    row.description = preview["description"]
    row.access_notes = preview["access_notes"]
    row.updated_at = now
    return action


def import_inventory(path: Path, username: str, apply: bool = False) -> int:
    payload = load_payload(path)
    location_previews, role_previews, issues, warnings = build_preview(payload)

    print("Outdoor location inventory import")
    print(f"mode={'apply' if apply else 'preview'}")
    print(f"username={username}")
    print(f"locations_ready={len(location_previews)}")
    print(f"role_suggestions_ready={len(role_previews)}")
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
        print("\nNo rows written. Re-run with --apply to import these locations.")
        return 0

    db = backend.SessionLocal()
    try:
        ensure_user_exists(db, username)
        conflicts = find_location_conflicts(db, username, location_previews)
        if conflicts:
            print("\nConflicts:")
            for conflict in conflicts:
                print(f"- {conflict}")
            print("\nNo rows written.")
            return 1
        now = utc_now_iso()
        created = 0
        updated = 0
        for preview in location_previews:
            action = upsert_location(db, username, preview, now)
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
    parser.add_argument("json_path", type=Path, help="Path to the ChatGPT location inventory JSON file")
    parser.add_argument("--username", default=backend.DEFAULT_USERNAME, help="Existing users.username owner for imported rows")
    parser.add_argument("--apply", action="store_true", help="Write validated locations to the database")
    args = parser.parse_args()
    return import_inventory(args.json_path, args.username, args.apply)


if __name__ == "__main__":
    raise SystemExit(main())
