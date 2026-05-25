"""Validate and preview ChatGPT outdoor location inventory JSON.

This script does not write to the database. It checks whether the JSON can map
to the Phase 3 outdoor location tables and prints an import preview.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.parse import urlparse


TABLE_BY_LOCATION_TYPE = {
    "summit": "outdoor_summits",
    "trailhead": "outdoor_trailheads",
    "parking": "outdoor_parkings",
    "hut": "outdoor_huts",
    "station": "outdoor_stations",
    "pass": "outdoor_passes",
    "waypoint": "outdoor_waypoints",
    "other_location": "outdoor_other_locations",
}

EXTERNAL_LOCATION_TYPES = {"crag", "sector"}

LOCATION_TYPES = set(TABLE_BY_LOCATION_TYPE) | EXTERNAL_LOCATION_TYPES

COORDINATE_STATUSES = {"exact", "approximate", "area_only", "unknown"}

ROLE_VALUES = {
    "main_objective",
    "start",
    "end",
    "passes_through",
    "approach_start",
    "descent_end",
    "bailout",
    "nearby",
    "water",
    "crux",
    "transition",
    "ski_depot",
    "belay",
    "anchor",
    "rappel",
}


def load_payload(path: Path) -> dict:
    with path.open("r", encoding="utf-8-sig") as handle:
        payload = json.load(handle)
    if not isinstance(payload, dict):
        raise ValueError("Top-level JSON must be an object")
    return payload


def is_plain_https_url(value: str) -> bool:
    parsed = urlparse(str(value or ""))
    return parsed.scheme == "https" and bool(parsed.netloc)


def validate_source_references(location: dict, location_label: str) -> list[str]:
    issues = []
    references = location.get("source_references", [])
    if references is None:
        return issues
    if not isinstance(references, list):
        return [f"{location_label}: source_references must be a list"]
    for index, reference in enumerate(references, start=1):
        if not isinstance(reference, dict):
            issues.append(f"{location_label}: source reference {index} must be an object")
            continue
        url = str(reference.get("url", "") or "").strip()
        notes = str(reference.get("notes", "") or "")
        if url and not is_plain_https_url(url):
            issues.append(f"{location_label}: source reference {index} has non-plain https URL: {url}")
        if "[" in url or "]" in url or "[" in notes or "]" in notes:
            issues.append(f"{location_label}: source reference {index} contains Markdown artifacts")
    return issues


def validate_location(location: dict, index: int) -> tuple[dict | None, list[str], list[str]]:
    label = f"location {index}"
    issues = []
    warnings = []
    if not isinstance(location, dict):
        return None, [f"{label}: must be an object"], warnings

    location_type = str(location.get("location_entity_type", "") or "").strip()
    name = str(location.get("name", "") or "").strip()
    coordinate_status = str(location.get("coordinate_status", "") or "").strip()
    if location_type not in LOCATION_TYPES:
        issues.append(f"{label}: unsupported location_entity_type '{location_type}'")
    if location_type in EXTERNAL_LOCATION_TYPES:
        warnings.append(f"{label} '{name}': {location_type} is external to Phase 3 tables and will be skipped")
    if not name:
        issues.append(f"{label}: name is required")
    if coordinate_status not in COORDINATE_STATUSES:
        issues.append(f"{label} '{name}': invalid coordinate_status '{coordinate_status}'")

    latitude = location.get("latitude")
    longitude = location.get("longitude")
    if (latitude is None) != (longitude is None):
        issues.append(f"{label} '{name}': latitude and longitude must both be set or both be null")
    if coordinate_status == "unknown" and (latitude is not None or longitude is not None):
        warnings.append(f"{label} '{name}': coordinate_status is unknown but coordinates are present")
    if coordinate_status == "exact":
        warnings.append(f"{label} '{name}': exact coordinates should be verified against an authoritative source")

    issues.extend(validate_source_references(location, f"{label} '{name}'"))

    if issues:
        return None, issues, warnings
    if location_type in EXTERNAL_LOCATION_TYPES:
        return None, issues, warnings

    preview = {
        "table": TABLE_BY_LOCATION_TYPE[location_type],
        "name": name,
        "aliases_json": json.dumps(location.get("aliases") or [], ensure_ascii=False),
        "latitude": latitude,
        "longitude": longitude,
        "elevation_meters": location.get("elevation_meters"),
        "coordinate_status": coordinate_status,
        "description": str(location.get("description", "") or ""),
        "access_notes": str(location.get("access_notes", "") or ""),
        "open_questions_json": json.dumps(location.get("open_questions") or [], ensure_ascii=False),
    }
    return preview, issues, warnings


def validate_role_suggestion(role: dict, index: int, known_location_keys: set[tuple[str, str]]) -> tuple[dict | None, list[str]]:
    label = f"role suggestion {index}"
    issues = []
    if not isinstance(role, dict):
        return None, [f"{label}: must be an object"]
    location_type = str(role.get("location_entity_type", "") or "").strip()
    location_name = str(role.get("location_name", "") or "").strip()
    role_value = str(role.get("role", "") or "").strip()
    if location_type not in LOCATION_TYPES:
        issues.append(f"{label}: unsupported location_entity_type '{location_type}'")
    if role_value not in ROLE_VALUES:
        issues.append(f"{label}: unsupported role '{role_value}'")
    if (location_type, location_name) not in known_location_keys:
        issues.append(f"{label}: references unknown or skipped location '{location_name}' ({location_type})")
    if issues:
        return None, issues
    return {
        "route_or_objective_name": str(role.get("route_or_objective_name", "") or ""),
        "location_name": location_name,
        "location_entity_type": location_type,
        "role": role_value,
        "order_index": role.get("order_index"),
        "notes": str(role.get("notes", "") or ""),
    }, issues


def build_preview(payload: dict) -> tuple[list[dict], list[dict], list[str], list[str]]:
    location_previews = []
    role_previews = []
    issues = []
    warnings = []
    known_location_keys = set()
    for index, location in enumerate(payload.get("locations", []), start=1):
        preview, location_issues, location_warnings = validate_location(location, index)
        issues.extend(location_issues)
        warnings.extend(location_warnings)
        if preview:
            location_previews.append(preview)
            known_location_keys.add((str(location.get("location_entity_type", "") or "").strip(), preview["name"]))

    for index, role in enumerate(payload.get("route_location_roles_suggestions", []), start=1):
        preview, role_issues = validate_role_suggestion(role, index, known_location_keys)
        warnings.extend(role_issues)
        if preview:
            role_previews.append(preview)

    return location_previews, role_previews, issues, warnings


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("json_path", type=Path, help="Path to the ChatGPT location inventory JSON file")
    args = parser.parse_args()

    payload = load_payload(args.json_path)
    location_previews, role_previews, issues, warnings = build_preview(payload)

    print("Outdoor location inventory preview")
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

    print("\nLocation inserts preview:")
    print(json.dumps(location_previews, ensure_ascii=False, indent=2))

    print("\nRoute location role suggestions preview:")
    print(json.dumps(role_previews, ensure_ascii=False, indent=2))

    return 1 if issues else 0


if __name__ == "__main__":
    raise SystemExit(main())
