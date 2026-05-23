#!/usr/bin/env python3
"""Backfill structured source metrics for legacy imported activity summaries."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB_PATH = REPO_ROOT / "backend" / "data" / "db.sqlite"
METRIC_KEYS = ("duration", "distance", "power", "heart_rate", "cadence", "calories")


def parse_duration_seconds(value: str) -> int | None:
    parts = [int(part) for part in str(value or "").split(":") if part.isdigit()]
    if len(parts) == 3:
        return parts[0] * 3600 + parts[1] * 60 + parts[2]
    if len(parts) == 2:
        return parts[0] * 60 + parts[1]
    return None


def first_float(text: str, pattern: str) -> float | None:
    match = re.search(pattern, text, flags=re.IGNORECASE)
    if not match:
        return None
    try:
        return float(match.group(1).replace(",", "."))
    except ValueError:
        return None


def metric_value(value: float | int | None) -> float | int | None:
    if value is None:
        return None
    if isinstance(value, float) and value.is_integer():
        return int(value)
    return value


def clean_details(details: str) -> str:
    text = str(details or "").strip()
    replacements = {
        "DurÃ©e": "Durée",
        "DurÃƒÂ©e": "Durée",
        "Puissance moy.": "Puissance moy.",
        "Cadence moy.": "Cadence moy.",
    }
    for source, target in replacements.items():
        text = text.replace(source, target)
    text = re.sub(r"(\.(?:fit|tcx|gpx))(?=Dur\S*e|Distance|Puissance|FC|Cadence|Calories)", r"\1 | ", text, flags=re.IGNORECASE)
    return re.sub(r"\s+", " ", text)


def parse_filename(text: str) -> str:
    filename_match = re.search(
        r"Fichier:\s*(.*?\.(?:fit|tcx|gpx))",
        text,
        flags=re.IGNORECASE,
    )
    if filename_match:
        return filename_match.group(1).strip()
    fallback_match = re.search(r"([A-Za-z0-9 _.-]+?\.(?:fit|tcx|gpx))\b", text, flags=re.IGNORECASE)
    return fallback_match.group(1).strip() if fallback_match else ""


def parse_legacy_details(details: str, activity_type: str = "") -> dict | None:
    text = clean_details(details)
    if not text:
        return None
    lowered = text.lower()
    if not any(token in lowered for token in ("import fit", ".fit", ".tcx", ".gpx", "puissance", "distance", "durée")):
        return None

    duration_match = re.search(r"Dur\S{0,8}\s*([0-9]{1,3}:[0-9]{2}(?::[0-9]{2})?)", text, flags=re.IGNORECASE)
    duration_text = duration_match.group(1) if duration_match else ""
    parsed = {
        "activity_type": activity_type or "velo",
        "sport": "cycling" if any(token in lowered for token in ("cycling", "vélo", "velo", "bike", "mywhoosh")) else "",
        "sub_sport": "virtual_activity" if "virtual" in lowered else "",
        "duration_seconds": parse_duration_seconds(duration_text) if duration_text else None,
        "duration": duration_text,
        "distance_km": first_float(text, r"Distance\s*([0-9]+(?:[,.][0-9]+)?)\s*km"),
        "avg_power": first_float(text, r"Puissance\s*moy\.?\s*([0-9]+(?:[,.][0-9]+)?)\s*W"),
        "max_power": first_float(text, r"Puissance\s*max\s*([0-9]+(?:[,.][0-9]+)?)\s*W"),
        "avg_hr": first_float(text, r"FC\s*moy\.?\s*([0-9]+(?:[,.][0-9]+)?)\s*bpm"),
        "max_hr": first_float(text, r"FC\s*max\s*([0-9]+(?:[,.][0-9]+)?)\s*bpm"),
        "avg_cadence": first_float(text, r"Cadence\s*moy\.?\s*([0-9]+(?:[,.][0-9]+)?)\s*rpm"),
        "calories": first_float(text, r"Calories\s*([0-9]+(?:[,.][0-9]+)?)"),
        "source_label": "Backfilled activity import",
        "source_file": parse_filename(text),
    }
    useful_keys = ("duration_seconds", "distance_km", "avg_power", "max_power", "avg_hr", "max_hr", "avg_cadence", "calories")
    if not any(parsed.get(key) is not None for key in useful_keys):
        return None
    return parsed


def build_metrics(parsed: dict) -> dict:
    metrics = {}
    if parsed.get("duration_seconds") is not None:
        metrics["duration"] = {"seconds": metric_value(parsed.get("duration_seconds"))}
    if parsed.get("distance_km") is not None:
        metrics["distance"] = {"km": metric_value(parsed.get("distance_km"))}
    if parsed.get("avg_power") is not None or parsed.get("max_power") is not None:
        metrics["power"] = {
            key: metric_value(value)
            for key, value in {"avg": parsed.get("avg_power"), "max": parsed.get("max_power")}.items()
            if value is not None
        }
    if parsed.get("avg_hr") is not None or parsed.get("max_hr") is not None:
        metrics["heart_rate"] = {
            key: metric_value(value)
            for key, value in {"avg": parsed.get("avg_hr"), "max": parsed.get("max_hr")}.items()
            if value is not None
        }
    if parsed.get("avg_cadence") is not None:
        metrics["cadence"] = {"avg": metric_value(parsed.get("avg_cadence"))}
    if parsed.get("calories") is not None:
        metrics["calories"] = {"value": metric_value(parsed.get("calories"))}
    return metrics


def infer_provider(filename: str, details: str) -> str:
    text = f"{filename} {details}".lower()
    if "mywhoosh" in text or "mywoosh" in text or "whoosh" in text:
        return "MyWhoosh"
    if "zwift" in text:
        return "Zwift"
    if "garmin" in text:
        return "Garmin"
    return "Imported file"


def source_has_metrics(source: dict) -> bool:
    metrics = source.get("metrics") if isinstance(source, dict) else {}
    return isinstance(metrics, dict) and any(metrics.get(key) for key in METRIC_KEYS)


def deterministic_source_id(username: str, date_value: str, activity_index: int, parsed: dict) -> str:
    seed = "|".join(
        [
            username,
            date_value,
            str(activity_index),
            str(parsed.get("source_file", "")),
            str(parsed.get("duration_seconds", "")),
            str(parsed.get("avg_power", "")),
        ]
    )
    return "backfill_" + hashlib.sha1(seed.encode("utf-8")).hexdigest()[:16]


def source_already_present(source_files: list[dict], source_id: str, filename: str) -> bool:
    normalized_filename = str(filename or "").strip().lower()
    for source in source_files:
        if not isinstance(source, dict):
            continue
        if str(source.get("id", "")) == source_id:
            return True
        if normalized_filename and str(source.get("filename", "")).strip().lower() == normalized_filename and source_has_metrics(source):
            return True
    return False


def file_format_from_filename(filename: str) -> str:
    suffix = Path(str(filename or "")).suffix.lower().lstrip(".")
    return suffix if suffix in {"fit", "tcx", "gpx"} else "fit"


def build_source_file(username: str, date_value: str, activity_index: int, parsed: dict, details: str) -> dict:
    source_id = deterministic_source_id(username, date_value, activity_index, parsed)
    filename = str(parsed.get("source_file", "") or "").strip()
    metrics = build_metrics(parsed)
    return {
        "id": source_id,
        "provider": infer_provider(filename, details),
        "label": parsed.get("source_label", "") or "Backfilled activity import",
        "filename": filename,
        "file_format": file_format_from_filename(filename),
        "imported_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "parsed": {key: value for key, value in parsed.items() if value not in ("", None)},
        "metrics": metrics,
    }


def backfill(db_path: Path, *, dry_run: bool = False, username: str = "", date_value: str = "") -> tuple[int, int]:
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    changed_sessions = 0
    changed_activities = 0
    try:
        clauses = []
        params = []
        if username:
            clauses.append("username = ?")
            params.append(username)
        if date_value:
            clauses.append("date = ?")
            params.append(date_value)
        where = f" where {' and '.join(clauses)}" if clauses else ""
        rows = conn.execute(f"select id, username, date, data from sessions{where} order by date, username", params).fetchall()
        for row in rows:
            payload = json.loads(row["data"] or "{}")
            activities = payload.get("activities") if isinstance(payload.get("activities"), list) else []
            session_changed = False
            for activity_index, activity in enumerate(activities):
                if not isinstance(activity, dict):
                    continue
                source_files = activity.get("source_files") if isinstance(activity.get("source_files"), list) else []
                if any(source_has_metrics(source) for source in source_files):
                    continue
                details = str(activity.get("activity_details", "") or "")
                parsed = parse_legacy_details(details, str(activity.get("activity_type", "") or ""))
                if not parsed:
                    continue
                source_file = build_source_file(row["username"], row["date"], activity_index, parsed, details)
                if source_already_present(source_files, source_file["id"], source_file.get("filename", "")):
                    continue
                source_files.append(source_file)
                activity["source_files"] = source_files
                activity["metric_source_preferences"] = {
                    **{
                        key: value
                        for key, value in (activity.get("metric_source_preferences") or {}).items()
                        if key in METRIC_KEYS and value
                    },
                    **{key: source_file["id"] for key in source_file["metrics"]},
                }
                session_changed = True
                changed_activities += 1
            if session_changed:
                changed_sessions += 1
                if not dry_run:
                    conn.execute(
                        "update sessions set data = ? where id = ?",
                        (json.dumps(payload, ensure_ascii=False), row["id"]),
                    )
        if not dry_run:
            conn.commit()
        return changed_sessions, changed_activities
    finally:
        conn.close()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--db", default=os.environ.get("REHAB_DB_PATH", str(DEFAULT_DB_PATH)), help="Path to SQLite database")
    parser.add_argument("--dry-run", action="store_true", help="Report changes without writing")
    parser.add_argument("--username", default="", help="Only backfill one username")
    parser.add_argument("--date", default="", help="Only backfill one date (YYYY-MM-DD)")
    args = parser.parse_args()

    db_path = Path(args.db)
    if not db_path.is_file():
        print(f"Database not found: {db_path}", file=sys.stderr)
        return 1
    if args.date:
        try:
            datetime.strptime(args.date, "%Y-%m-%d")
        except ValueError:
            print("--date must use YYYY-MM-DD", file=sys.stderr)
            return 1
    sessions, activities = backfill(db_path, dry_run=args.dry_run, username=args.username, date_value=args.date)
    mode = "would update" if args.dry_run else "updated"
    print(f"{mode} {sessions} session(s), {activities} activity/activities")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
