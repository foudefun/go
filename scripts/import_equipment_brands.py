import csv
import os
import sqlite3
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DB_PATH = ROOT_DIR / "backend" / "data" / "db.sqlite"
DEFAULT_CSV_PATH = ROOT_DIR / "imports" / "equipment_brands_enriched.csv"


COUNTRIES = [
    ("AT", "Autriche", "Austria"),
    ("BE", "Belgique", "Belgium"),
    ("CA", "Canada", "Canada"),
    ("CH", "Suisse", "Switzerland"),
    ("CN", "Chine", "China"),
    ("CZ", "Tchéquie", "Czechia"),
    ("DE", "Allemagne", "Germany"),
    ("ES", "Espagne", "Spain"),
    ("FR", "France", "France"),
    ("GB", "Royaume-Uni", "United Kingdom"),
    ("IT", "Italie", "Italy"),
    ("JP", "Japon", "Japan"),
    ("KR", "Corée du Sud", "South Korea"),
    ("PL", "Pologne", "Poland"),
    ("SI", "Slovénie", "Slovenia"),
    ("US", "États-Unis", "United States"),
]


def db_path() -> Path:
    value = os.getenv("REHAB_DB_PATH")
    return Path(value).expanduser() if value else DEFAULT_DB_PATH


def optional_int(value):
    text = str(value or "").strip()
    return int(text) if text else None


def optional_text(value):
    text = str(value or "").strip()
    return text or None


def ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS countries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            iso_code VARCHAR NOT NULL UNIQUE,
            name_fr VARCHAR NOT NULL,
            name_en VARCHAR NOT NULL,
            is_active BOOLEAN NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS equipment_brands (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR NOT NULL UNIQUE,
            normalized_name VARCHAR,
            country_id INTEGER,
            year_established INTEGER,
            website_url TEXT,
            description TEXT,
            logo_url TEXT,
            is_active BOOLEAN NOT NULL,
            created_at VARCHAR NOT NULL,
            updated_at VARCHAR,
            history TEXT,
            FOREIGN KEY(country_id) REFERENCES countries(id)
        )
        """
    )


def seed_countries(conn: sqlite3.Connection) -> None:
    conn.executemany(
        """
        INSERT INTO countries (iso_code, name_fr, name_en, is_active)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(iso_code) DO UPDATE SET
            name_fr = excluded.name_fr,
            name_en = excluded.name_en,
            is_active = 1
        """,
        COUNTRIES,
    )


def load_records(csv_path: Path) -> list[dict]:
    with csv_path.open(newline="", encoding="utf-8-sig") as handle:
        rows = list(csv.DictReader(handle))

    records = []
    for row in rows:
        records.append(
            {
                "name": str(row.get("name", "")).strip(),
                "normalized_name": optional_text(row.get("normalized_name")),
                "country_id": optional_int(row.get("country_id")),
                "year_established": optional_int(row.get("year_established")),
                "website_url": optional_text(row.get("website_url")),
                "description": optional_text(row.get("description")),
                "logo_url": optional_text(row.get("logo_url")),
                "is_active": 0 if str(row.get("is_active", "1")).strip().lower() in {"0", "false"} else 1,
                "created_at": str(row.get("created_at", "")).strip() or "2026-05-16",
                "updated_at": optional_text(row.get("updated_at")),
                "history": optional_text(row.get("history")),
            }
        )
    return records


def import_brands(conn: sqlite3.Connection, records: list[dict]) -> tuple[int, int]:
    country_ids = {row[0] for row in conn.execute("SELECT id FROM countries")}
    invalid_country_ids = sorted({row["country_id"] for row in records if row["country_id"] and row["country_id"] not in country_ids})
    if invalid_country_ids:
        raise RuntimeError(f"Invalid country_id values: {invalid_country_ids}")

    conn.executemany(
        """
        INSERT INTO equipment_brands (
            name, normalized_name, country_id, year_established, website_url,
            description, logo_url, is_active, created_at, updated_at, history
        ) VALUES (
            :name, :normalized_name, :country_id, :year_established, :website_url,
            :description, :logo_url, :is_active, :created_at, :updated_at, :history
        )
        ON CONFLICT(name) DO UPDATE SET
            normalized_name = excluded.normalized_name,
            country_id = excluded.country_id,
            year_established = excluded.year_established,
            website_url = excluded.website_url,
            description = excluded.description,
            logo_url = CASE
                WHEN equipment_brands.logo_url LIKE '/api/uploads/equipment-brands/%'
                THEN equipment_brands.logo_url
                ELSE excluded.logo_url
            END,
            is_active = excluded.is_active,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at,
            history = excluded.history
        """,
        records,
    )
    count = conn.execute("SELECT COUNT(*) FROM equipment_brands").fetchone()[0]
    return len(records), count


def main() -> None:
    database = db_path()
    csv_path = Path(os.getenv("EQUIPMENT_BRANDS_CSV", DEFAULT_CSV_PATH)).expanduser()
    database.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(database)
    try:
        conn.execute("PRAGMA foreign_keys=ON")
        conn.execute("BEGIN")
        ensure_schema(conn)
        seed_countries(conn)
        imported, total = import_brands(conn, load_records(csv_path))
        problems = conn.execute("PRAGMA foreign_key_check").fetchall()
        if problems:
            raise RuntimeError(f"Foreign key check failed: {problems}")
        conn.commit()
        print(f"Imported or updated {imported} brand rows into {database}")
        print(f"equipment_brands total rows: {total}")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
