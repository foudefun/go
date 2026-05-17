import mimetypes
import os
import re
import sqlite3
from pathlib import Path
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen


ROOT_DIR = Path(__file__).resolve().parents[1]
DEFAULT_DB_PATH = ROOT_DIR / "backend" / "data" / "db.sqlite"
MAX_LOGO_BYTES = 1_500_000


def db_path() -> Path:
    value = os.getenv("REHAB_DB_PATH")
    return Path(value).expanduser() if value else DEFAULT_DB_PATH


def uploads_dir(database: Path) -> Path:
    return database.parent / "uploads" / "equipment-brands"


def is_local_logo(value: str) -> bool:
    return value.startswith("/api/uploads/equipment-brands/")


def is_http_url(value: str) -> bool:
    return value.startswith("https://") or value.startswith("http://")


def safe_slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", str(value or "").lower()).strip("_")
    return slug or "brand"


def domain_from_url(value: str) -> str:
    parsed = urlparse(value if "://" in value else f"https://{value}")
    return parsed.netloc.removeprefix("www.").strip().lower()


def logo_candidates(row: sqlite3.Row) -> list[str]:
    candidates = []
    logo_url = str(row["logo_url"] or "").strip()
    website_url = str(row["website_url"] or "").strip()
    if is_http_url(logo_url):
        candidates.append(logo_url)
    if website_url:
        domain = domain_from_url(website_url)
        if domain:
            candidates.append(f"https://www.google.com/s2/favicons?domain={quote(domain)}&sz=256")
    return candidates


def extension_for_response(url: str, content_type: str) -> str:
    content_type = content_type.split(";", 1)[0].strip().lower()
    if content_type == "image/svg+xml":
        return ".svg"
    guessed = mimetypes.guess_extension(content_type)
    if guessed in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}:
        return ".jpg" if guessed == ".jpeg" else guessed
    suffix = Path(urlparse(url).path).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}:
        return ".jpg" if suffix == ".jpeg" else suffix
    return ".png"


def download_logo(url: str) -> tuple[bytes, str] | None:
    request = Request(url, headers={"User-Agent": "RehabTracker/1.0"})
    with urlopen(request, timeout=15) as response:
        content_type = response.headers.get("Content-Type", "")
        if "image/" not in content_type:
            return None
        data = response.read(MAX_LOGO_BYTES + 1)
        if not data or len(data) > MAX_LOGO_BYTES:
            return None
        return data, extension_for_response(url, content_type)


def cache_logos(conn: sqlite3.Connection, target_dir: Path) -> tuple[int, int]:
    target_dir.mkdir(parents=True, exist_ok=True)
    rows = conn.execute(
        """
        SELECT id, name, normalized_name, website_url, logo_url
        FROM equipment_brands
        ORDER BY name
        """
    ).fetchall()
    updated = 0
    attempted = 0
    for row in rows:
        current_logo = str(row["logo_url"] or "").strip()
        if is_local_logo(current_logo):
            continue
        candidates = logo_candidates(row)
        if not candidates:
            continue
        attempted += 1
        for candidate in candidates:
            try:
                result = download_logo(candidate)
            except Exception:
                continue
            if not result:
                continue
            data, extension = result
            filename = f"{safe_slug(row['name'])}_{row['id']}{extension}"
            target_path = target_dir / filename
            target_path.write_bytes(data)
            logo_url = f"/api/uploads/equipment-brands/{filename}"
            conn.execute(
                "UPDATE equipment_brands SET logo_url = ?, updated_at = date('now') WHERE id = ?",
                (logo_url, row["id"]),
            )
            updated += 1
            break
    return attempted, updated


def main() -> None:
    database = db_path()
    conn = sqlite3.connect(database)
    conn.row_factory = sqlite3.Row
    try:
        attempted, updated = cache_logos(conn, uploads_dir(database))
        conn.commit()
        print(f"Equipment brand logos attempted: {attempted}")
        print(f"Equipment brand logos cached: {updated}")
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


if __name__ == "__main__":
    main()
