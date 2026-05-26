"""Preview SAC route portal routes before building a real importer.

This script does not write to the database. It fetches public route search rows
and public published route details for one SAC discipline, then reports how well
the data maps to the app's route model.
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


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


def fetch_json(url: str) -> dict:
    request = Request(url, headers={"Accept": "application/json", "User-Agent": "rehab-outdoor-preview/1.0"})
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


def compact_photos(value) -> list[dict]:
    photos = []
    for item in value or []:
        if not isinstance(item, dict):
            continue
        photo = item.get("photo") if isinstance(item.get("photo"), dict) else {}
        photos.append(
            {
                "caption": pick_text(item.get("caption")),
                "url": str(photo.get("url") or ""),
                "copyright": str(photo.get("copyright") or "").strip(),
                "season": str(photo.get("season") or "").strip(),
                "thumbnails": photo.get("thumbnails") or {},
            }
        )
    return photos


def route_duration_minutes(detail: dict, row: dict) -> int | None:
    ascent = detail.get("ascent_time_max", row.get("ascent_time_max"))
    descent = detail.get("descent_time_max", row.get("descent_time_max"))
    values = [value for value in (ascent, descent) if isinstance(value, (int, float))]
    return int(sum(values)) if values else None


def normalize_route(row: dict, detail: dict, discipline: str) -> dict:
    destination = detail.get("destination_poi") or row.get("destination_poi") or {}
    title = pick_text(detail.get("title")) or pick_text(row.get("title")) or f"SAC route {row.get('id')}"
    difficulty = detail.get("main_difficulty") or row.get("main_difficulty") or ""
    photos = compact_photos(detail.get("photos") or row.get("photos"))
    return {
        "route": {
            "external_source_id": str(row.get("id") or detail.get("id")),
            "source_catalog": "sac_route_portal",
            "name": title,
            "activity_type": DISCIPLINE_TO_ACTIVITY.get(discipline, "alpinism"),
            "route_category": DISCIPLINE_TO_CATEGORY.get(discipline, "other"),
            "visibility": "private",
            "status": "draft",
            "summary": "",
            "description": "",
            "elevation_gain_meters": detail.get("ascent_altitude", row.get("ascent_altitude")),
            "elevation_loss_meters": detail.get("descent_altitude", row.get("descent_altitude")),
            "estimated_duration_minutes": route_duration_minutes(detail, row),
            "difficulty_label": str(difficulty or ""),
        },
        "sac_metadata": {
            "discipline": discipline,
            "availability": detail.get("availability") or row.get("availability"),
            "normal_route": detail.get("normal_route", row.get("normal_route")),
            "destination_poi_id": detail.get("destination_poi_id") or destination.get("id"),
            "destination_name": pick_text(destination.get("display_name") or destination.get("geographical_name")),
            "destination_type": destination.get("type"),
            "main_lang": detail.get("main_lang") or row.get("main_lang"),
            "first_time_published": row.get("first_time_published"),
            "photos": photos,
            "documents": detail.get("documents") or [],
            "raw_search_row": row,
            "raw_detail": detail,
        },
        "coverage": {
            "has_detail": bool(detail.get("id") or detail.get("title") or detail.get("segments")),
            "has_destination": bool(destination),
            "has_destination_coordinates": bool(
                destination.get("coordinates") or (destination.get("latitude") and destination.get("longitude"))
            ),
            "has_departure_point": bool(detail.get("departure_point")),
            "has_end_point": bool(detail.get("end_point")),
            "has_waypoints": bool(detail.get("waypoints")),
            "has_photos": bool(photos),
            "has_documents": bool(detail.get("documents")),
            "has_geometry": bool(detail.get("geom") or detail.get("geometry") or row.get("geom") or row.get("geometry")),
            "has_segments": bool(detail.get("segments")),
            "has_description": bool(detail.get("description") or row.get("description")),
        },
        "source_references": [
            {
                "source_type": "official_agency",
                "title": f"SAC route portal API: {title}",
                "url": route_detail_url(int(row.get("id") or detail.get("id"))),
                "publisher": "Swiss Alpine Club SAC",
                "license_notes": "Previewed from the public SAC route portal API for personal route-planning reference.",
                "notes": f"SAC route id {row.get('id') or detail.get('id')}",
            }
        ],
    }


def build_preview(discipline: str, limit: int) -> dict:
    total = fetch_json(route_count_url(discipline)).get("count")
    rows = fetch_search_rows(discipline, limit)
    previews = []
    detail_errors = []
    for row in rows:
        route_id = row.get("id")
        try:
            detail = fetch_json(route_detail_url(int(route_id)))
        except Exception as exc:  # pragma: no cover - diagnostics only
            detail = {}
            detail_errors.append({"id": route_id, "error": str(exc)})
        previews.append(normalize_route(row, detail, discipline))

    coverage_keys = [
        "has_detail",
        "has_destination",
        "has_destination_coordinates",
        "has_departure_point",
        "has_end_point",
        "has_waypoints",
        "has_photos",
        "has_documents",
        "has_geometry",
        "has_segments",
        "has_description",
    ]
    coverage = {
        key: sum(1 for preview in previews if preview["coverage"][key])
        for key in coverage_keys
    }
    return {
        "discipline": discipline,
        "activity_type": DISCIPLINE_TO_ACTIVITY.get(discipline),
        "route_category": DISCIPLINE_TO_CATEGORY.get(discipline),
        "api_total_count": total,
        "preview_count": len(previews),
        "coverage": coverage,
        "detail_errors": detail_errors,
        "routes": previews,
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--discipline", default="alpine_tour", choices=sorted(DISCIPLINE_TO_ACTIVITY))
    parser.add_argument("--limit", type=int, default=50)
    parser.add_argument("--json-out", type=Path, help="Optional path to write full preview JSON")
    args = parser.parse_args()

    preview = build_preview(args.discipline, args.limit)
    print("SAC route preview")
    print(f"discipline={preview['discipline']}")
    print(f"activity_type={preview['activity_type']}")
    print(f"route_category={preview['route_category']}")
    print(f"api_total_count={preview['api_total_count']}")
    print(f"preview_count={preview['preview_count']}")
    print("coverage=" + json.dumps(preview["coverage"], sort_keys=True))
    print(f"detail_errors={len(preview['detail_errors'])}")
    print("\nSample normalized routes:")
    for item in preview["routes"][:10]:
        route = item["route"]
        metadata = item["sac_metadata"]
        print(
            f"- {route['external_source_id']} | {route['name']} | {route['difficulty_label'] or '-'} | "
            f"gain={route['elevation_gain_meters']} loss={route['elevation_loss_meters']} "
            f"duration={route['estimated_duration_minutes']} destination={metadata['destination_name'] or '-'}"
        )
    if args.json_out:
        args.json_out.parent.mkdir(parents=True, exist_ok=True)
        args.json_out.write_text(json.dumps(preview, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\nWrote {args.json_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
