"""Backfill route main-objective links from route names and imported summits.

This is intentionally conservative: it only creates a main_objective role when a
route has no existing main objective and its objective name can be matched to
exactly one imported summit name or alias.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
BACKEND_DIR = REPO_ROOT / "backend"
if not (BACKEND_DIR / "app").exists() and (REPO_ROOT / "app").exists():
    BACKEND_DIR = REPO_ROOT
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main as backend  # noqa: E402


OBJECTIVE_SPLIT_RE = re.compile(r"\s+(?:via|from)\s+", re.IGNORECASE)
OBJECTIVE_NAME_OVERRIDES = {
    "combin de grafeneire": "grand combin",
    "grunhorn": "gross grunhorn",
    "grünhorn": "gross grünhorn",
}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def normalize_name(value: str) -> str:
    return (
        str(value or "")
        .casefold()
        .replace("’", "'")
        .replace("`", "'")
        .replace("´", "'")
        .replace("ü", "u")
        .replace("Ü", "u")
        .replace("ö", "o")
        .replace("Ö", "o")
        .replace("ä", "a")
        .replace("Ä", "a")
        .replace("é", "e")
        .replace("É", "e")
        .replace("è", "e")
        .replace("È", "e")
        .replace("ê", "e")
        .replace("Ê", "e")
        .replace("ô", "o")
        .replace("Ô", "o")
        .replace("-", " ")
        .replace(",", " ")
    )


def compact_name(value: str) -> str:
    normalized = normalize_name(value)
    normalized = "".join(character for character in normalized if character.isalnum() or character.isspace())
    return " ".join(normalized.split())


def parse_objective_name(route_name: str) -> str:
    return OBJECTIVE_SPLIT_RE.split(str(route_name or "").strip(), maxsplit=1)[0].strip()


def summit_aliases(row) -> list[str]:
    try:
        aliases = json.loads(row.aliases_json or "[]")
    except (TypeError, json.JSONDecodeError):
        aliases = []
    return [alias for alias in aliases if isinstance(alias, str) and alias.strip()]


def build_summit_lookup(db, usernames: list[str]) -> tuple[dict[str, list], list[tuple[str, object]]]:
    exact: dict[str, list] = {}
    prefix_candidates = []
    rows = (
        db.query(backend.OutdoorSummitModel)
        .filter(backend.OutdoorSummitModel.username.in_(usernames))
        .order_by(backend.OutdoorSummitModel.name, backend.OutdoorSummitModel.id)
        .all()
    )
    for row in rows:
        names = [row.name, *summit_aliases(row)]
        for name in names:
            key = compact_name(name)
            if not key:
                continue
            exact.setdefault(key, []).append(row)
            prefix_candidates.append((key, row))
    prefix_candidates.sort(key=lambda item: len(item[0]), reverse=True)
    return exact, prefix_candidates


def find_matching_summit(route, exact: dict[str, list], prefix_candidates: list[tuple[str, object]]):
    objective_name = parse_objective_name(route.name)
    objective_key = compact_name(objective_name)
    objective_key = OBJECTIVE_NAME_OVERRIDES.get(objective_key, objective_key)
    matches_by_id = {row.id: row for row in exact.get(objective_key, [])}
    matches = list(matches_by_id.values())
    if len(matches) == 1:
        return matches[0], objective_name, "exact"
    if len(matches) > 1:
        ranked_matches = sorted(
            matches,
            key=lambda row: (float(row.elevation_meters or 0), -int(row.id or 0)),
            reverse=True,
        )
        if len(ranked_matches) >= 2 and (ranked_matches[0].elevation_meters or 0) == (ranked_matches[1].elevation_meters or 0):
            return None, objective_name, "ambiguous"
        return ranked_matches[0], objective_name, "highest_exact"

    route_key = compact_name(route.name)
    for candidate_key, summit in prefix_candidates:
        if route_key.startswith(f"{candidate_key} via ") or route_key.startswith(f"{candidate_key} from "):
            return summit, objective_name, "prefix"
    return None, objective_name, "missing"


def route_has_main_objective(db, route_id: int) -> bool:
    return (
        db.query(backend.OutdoorRouteLocationRoleModel.id)
        .filter_by(entity_type="route", entity_id=route_id, role="main_objective")
        .first()
        is not None
    )


def link_route_main_objectives(username: str, apply: bool = False) -> int:
    db = backend.SessionLocal()
    try:
        usernames = backend.get_outdoor_library_usernames(username)
        exact, prefix_candidates = build_summit_lookup(db, usernames)
        routes = (
            db.query(backend.OutdoorRouteModel)
            .filter(backend.OutdoorRouteModel.username.in_(usernames))
            .order_by(backend.OutdoorRouteModel.name, backend.OutdoorRouteModel.id)
            .all()
        )
        now = utc_now_iso()
        planned = []
        skipped = []
        for route in routes:
            if route_has_main_objective(db, route.id):
                skipped.append((route.id, route.name, "already_linked"))
                continue
            summit, objective_name, status = find_matching_summit(route, exact, prefix_candidates)
            if not summit:
                skipped.append((route.id, route.name, f"{status}: {objective_name}"))
                continue
            planned.append((route, summit, objective_name, status))

        print("Route main-objective backfill")
        print(f"mode={'apply' if apply else 'preview'}")
        print(f"username={username}")
        print(f"routes={len(routes)}")
        print(f"links_ready={len(planned)}")
        print(f"skipped={len(skipped)}")

        if planned:
            print("\nLinks ready:")
            for route, summit, objective_name, status in planned[:100]:
                print(f"- route {route.id}: {route.name} -> summit {summit.id}: {summit.name} ({status}, parsed='{objective_name}')")
        if skipped:
            print("\nSkipped:")
            for route_id, route_name, reason in skipped[:100]:
                print(f"- route {route_id}: {route_name} ({reason})")

        if not apply:
            print("\nNo rows written. Re-run with --apply to create links.")
            return 0

        for route, summit, _objective_name, _status in planned:
            db.add(
                backend.OutdoorRouteLocationRoleModel(
                    entity_type="route",
                    entity_id=route.id,
                    location_entity_type="summit",
                    location_entity_id=summit.id,
                    role="main_objective",
                    order_index=1,
                    notes="Backfilled by matching route name to imported summit name.",
                    created_at=now,
                    updated_at=now,
                )
            )
        db.commit()
        print(f"\nCreated {len(planned)} main-objective route links.")
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--username", default=backend.DEFAULT_USERNAME)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    return link_route_main_objectives(args.username, args.apply)


if __name__ == "__main__":
    raise SystemExit(main())
