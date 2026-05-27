"""Link route start locations from route titles.

Preview is the default. Pass --apply to write route start roles.

This is intentionally conservative: it only links mapped non-summit locations
when the route title contains a clear start cue such as "from", "von",
"depuis", "da", or "ab" followed by a known location name/alias.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
import unicodedata
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
if not (BACKEND_DIR / "app").exists() and (REPO_ROOT / "app").exists():
    BACKEND_DIR = REPO_ROOT
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main as backend  # noqa: E402


START_LOCATION_TYPES = ("hut", "station", "trailhead", "parking", "pass", "waypoint", "other_location")
MODEL_BY_TYPE = {
    "hut": backend.OutdoorHutModel,
    "station": backend.OutdoorStationModel,
    "trailhead": backend.OutdoorTrailheadModel,
    "parking": backend.OutdoorParkingModel,
    "pass": backend.OutdoorPassModel,
    "waypoint": backend.OutdoorWaypointModel,
    "other_location": backend.OutdoorOtherLocationModel,
}

START_CUES = (
    "from",
    "from the",
    "von",
    "vom",
    "von der",
    "von den",
    "ab",
    "ab der",
    "ab dem",
    "depuis",
    "depuis le",
    "depuis la",
    "de",
    "du",
    "da",
    "dal",
    "dalla",
)


@dataclass(frozen=True)
class LocationCandidate:
    location_type: str
    location_id: int
    name: str
    aliases: tuple[str, ...]
    latitude: float
    longitude: float
    elevation_meters: float | None


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def normalize_text(value: str) -> str:
    normalized = unicodedata.normalize("NFKD", str(value or "").casefold())
    ascii_text = "".join(character for character in normalized if not unicodedata.combining(character))
    ascii_text = re.sub(r"[^a-z0-9]+", " ", ascii_text)
    return " ".join(ascii_text.split())


def parse_aliases(value: str | None) -> tuple[str, ...]:
    if not value:
        return ()
    try:
        aliases = json.loads(value)
    except json.JSONDecodeError:
        return ()
    if not isinstance(aliases, list):
        return ()
    return tuple(alias.strip() for alias in aliases if isinstance(alias, str) and alias.strip())


def candidate_names(candidate: LocationCandidate) -> set[str]:
    names = {candidate.name, *candidate.aliases}
    expanded = set()
    for name in names:
        expanded.add(name)
        expanded.update(part.strip() for part in re.split(r"\s*/\s*|\s+or\s+|\s+oder\s+|\s+ou\s+", name, flags=re.IGNORECASE))
    return {normalize_text(name) for name in expanded if normalize_text(name)}


def load_candidates(db, username: str) -> list[LocationCandidate]:
    candidates = []
    for location_type in START_LOCATION_TYPES:
        model = MODEL_BY_TYPE[location_type]
        rows = (
            db.query(model)
            .filter_by(username=username)
            .filter(model.latitude.isnot(None), model.longitude.isnot(None))
            .all()
        )
        for row in rows:
            candidates.append(
                LocationCandidate(
                    location_type=location_type,
                    location_id=row.id,
                    name=row.name,
                    aliases=parse_aliases(row.aliases_json),
                    latitude=float(row.latitude),
                    longitude=float(row.longitude),
                    elevation_meters=row.elevation_meters,
                )
            )
    return candidates


def start_cue_patterns(name_key: str) -> list[str]:
    escaped = re.escape(name_key)
    return [rf"(?:^|\s){re.escape(cue)}\s+{escaped}(?:\s|$)" for cue in START_CUES]


def title_matches_candidate(title: str, candidate: LocationCandidate) -> bool:
    title_key = normalize_text(title)
    if not title_key:
        return False
    for name_key in candidate_names(candidate):
        if len(name_key) < 4:
            continue
        if any(re.search(pattern, title_key) for pattern in start_cue_patterns(name_key)):
            return True
    return False


def has_existing_start_role(db, route_id: int) -> bool:
    return (
        db.query(backend.OutdoorRouteLocationRoleModel)
        .filter_by(entity_type="route", entity_id=route_id)
        .filter(backend.OutdoorRouteLocationRoleModel.role.in_(["start", "approach_start"]))
        .first()
        is not None
    )


def find_route_start_match(route, candidates: list[LocationCandidate]) -> LocationCandidate | None:
    matches = [candidate for candidate in candidates if title_matches_candidate(route.name, candidate)]
    if len(matches) == 1:
        return matches[0]
    if len(matches) > 1:
        ranked = sorted(matches, key=lambda item: (len(normalize_text(item.name)), float(item.elevation_meters or 0)), reverse=True)
        if len(ranked) < 2 or normalize_text(ranked[0].name) != normalize_text(ranked[1].name):
            return ranked[0]
    return None


def upsert_start_role(db, route_id: int, candidate: LocationCandidate, now: str) -> bool:
    role = (
        db.query(backend.OutdoorRouteLocationRoleModel)
        .filter_by(
            entity_type="route",
            entity_id=route_id,
            location_entity_type=candidate.location_type,
            location_entity_id=candidate.location_id,
            role="start",
        )
        .first()
    )
    if role:
        role.updated_at = now
        return False
    db.add(
        backend.OutdoorRouteLocationRoleModel(
            entity_type="route",
            entity_id=route_id,
            location_entity_type=candidate.location_type,
            location_entity_id=candidate.location_id,
            role="start",
            notes="Linked automatically from route title start cue.",
            created_at=now,
            updated_at=now,
        )
    )
    return True


def link_route_start_locations(username: str, slug_prefix: str, limit: int | None, apply: bool) -> int:
    db = backend.SessionLocal()
    try:
        query = db.query(backend.OutdoorRouteModel).filter_by(username=username)
        if slug_prefix:
            query = query.filter(backend.OutdoorRouteModel.slug.like(f"{slug_prefix}%"))
        routes = query.order_by(backend.OutdoorRouteModel.id).all()
        if limit is not None:
            routes = routes[:limit]
        candidates = load_candidates(db, username)
        matches = []
        skipped_existing = 0
        for route in routes:
            if has_existing_start_role(db, route.id):
                skipped_existing += 1
                continue
            candidate = find_route_start_match(route, candidates)
            if candidate:
                matches.append((route, candidate))

        print("Route start location linker")
        print(f"mode={'apply' if apply else 'preview'}")
        print(f"username={username}")
        print(f"slug_prefix={slug_prefix or '*'}")
        print(f"routes_scanned={len(routes)}")
        print(f"candidate_locations={len(candidates)}")
        print(f"skipped_existing_start={skipped_existing}")
        print(f"start_matches={len(matches)}")
        print("\nPreview:")
        for route, candidate in matches[:20]:
            print(f"- {route.slug or route.id} | {route.name} -> {candidate.name} ({candidate.location_type})")
        if len(matches) > 20:
            print(f"- ... {len(matches) - 20} more")
        if not apply:
            print("\nNo rows written. Re-run with --apply to link these starts.")
            return 0

        now = utc_now_iso()
        created = 0
        for route, candidate in matches:
            if upsert_start_role(db, route.id, candidate, now):
                created += 1
        db.commit()
        print(f"\nLink complete: created_start_roles={created}")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--username", default=backend.DEFAULT_USERNAME)
    parser.add_argument("--slug-prefix", default="sac-alpine-tour-", help="Only scan routes whose slug starts with this value")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    return link_route_start_locations(args.username, args.slug_prefix, args.limit, args.apply)


if __name__ == "__main__":
    raise SystemExit(main())
