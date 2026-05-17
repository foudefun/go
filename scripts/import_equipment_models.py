import csv
import os
import re
import sqlite3
import unicodedata
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DB_PATH = ROOT_DIR / "backend" / "data" / "db.sqlite"
DEFAULT_CSV_PATH = ROOT_DIR / "imports" / "equipment_models_seed.csv"


def db_path() -> Path:
    value = os.getenv("REHAB_DB_PATH")
    return Path(value).expanduser() if value else DEFAULT_DB_PATH


def optional_int(value):
    text = str(value or "").strip()
    return int(text) if text else None


def optional_text(value):
    text = str(value or "").strip()
    return text or None


def bool_int(value, default=1):
    text = str(value if value is not None else "").strip().lower()
    if not text:
        return default
    return 0 if text in {"0", "false", "no", "inactive"} else 1


def normalize_text_key(value: str) -> str:
    normalized = unicodedata.normalize("NFD", str(value or "").strip().lower())
    without_accents = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", without_accents).strip()


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS equipment_categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR NOT NULL UNIQUE,
            normalized_name VARCHAR UNIQUE,
            display_name_fr TEXT,
            display_name_en TEXT,
            parent_id INTEGER,
            is_active BOOLEAN NOT NULL DEFAULT 1,
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR,
            FOREIGN KEY(parent_id) REFERENCES equipment_categories(id)
        );

        CREATE TABLE IF NOT EXISTS equipment_models (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            brand_id INTEGER NOT NULL,
            name VARCHAR NOT NULL,
            normalized_name VARCHAR,
            category_id INTEGER,
            description TEXT,
            is_active BOOLEAN NOT NULL DEFAULT 1,
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR,
            history TEXT,
            FOREIGN KEY(brand_id) REFERENCES equipment_brands(id),
            FOREIGN KEY(category_id) REFERENCES equipment_categories(id),
            UNIQUE(brand_id, normalized_name)
        );

        CREATE TABLE IF NOT EXISTS equipment_model_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            model_id INTEGER NOT NULL,
            version_name VARCHAR,
            release_year INTEGER,
            season VARCHAR,
            generation VARCHAR,
            description TEXT,
            technical_specs TEXT,
            product_url TEXT,
            image_url TEXT,
            discontinued_year INTEGER,
            is_active BOOLEAN NOT NULL DEFAULT 1,
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR,
            FOREIGN KEY(model_id) REFERENCES equipment_models(id) ON DELETE CASCADE
        );
        """
    )


def ensure_category(conn: sqlite3.Connection, name: str, created_at: str) -> int | None:
    label = str(name or "").strip()
    if not label:
        return None
    normalized = normalize_text_key(label)
    conn.execute(
        """
        INSERT INTO equipment_categories
        (name, normalized_name, display_name_fr, display_name_en, is_active, created_at, updated_at)
        VALUES (:name, :normalized_name, :display_name_fr, :display_name_en, 1, :created_at, :updated_at)
        ON CONFLICT(normalized_name) DO UPDATE SET
            display_name_fr = COALESCE(equipment_categories.display_name_fr, excluded.display_name_fr),
            display_name_en = COALESCE(equipment_categories.display_name_en, excluded.display_name_en),
            is_active = 1,
            updated_at = excluded.updated_at
        """,
        {
            "name": normalized,
            "normalized_name": normalized,
            "display_name_fr": label,
            "display_name_en": label,
            "created_at": created_at,
            "updated_at": created_at,
        },
    )
    row = conn.execute("SELECT id FROM equipment_categories WHERE normalized_name = ?", (normalized,)).fetchone()
    return row[0] if row else None


def load_records(csv_path: Path) -> list[dict]:
    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))

    records = []
    for row in rows:
        brand_name = str(row.get("brand_name", "")).strip()
        model_name = str(row.get("model_name", "")).strip()
        if not brand_name or not model_name:
            continue
        created_at = str(row.get("created_at", "")).strip() or "2026-05-17"
        records.append(
            {
                "brand_name": brand_name,
                "model_name": model_name,
                "normalized_name": optional_text(row.get("normalized_name")) or normalize_text_key(model_name),
                "category": optional_text(row.get("category")),
                "version_name": optional_text(row.get("version_name")) or model_name,
                "release_year": optional_int(row.get("release_year")),
                "season": optional_text(row.get("season")),
                "generation": optional_text(row.get("generation")),
                "description": optional_text(row.get("description")),
                "technical_specs": optional_text(row.get("technical_specs")),
                "product_url": optional_text(row.get("product_url")),
                "image_url": optional_text(row.get("image_url")),
                "discontinued_year": optional_int(row.get("discontinued_year")),
                "is_active": bool_int(row.get("is_active"), 1),
                "created_at": created_at,
                "updated_at": optional_text(row.get("updated_at")) or created_at,
                "history": optional_text(row.get("history")),
            }
        )
    return records


def import_models(conn: sqlite3.Connection, records: list[dict]) -> tuple[int, int, int]:
    brand_ids = {row[1]: row[0] for row in conn.execute("SELECT id, name FROM equipment_brands").fetchall()}
    missing_brands = sorted({row["brand_name"] for row in records if row["brand_name"] not in brand_ids})
    if missing_brands:
        raise RuntimeError(f"Missing equipment_brands rows for: {', '.join(missing_brands)}")

    imported_versions = 0
    for record in records:
        brand_id = brand_ids[record["brand_name"]]
        category_id = ensure_category(conn, record["category"], record["created_at"]) if record["category"] else None
        conn.execute(
            """
            INSERT INTO equipment_models
            (brand_id, name, normalized_name, category_id, description, is_active, created_at, updated_at, history)
            VALUES (:brand_id, :name, :normalized_name, :category_id, :description, :is_active, :created_at, :updated_at, :history)
            ON CONFLICT(brand_id, normalized_name) DO UPDATE SET
                name = excluded.name,
                category_id = COALESCE(excluded.category_id, equipment_models.category_id),
                description = COALESCE(excluded.description, equipment_models.description),
                is_active = excluded.is_active,
                updated_at = excluded.updated_at,
                history = COALESCE(excluded.history, equipment_models.history)
            """,
            {
                "brand_id": brand_id,
                "name": record["model_name"],
                "normalized_name": record["normalized_name"],
                "category_id": category_id,
                "description": record["description"],
                "is_active": record["is_active"],
                "created_at": record["created_at"],
                "updated_at": record["updated_at"],
                "history": record["history"],
            },
        )
        model_id = conn.execute(
            "SELECT id FROM equipment_models WHERE brand_id = ? AND normalized_name = ?",
            (brand_id, record["normalized_name"]),
        ).fetchone()[0]
        existing_version = conn.execute(
            """
            SELECT id
            FROM equipment_model_versions
            WHERE model_id = ?
              AND COALESCE(version_name, '') = COALESCE(?, '')
              AND COALESCE(release_year, 0) = COALESCE(?, 0)
              AND COALESCE(season, '') = COALESCE(?, '')
              AND COALESCE(generation, '') = COALESCE(?, '')
            """,
            (model_id, record["version_name"], record["release_year"], record["season"], record["generation"]),
        ).fetchone()
        if existing_version:
            conn.execute(
                """
                UPDATE equipment_model_versions
                SET description = COALESCE(:description, description),
                    technical_specs = COALESCE(:technical_specs, technical_specs),
                    product_url = COALESCE(:product_url, product_url),
                    image_url = COALESCE(:image_url, image_url),
                    discontinued_year = COALESCE(:discontinued_year, discontinued_year),
                    is_active = :is_active,
                    updated_at = :updated_at
                WHERE id = :id
                """,
                {**record, "id": existing_version[0]},
            )
        else:
            conn.execute(
                """
                INSERT INTO equipment_model_versions
                (model_id, version_name, release_year, season, generation, description, technical_specs,
                 product_url, image_url, discontinued_year, is_active, created_at, updated_at)
                VALUES
                (:model_id, :version_name, :release_year, :season, :generation, :description, :technical_specs,
                 :product_url, :image_url, :discontinued_year, :is_active, :created_at, :updated_at)
                """,
                {**record, "model_id": model_id},
            )
            imported_versions += 1

    model_count = conn.execute("SELECT COUNT(*) FROM equipment_models").fetchone()[0]
    version_count = conn.execute("SELECT COUNT(*) FROM equipment_model_versions").fetchone()[0]
    return model_count, version_count, imported_versions


def main() -> None:
    database = db_path()
    csv_path = Path(os.getenv("EQUIPMENT_MODELS_CSV", DEFAULT_CSV_PATH)).expanduser()
    database.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(database)
    try:
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("BEGIN")
        ensure_schema(conn)
        records = load_records(csv_path)
        model_count, version_count, imported_versions = import_models(conn, records)
        problems = conn.execute("PRAGMA foreign_key_check").fetchall()
        if problems:
            raise RuntimeError(f"Foreign key check failed: {problems}")
        conn.commit()
        print(f"Imported or updated {len(records)} equipment model seed rows into {database}")
        print(f"equipment_models total rows: {model_count}")
        print(f"equipment_model_versions total rows: {version_count}")
        print(f"new equipment_model_versions rows: {imported_versions}")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
