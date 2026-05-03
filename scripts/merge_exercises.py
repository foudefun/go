import json
import sqlite3
import sys
from pathlib import Path


TEXT_FIELDS = ("display_name", "category", "description", "link", "image", "document")


def ensure_columns(cursor: sqlite3.Cursor) -> None:
    columns = {row[1] for row in cursor.execute("PRAGMA table_info(exercises)").fetchall()}
    for name, sql in (
        ("display_name", "ALTER TABLE exercises ADD COLUMN display_name TEXT"),
        ("category", "ALTER TABLE exercises ADD COLUMN category TEXT"),
        ("link", "ALTER TABLE exercises ADD COLUMN link TEXT"),
        ("image", "ALTER TABLE exercises ADD COLUMN image TEXT"),
        ("document", "ALTER TABLE exercises ADD COLUMN document TEXT"),
    ):
        if name not in columns:
            cursor.execute(sql)


def load_exercise(cursor: sqlite3.Cursor, name: str) -> dict | None:
    row = cursor.execute(
        """
        SELECT name, display_name, category, description, link, image, document
        FROM exercises
        WHERE name = ?
        """,
        (name,),
    ).fetchone()
    if not row:
        return None
    keys = ("name", "display_name", "category", "description", "link", "image", "document")
    return dict(zip(keys, row))


def coalesce_text(*values: str) -> str:
    for value in values:
        text = str(value or "").strip()
        if text:
            return text
    return ""


def merge_exercise_records(canonical: dict, alias: dict) -> dict:
    merged = dict(canonical)
    merged["display_name"] = coalesce_text(canonical.get("display_name"), alias.get("display_name"), canonical["name"].replace("_", " "))
    merged["category"] = coalesce_text(canonical.get("category"), alias.get("category"))

    for field in ("link", "image", "document"):
        merged[field] = coalesce_text(canonical.get(field), alias.get(field))

    canonical_description = str(canonical.get("description", "") or "").strip()
    alias_description = str(alias.get("description", "") or "").strip()
    if len(alias_description) > len(canonical_description):
        merged["description"] = alias_description
    else:
        merged["description"] = canonical_description

    return merged


def update_exercise(cursor: sqlite3.Cursor, record: dict) -> None:
    cursor.execute(
        """
        UPDATE exercises
        SET display_name = ?,
            category = ?,
            description = ?,
            link = ?,
            image = ?,
            document = ?
        WHERE name = ?
        """,
        (
            str(record.get("display_name", "") or "").strip(),
            str(record.get("category", "") or "").strip(),
            str(record.get("description", "") or "").strip(),
            str(record.get("link", "") or "").strip(),
            str(record.get("image", "") or "").strip(),
            str(record.get("document", "") or "").strip(),
            record["name"],
        ),
    )


def rewrite_session_payload(payload: dict, aliases: dict[str, str]) -> tuple[dict, bool]:
    changed = False

    rewritten_exercises = []
    seen = set()
    for exercise_name in payload.get("exercises", []):
        canonical_name = aliases.get(exercise_name, exercise_name)
        changed = changed or canonical_name != exercise_name
        if canonical_name not in seen:
            rewritten_exercises.append(canonical_name)
            seen.add(canonical_name)
    payload["exercises"] = rewritten_exercises

    rewritten_items = []
    for item in payload.get("planned_items", []):
        new_item = dict(item)
        original_name = str(new_item.get("exercise_name", "") or "")
        canonical_name = aliases.get(original_name, original_name)
        if canonical_name != original_name:
            new_item["exercise_name"] = canonical_name
            changed = True
        rewritten_items.append(new_item)
    payload["planned_items"] = rewritten_items

    return payload, changed


def apply_updates(cursor: sqlite3.Cursor, updates: dict[str, dict]) -> int:
    applied = 0
    for name, patch in updates.items():
        record = load_exercise(cursor, name)
        if not record:
            continue
        for field in TEXT_FIELDS:
            if field in patch:
                record[field] = str(patch[field] or "").strip()
        update_exercise(cursor, record)
        applied += 1
    return applied


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: python scripts/merge_exercises.py <db_path> <merge_plan_json>")
        return 1

    db_path = Path(sys.argv[1]).expanduser().resolve()
    plan_path = Path(sys.argv[2]).expanduser().resolve()
    plan = json.loads(plan_path.read_text(encoding="utf-8"))
    aliases = {str(k): str(v) for k, v in plan.get("aliases", {}).items() if str(k) and str(v) and str(k) != str(v)}
    updates = {str(k): dict(v) for k, v in plan.get("updates", {}).items()}

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode=MEMORY")
    cursor.execute("PRAGMA synchronous=NORMAL")
    ensure_columns(cursor)

    session_updates = 0
    for session_date, raw_data in cursor.execute("SELECT date, data FROM sessions ORDER BY date").fetchall():
        payload = json.loads(raw_data or "{}")
        rewritten, changed = rewrite_session_payload(payload, aliases)
        if changed:
            cursor.execute(
                "UPDATE sessions SET data = ? WHERE date = ?",
                (json.dumps(rewritten, ensure_ascii=False), session_date),
            )
            session_updates += 1

    merged_aliases = 0
    deleted_aliases = 0
    for alias_name, canonical_name in aliases.items():
        alias_record = load_exercise(cursor, alias_name)
        if not alias_record:
            continue

        canonical_record = load_exercise(cursor, canonical_name)
        if canonical_record:
            update_exercise(cursor, merge_exercise_records(canonical_record, alias_record))
            merged_aliases += 1
            cursor.execute("DELETE FROM exercises WHERE name = ?", (alias_name,))
            deleted_aliases += 1
            continue

        cursor.execute("UPDATE exercises SET name = ? WHERE name = ?", (canonical_name, alias_name))
        merged_aliases += 1

    updated_records = apply_updates(cursor, updates)

    conn.commit()
    total_exercises = cursor.execute("SELECT COUNT(*) FROM exercises").fetchone()[0]
    conn.close()

    print(
        json.dumps(
            {
                "db_path": str(db_path),
                "session_updates": session_updates,
                "merged_aliases": merged_aliases,
                "deleted_aliases": deleted_aliases,
                "updated_records": updated_records,
                "total_exercises": total_exercises,
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
