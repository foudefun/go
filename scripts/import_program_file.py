import json
import sqlite3
import sys
from pathlib import Path


def ensure_columns(cursor: sqlite3.Cursor) -> None:
    columns = {row[1] for row in cursor.execute("PRAGMA table_info(exercises)").fetchall()}
    for name, sql in (
        ("display_name", "ALTER TABLE exercises ADD COLUMN display_name TEXT"),
        ("display_name_fr", "ALTER TABLE exercises ADD COLUMN display_name_fr TEXT"),
        ("display_name_en", "ALTER TABLE exercises ADD COLUMN display_name_en TEXT"),
        ("category", "ALTER TABLE exercises ADD COLUMN category TEXT"),
        ("link", "ALTER TABLE exercises ADD COLUMN link TEXT"),
        ("image", "ALTER TABLE exercises ADD COLUMN image TEXT"),
        ("images_json", "ALTER TABLE exercises ADD COLUMN images_json TEXT"),
        ("document", "ALTER TABLE exercises ADD COLUMN document TEXT"),
    ):
        if name not in columns:
            cursor.execute(sql)


def parse_multi_value(value: str) -> list[str]:
    return [
        part.strip()
        for part in str(value or "").replace(";", ",").split(",")
        if part.strip()
    ]


def merge_unique(existing: list[str], incoming: list[str]) -> list[str]:
    merged: list[str] = []
    seen: set[str] = set()
    for item in [*existing, *incoming]:
        cleaned = str(item or "").strip()
        if not cleaned or cleaned in seen:
            continue
        merged.append(cleaned)
        seen.add(cleaned)
    return merged


def parse_images_json(raw_value: str) -> list[str]:
    text = str(raw_value or "").strip()
    if not text:
        return []
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return []
    if not isinstance(parsed, list):
        return []
    return [str(item or "").strip() for item in parsed if str(item or "").strip()]


def normalize_record(record: dict) -> tuple[str, str, str, str, str, str, str, str, str, str]:
    name = str(record.get("name", "") or "").strip()
    display_name = str(record.get("display_name", "") or "").strip() or name.replace("_", " ")
    display_name_fr = str(record.get("display_name_fr", "") or "").strip() or display_name
    display_name_en = str(record.get("display_name_en", "") or "").strip() or display_name
    category_values = parse_multi_value(str(record.get("category", "") or record.get("block", "") or ""))
    category = ", ".join(category_values)
    description = str(record.get("description", "") or "").strip()
    link = str(record.get("link", "") or "").strip()
    image = str(record.get("image", "") or "").strip()
    image_values = merge_unique([image] if image else [], record.get("images", []) if isinstance(record.get("images"), list) else [])
    document = str(record.get("document", "") or "").strip()
    return name, display_name, display_name_fr, display_name_en, category, description, link, image, json.dumps(image_values, ensure_ascii=False), document


def main() -> int:
    if len(sys.argv) != 3:
        print("usage: python scripts/import_program_file.py <db_path> <import_json>")
        return 1

    db_path = Path(sys.argv[1]).expanduser().resolve()
    import_path = Path(sys.argv[2]).expanduser().resolve()
    payload = json.loads(import_path.read_text(encoding="utf-8"))

    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("PRAGMA journal_mode=MEMORY")
    cursor.execute("PRAGMA temp_store=MEMORY")
    ensure_columns(cursor)

    imported = 0
    for exercise in payload.get("exercises", []):
        (
            name,
            display_name,
            display_name_fr,
            display_name_en,
            category,
            description,
            link,
            image,
            images_json,
            document,
        ) = normalize_record(exercise)
        if not name:
            continue
        existing = cursor.execute(
            """
            SELECT display_name, display_name_fr, display_name_en, category, description, link, image, images_json, document
            FROM exercises
            WHERE name = ?
            """,
            (name,),
        ).fetchone()
        if existing:
            existing_categories = parse_multi_value(existing[3] or "")
            incoming_categories = parse_multi_value(category)
            merged_categories = ", ".join(merge_unique(existing_categories, incoming_categories))

            existing_images = merge_unique(
                [existing[6]] if str(existing[6] or "").strip() else [],
                parse_images_json(existing[7] or ""),
            )
            incoming_images = merge_unique(
                [image] if image else [],
                parse_images_json(images_json),
            )
            merged_images = merge_unique(existing_images, incoming_images)

            cursor.execute(
                """
                UPDATE exercises
                SET display_name = ?,
                    display_name_fr = ?,
                    display_name_en = ?,
                    category = ?,
                    description = ?,
                    link = ?,
                    image = ?,
                    images_json = ?,
                    document = ?
                WHERE name = ?
                """,
                (
                    str(existing[0] or "").strip() or display_name,
                    str(existing[1] or "").strip() or display_name_fr,
                    str(existing[2] or "").strip() or display_name_en,
                    merged_categories,
                    str(existing[4] or "").strip() or description,
                    str(existing[5] or "").strip() or link,
                    (str(existing[6] or "").strip() or (merged_images[0] if merged_images else "")),
                    json.dumps(merged_images, ensure_ascii=False),
                    str(existing[8] or "").strip() or document,
                    name,
                ),
            )
        else:
            cursor.execute(
                """
                INSERT INTO exercises(name, display_name, display_name_fr, display_name_en, category, description, link, image, images_json, document)
                VALUES(?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (name, display_name, display_name_fr, display_name_en, category, description, link, image, images_json, document),
            )
        imported += 1

    conn.commit()
    conn.close()
    print(json.dumps({"imported_exercises": imported, "db_path": str(db_path)}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
