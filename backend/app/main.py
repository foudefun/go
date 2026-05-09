
import csv
import hashlib
import hmac
import json
import os
import secrets
import shutil
import uuid
from datetime import date, datetime, timedelta, timezone
from io import StringIO
from pathlib import Path

from fastapi import Depends, FastAPI, File, Header, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from sqlalchemy import Boolean, Column, Float, Integer, String, Text, UniqueConstraint, create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

app = FastAPI(title="Rehab Tracker V19b")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

BACKEND_DIR = Path(__file__).resolve().parents[1]
db_path_setting = os.getenv("REHAB_DB_PATH", str(BACKEND_DIR / "data" / "dev.sqlite"))
DB_PATH = Path(db_path_setting).expanduser()
if not DB_PATH.is_absolute():
    DB_PATH = (BACKEND_DIR / DB_PATH).resolve()
DB_PATH.parent.mkdir(parents=True, exist_ok=True)
UPLOADS_DIR = DB_PATH.parent / "uploads"
EXERCISE_UPLOADS_DIR = UPLOADS_DIR / "exercises"
EXERCISE_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(f"sqlite:///{DB_PATH.as_posix()}", connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

DEFAULT_USERNAME = os.getenv("REHAB_DEFAULT_USERNAME", "admin")
DEFAULT_PASSWORD = os.getenv("REHAB_DEFAULT_PASSWORD", "changeme123")
TOKEN_TTL_HOURS = int(os.getenv("REHAB_TOKEN_TTL_HOURS", "168"))
PASSWORD_ITERATIONS = 200_000

class SessionModel(Base):
    __tablename__ = "sessions"
    __table_args__ = (UniqueConstraint("username", "date", name="uq_sessions_username_date"),)
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, nullable=False)
    date = Column(String, nullable=False)
    data = Column(Text)

class ExerciseModel(Base):
    __tablename__ = "exercises"
    name = Column(String, primary_key=True)
    display_name = Column(Text)
    display_name_fr = Column(Text)
    display_name_en = Column(Text)
    category = Column(Text)
    movement_family = Column(Text)
    variant_label = Column(Text)
    tracking_mode = Column(String)
    weight_unit = Column(String)
    description = Column(Text)
    link = Column(Text)
    image = Column(Text)
    images_json = Column(Text)
    document = Column(Text)

class EquipmentModel(Base):
    __tablename__ = "equipment"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False, unique=True)
    brand_id = Column(Integer)
    model_id = Column(Integer)
    category = Column(Text)
    description = Column(Text)
    image = Column(Text)
    link = Column(Text)

class EquipmentBrandModel(Base):
    __tablename__ = "equipment_brands"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False, unique=True)
    created_at = Column(String, nullable=False)
    history = Column(Text)

class EquipmentModelRef(Base):
    __tablename__ = "equipment_models"
    id = Column(Integer, primary_key=True, autoincrement=True)
    brand_id = Column(Integer, nullable=False)
    name = Column(String, nullable=False)
    created_at = Column(String, nullable=False)
    history = Column(Text)

class UserEquipmentModel(Base):
    __tablename__ = "user_equipment"
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, nullable=False)
    equipment_id = Column(Integer, nullable=False)
    purchase_date = Column(String, nullable=False)
    purchase_price = Column(Float)
    note = Column(Text)

class UserModel(Base):
    __tablename__ = "users"
    username = Column(String, primary_key=True)
    password_hash = Column(Text, nullable=False)
    password_salt = Column(Text, nullable=False)
    is_admin = Column(Boolean, nullable=False, default=False)
    language = Column(String, nullable=False, default="fr")

class AuthTokenModel(Base):
    __tablename__ = "auth_tokens"
    token_hash = Column(String, primary_key=True)
    username = Column(String, nullable=False)
    expires_at = Column(String, nullable=False)

class AppConfigModel(Base):
    __tablename__ = "app_config"
    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)

class AuditLogModel(Base):
    __tablename__ = "audit_logs"
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, nullable=False)
    action = Column(String, nullable=False)
    target_type = Column(String, nullable=False)
    target_key = Column(String, nullable=False)
    summary = Column(Text)
    created_at = Column(String, nullable=False)

Base.metadata.create_all(engine)

def ensure_columns():
    # lightweight migration for existing sqlite DB
    with engine.begin() as conn:
        session_exists = conn.exec_driver_sql(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='sessions'"
        ).fetchone()
        if session_exists:
            owner_username = DEFAULT_USERNAME
            users_exists = conn.exec_driver_sql(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
            ).fetchone()
            if users_exists:
                user_rows = conn.exec_driver_sql(
                    "SELECT username, COALESCE(is_admin, 0) FROM users ORDER BY username"
                ).fetchall()
                usernames = [str(row[0]) for row in user_rows if row[0]]
                non_admin_usernames = [str(row[0]) for row in user_rows if row[0] and not int(row[1] or 0)]
                if len(non_admin_usernames) == 1:
                    owner_username = non_admin_usernames[0]
                elif DEFAULT_USERNAME in usernames:
                    owner_username = DEFAULT_USERNAME
                elif usernames:
                    owner_username = usernames[0]
            session_columns = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(sessions)").fetchall()}
            if "id" not in session_columns or "username" not in session_columns:
                legacy_rows = conn.exec_driver_sql("SELECT date, data FROM sessions").fetchall()
                conn.exec_driver_sql("DROP TABLE IF EXISTS sessions_legacy")
                conn.exec_driver_sql("ALTER TABLE sessions RENAME TO sessions_legacy")
                conn.exec_driver_sql(
                    """
                    CREATE TABLE sessions (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        username TEXT NOT NULL,
                        date TEXT NOT NULL,
                        data TEXT
                    )
                    """
                )
                conn.exec_driver_sql(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_username_date ON sessions(username, date)"
                )
                for legacy_row in legacy_rows:
                    conn.exec_driver_sql(
                        "INSERT INTO sessions (username, date, data) VALUES (:username, :date, :data)",
                        {
                            "username": owner_username,
                            "date": legacy_row[0],
                            "data": legacy_row[1],
                        },
                    )
                conn.exec_driver_sql("DROP TABLE sessions_legacy")
            else:
                conn.exec_driver_sql(
                    "CREATE UNIQUE INDEX IF NOT EXISTS uq_sessions_username_date ON sessions(username, date)"
                )

        existing = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(exercises)").fetchall()}
        if "display_name" not in existing:
            conn.exec_driver_sql("ALTER TABLE exercises ADD COLUMN display_name TEXT")
        if "display_name_fr" not in existing:
            conn.exec_driver_sql("ALTER TABLE exercises ADD COLUMN display_name_fr TEXT")
        if "display_name_en" not in existing:
            conn.exec_driver_sql("ALTER TABLE exercises ADD COLUMN display_name_en TEXT")
        if "category" not in existing:
            conn.exec_driver_sql("ALTER TABLE exercises ADD COLUMN category TEXT")
        if "movement_family" not in existing:
            conn.exec_driver_sql("ALTER TABLE exercises ADD COLUMN movement_family TEXT")
        if "variant_label" not in existing:
            conn.exec_driver_sql("ALTER TABLE exercises ADD COLUMN variant_label TEXT")
        if "tracking_mode" not in existing:
            conn.exec_driver_sql("ALTER TABLE exercises ADD COLUMN tracking_mode TEXT")
        if "weight_unit" not in existing:
            conn.exec_driver_sql("ALTER TABLE exercises ADD COLUMN weight_unit TEXT")
        if "link" not in existing:
            conn.exec_driver_sql("ALTER TABLE exercises ADD COLUMN link TEXT")
        if "image" not in existing:
            conn.exec_driver_sql("ALTER TABLE exercises ADD COLUMN image TEXT")
        if "images_json" not in existing:
            conn.exec_driver_sql("ALTER TABLE exercises ADD COLUMN images_json TEXT")
        if "document" not in existing:
            conn.exec_driver_sql("ALTER TABLE exercises ADD COLUMN document TEXT")
        conn.exec_driver_sql("UPDATE exercises SET display_name = REPLACE(name, '_', ' ') WHERE COALESCE(display_name, '') = ''")
        conn.exec_driver_sql("UPDATE exercises SET display_name_fr = display_name WHERE COALESCE(display_name_fr, '') = ''")
        conn.exec_driver_sql("UPDATE exercises SET display_name_en = display_name WHERE COALESCE(display_name_en, '') = ''")
        conn.exec_driver_sql("UPDATE exercises SET tracking_mode = 'reps_weight' WHERE COALESCE(tracking_mode, '') = ''")
        conn.exec_driver_sql("UPDATE exercises SET weight_unit = 'kg' WHERE COALESCE(weight_unit, '') = ''")

        equipment_exists = conn.exec_driver_sql(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='equipment'"
        ).fetchone()
        if equipment_exists:
            equipment_columns = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(equipment)").fetchall()}
            if "brand_id" not in equipment_columns:
                conn.exec_driver_sql("ALTER TABLE equipment ADD COLUMN brand_id INTEGER")
            if "model_id" not in equipment_columns:
                conn.exec_driver_sql("ALTER TABLE equipment ADD COLUMN model_id INTEGER")

        user_columns = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()}
        if "is_admin" not in user_columns:
            conn.exec_driver_sql("ALTER TABLE users ADD COLUMN is_admin INTEGER DEFAULT 0")
        if "language" not in user_columns:
            conn.exec_driver_sql("ALTER TABLE users ADD COLUMN language TEXT DEFAULT 'fr'")
        conn.exec_driver_sql("UPDATE users SET language = 'fr' WHERE COALESCE(language, '') = ''")
        conn.exec_driver_sql(
            "UPDATE users SET is_admin = 1 WHERE username = :username",
            {"username": DEFAULT_USERNAME},
        )

ensure_columns()

BASE_CONFIG = {
    "start_date": "2026-04-07",
    "start_load": 10,
    "increment": 5,
    "weight": 75,
    "increment_every_days": 2,
    "sport_after_days": 30,
}

DEFAULT_SESSION = {
    "exercises": [],
    "note": "",
    "status": "todo",
    "load": 0,
    "physio_time": "",
    "activity_type": "",
    "activity_details": "",
    "climbing_routes": [],
    "performed_items": [],
    "plan_activity_type": "",
    "plan_time": "",
    "plan_title": "",
    "duration_target_min": None,
    "location": "",
    "plan_notes": "",
    "planned_items": [],
    "used_equipment": [],
    "draft_performed_editor": {},
    "draft_planned_editor": {},
    "draft_selected_strength_category": "",
    "draft_planned_section_expanded": False,
    "draft_updated_at": "",
}

def normalize_physio_time(value) -> str:
    value = str(value or "").strip()
    if not value:
        return ""

    parts = value.split(":")
    if len(parts) != 2:
        return ""

    try:
        hour = int(parts[0])
        minute = int(parts[1])
    except ValueError:
        return ""

    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        return ""

    return f"{hour:02d}:{minute:02d}"

def normalize_optional_int(value):
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        return None

def normalize_optional_float(value):
    if value in (None, ""):
        return None
    try:
        return float(value)
    except (TypeError, ValueError):
        return None

def normalize_tracking_mode(value) -> str:
    mode = str(value or "").strip().lower()
    return mode if mode in {"reps_weight", "time_watts"} else "reps_weight"

def normalize_weight_unit(value) -> str:
    unit = str(value or "").strip().lower()
    return unit if unit in {"kg", "lb"} else "kg"

def normalize_work_mode(value) -> str:
    mode = str(value or "").strip().lower()
    return mode if mode in {"normal", "superset", "biset"} else "normal"

def normalize_work_type(value) -> str:
    work_type = str(value or "").strip().lower()
    return work_type if work_type in {"explosive", "force", "resistance", "endurance"} else "resistance"

def convert_weight_unit(weight, source_unit: str, target_unit: str):
    weight_value = normalize_optional_float(weight)
    if weight_value is None:
        return None
    source = normalize_weight_unit(source_unit)
    target = normalize_weight_unit(target_unit)
    if source == target:
        return round(weight_value, 2)
    if source == "lb" and target == "kg":
        return round(weight_value * 0.45359237, 2)
    if source == "kg" and target == "lb":
        return round(weight_value / 0.45359237, 2)
    return round(weight_value, 2)

def normalize_activity_type(value) -> str:
    allowed = {
        "course_a_pied",
        "velo",
        "vtt",
        "hockey",
        "escalade",
        "musculation",
        "yoga",
        "pilates",
    }
    normalized = str(value or "").strip().lower()
    return normalized if normalized in allowed else ""

def normalize_climbing_route(item: dict) -> dict:
    if not isinstance(item, dict):
        return {}
    rest_count = normalize_optional_int(item.get("rest_count"))
    normalized = {
        "spot": str(item.get("spot", "") or "").strip(),
        "name": str(item.get("name", "") or "").strip(),
        "topo_grade": str(item.get("topo_grade", item.get("difficulty", "")) or "").strip(),
        "felt_grade": str(item.get("felt_grade", "") or "").strip(),
        "own_grade": str(item.get("own_grade", "") or "").strip(),
        "ascent_style": str(item.get("ascent_style", "") or "").strip().lower(),
    }
    if normalized["ascent_style"] not in {"a_vue", "enchainee", "repos"}:
        normalized["ascent_style"] = ""
    if rest_count is not None and rest_count >= 0:
        normalized["rest_count"] = rest_count
    return {key: value for key, value in normalized.items() if value}

def normalize_used_equipment_item(item: dict) -> dict:
    if not isinstance(item, dict):
        return {}

    normalized = {
        "user_equipment_id": normalize_optional_int(item.get("user_equipment_id")),
        "equipment_id": normalize_optional_int(item.get("equipment_id")),
        "equipment_name": str(item.get("equipment_name", "") or "").strip(),
        "display_name": str(item.get("display_name", "") or "").strip(),
        "notes": str(item.get("notes", "") or "").strip(),
    }
    return {key: value for key, value in normalized.items() if value not in ("", None, [])}

def normalize_used_equipment_list(items) -> list[dict]:
    if not isinstance(items, list):
        return []
    return [
        normalized_item
        for item in items
        if (normalized_item := normalize_used_equipment_item(item))
    ]

def normalize_planned_item(item: dict) -> dict:
    if not isinstance(item, dict):
        return {}

    normalized = {
        "exercise_name": str(item.get("exercise_name", "")).strip(),
        "custom_name": str(item.get("custom_name", "") or "").strip(),
        "block": str(item.get("block", "")).strip(),
        "work_type": normalize_work_type(item.get("work_type")),
        "notes": str(item.get("notes", "")).strip(),
        "used_equipment": normalize_used_equipment_list(item.get("used_equipment", [])),
    }

    for key in ("sets", "reps", "duration_min", "duration_sec"):
        value = normalize_optional_int(item.get(key))
        if value is not None:
            normalized[key] = value

    return {key: value for key, value in normalized.items() if value not in ("", None, [])}

def normalize_performed_set(item: dict) -> dict:
    if not isinstance(item, dict):
        return {}

    normalized = {}
    reps = normalize_optional_int(item.get("reps"))
    if reps is not None:
        normalized["reps"] = reps

    weight = normalize_optional_float(item.get("weight"))
    if weight is not None:
        normalized["weight"] = weight
        normalized["weight_unit"] = normalize_weight_unit(item.get("weight_unit"))

    duration_sec = normalize_optional_int(item.get("duration_sec"))
    if duration_sec is not None:
        normalized["duration_sec"] = duration_sec

    watts = normalize_optional_float(item.get("watts"))
    if watts is not None:
        normalized["watts"] = watts

    return normalized

def normalize_performed_item(item: dict) -> dict:
    if not isinstance(item, dict):
        return {}

    normalized = {
        "exercise_name": str(item.get("exercise_name", "") or "").strip(),
        "custom_name": str(item.get("custom_name", "") or "").strip(),
        "work_mode": normalize_work_mode(item.get("work_mode")),
        "work_type": normalize_work_type(item.get("work_type")),
        "notes": str(item.get("notes", "") or "").strip(),
        "sets": [
            normalized_set
            for raw_set in item.get("sets", [])
            if (normalized_set := normalize_performed_set(raw_set))
        ],
        "used_equipment": normalize_used_equipment_list(item.get("used_equipment", [])),
    }
    return {key: value for key, value in normalized.items() if value not in ("", None, [])}

def normalize_performed_editor_draft(item: dict) -> dict:
    if not isinstance(item, dict):
        return {}

    normalized = {
        "index": normalize_optional_int(item.get("index")),
        "exercise_name": str(item.get("exercise_name", "") or "").strip(),
        "custom_name": str(item.get("custom_name", "") or "").strip(),
        "work_mode": normalize_work_mode(item.get("work_mode")),
        "work_type": normalize_work_type(item.get("work_type")),
        "notes": str(item.get("notes", "") or "").strip(),
        "sets": [
            normalized_set
            for raw_set in item.get("sets", [])
            if (normalized_set := normalize_performed_set(raw_set))
        ],
        "used_equipment": normalize_used_equipment_list(item.get("used_equipment", [])),
    }
    return {key: value for key, value in normalized.items() if value not in ("", None, [])}

def normalize_planned_editor_draft(item: dict) -> dict:
    if not isinstance(item, dict):
        return {}

    normalized = {
        "index": normalize_optional_int(item.get("index")),
        "exercise_name": str(item.get("exercise_name", "") or "").strip(),
        "custom_name": str(item.get("custom_name", "") or "").strip(),
        "block": str(item.get("block", "") or "").strip(),
        "work_type": normalize_work_type(item.get("work_type")),
        "notes": str(item.get("notes", "") or "").strip(),
        "used_equipment": normalize_used_equipment_list(item.get("used_equipment", [])),
    }

    for key in ("sets", "reps", "duration_min", "duration_sec"):
        value = normalize_optional_int(item.get(key))
        if value is not None:
            normalized[key] = value

    return {key: value for key, value in normalized.items() if value not in ("", None, [])}

def unique_names(values: list[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw_value in values:
        value = str(raw_value or "").strip()
        if not value or value in seen:
            continue
        out.append(value)
        seen.add(value)
    return out

def get_payload_display_exercises(payload: dict) -> list[str]:
    performed_items = payload.get("performed_items", []) or []
    if performed_items:
        return unique_names(
            [item.get("custom_name", "") or item.get("exercise_name", "") for item in performed_items]
        )

    if payload.get("exercises"):
        return unique_names(payload.get("exercises", []))

    return unique_names(
        [
            item.get("custom_name", "") or item.get("exercise_name", "")
            for item in payload.get("planned_items", [])
            if item.get("custom_name") or item.get("exercise_name")
        ]
    )

def get_calendar_display_exercises(payload: dict) -> list[str]:
    if str(payload.get("status", "todo") or "todo") == "done":
        return get_payload_display_exercises(payload)

    return unique_names(
        [
            item.get("custom_name", "") or item.get("exercise_name", "")
            for item in payload.get("planned_items", [])
            if item.get("custom_name") or item.get("exercise_name")
        ]
    )

def compute_session_status(payload: dict) -> str:
    has_actual_content = bool(
        payload.get("performed_items")
        or str(payload.get("activity_type", "") or "").strip()
        or str(payload.get("activity_details", "") or "").strip()
        or payload.get("climbing_routes")
        or float(payload.get("load", 0) or 0) > 0
        or str(payload.get("physio_time", "") or "").strip()
        or str(payload.get("note", "") or "").strip()
    )
    return "done" if has_actual_content else "todo"

def normalize_session_payload(payload: dict, existing: dict | None = None) -> dict:
    base = dict(DEFAULT_SESSION)
    if existing:
        base.update(existing)
    if payload:
        base.update(payload)

    performed_items = [
        normalized_item
        for item in base.get("performed_items", [])
        if (normalized_item := normalize_performed_item(item))
    ]
    planned_items = [
        normalized_item
        for item in base.get("planned_items", [])
        if (normalized_item := normalize_planned_item(item))
    ]
    exercise_names = [str(name).strip() for name in base.get("exercises", []) if str(name).strip()]
    if performed_items:
        exercise_names = unique_names(
            [item.get("exercise_name", "") for item in performed_items if item.get("exercise_name")] + exercise_names
        )
    raw_activity_type = str(base.get("activity_type", "") or "").strip()
    normalized_activity_type = normalize_activity_type(raw_activity_type)
    if not normalized_activity_type and (performed_items or exercise_names):
        normalized_activity_type = "musculation"

    normalized = {
        "exercises": exercise_names,
        "note": str(base.get("note", "") or ""),
        "status": "todo",
        "load": float(base.get("load", 0) or 0),
        "physio_time": normalize_physio_time(base.get("physio_time", "")),
        "activity_type": normalized_activity_type,
        "activity_details": str(base.get("activity_details", "") or "").strip(),
        "climbing_routes": [
            normalized_route
            for item in base.get("climbing_routes", [])
            if (normalized_route := normalize_climbing_route(item))
        ],
        "performed_items": performed_items,
        "plan_activity_type": normalize_activity_type(base.get("plan_activity_type", "")),
        "plan_time": normalize_physio_time(base.get("plan_time", "")),
        "plan_title": str(base.get("plan_title", "") or ""),
        "duration_target_min": normalize_optional_int(base.get("duration_target_min")),
        "location": str(base.get("location", "") or ""),
        "plan_notes": str(base.get("plan_notes", "") or ""),
        "planned_items": planned_items,
        "used_equipment": [
            normalized_item
            for item in base.get("used_equipment", [])
            if (normalized_item := normalize_used_equipment_item(item))
        ],
        "draft_performed_editor": normalize_performed_editor_draft(base.get("draft_performed_editor", {})),
        "draft_planned_editor": normalize_planned_editor_draft(base.get("draft_planned_editor", {})),
        "draft_selected_strength_category": str(base.get("draft_selected_strength_category", "") or "").strip().lower(),
        "draft_planned_section_expanded": bool(base.get("draft_planned_section_expanded", False)),
        "draft_updated_at": str(base.get("draft_updated_at", "") or "").strip(),
    }
    normalized["status"] = compute_session_status(normalized)
    if normalized["activity_type"] != "escalade":
        normalized["climbing_routes"] = []
    if normalized["activity_type"] != "musculation":
        normalized["performed_items"] = []
        normalized["exercises"] = []
    return normalized

def normalize_exercise_record(payload: dict) -> dict:
    name = str(payload.get("name", "") or "").strip()
    display_name = str(payload.get("display_name", "") or "").strip()
    display_name_fr = str(payload.get("display_name_fr", "") or "").strip()
    display_name_en = str(payload.get("display_name_en", "") or "").strip()
    fallback_display_name = display_name or name.replace("_", " ")
    category = str(payload.get("category", "") or payload.get("block", "") or "").strip()
    movement_family = str(payload.get("movement_family", "") or "").strip()
    variant_label = str(payload.get("variant_label", "") or "").strip()
    raw_images = payload.get("images", [])
    if isinstance(raw_images, str):
        raw_images = [part.strip() for part in raw_images.splitlines()]
    images = []
    seen_images = set()
    primary_image = str(payload.get("image", "") or "").strip()
    if primary_image:
        images.append(primary_image)
        seen_images.add(primary_image)
    for raw_image in raw_images if isinstance(raw_images, list) else []:
        image = str(raw_image or "").strip()
        if not image or image in seen_images:
            continue
        images.append(image)
        seen_images.add(image)
    return {
        "name": name,
        "display_name": fallback_display_name,
        "display_name_fr": display_name_fr or fallback_display_name,
        "display_name_en": display_name_en or fallback_display_name,
        "category": category,
        "movement_family": movement_family,
        "variant_label": variant_label,
        "tracking_mode": normalize_tracking_mode(payload.get("tracking_mode")),
        "weight_unit": normalize_weight_unit(payload.get("weight_unit")),
        "description": str(payload.get("description", "") or "").strip(),
        "link": str(payload.get("link", "") or "").strip(),
        "image": images[0] if images else "",
        "images_json": json.dumps(images, ensure_ascii=False),
        "document": str(payload.get("document", "") or "").strip(),
    }

def normalize_equipment_record(payload: dict) -> dict:
    name = str(payload.get("name", "") or "").strip()
    return {
        "name": name,
        "brand_id": normalize_optional_int(payload.get("brand_id")),
        "model_id": normalize_optional_int(payload.get("model_id")),
        "category": str(payload.get("category", "") or "").strip(),
        "description": str(payload.get("description", "") or "").strip(),
        "image": str(payload.get("image", "") or "").strip(),
        "link": str(payload.get("link", "") or "").strip(),
    }

def normalize_brand_record(payload: dict) -> dict:
    created_at_raw = str(payload.get("created_at", "") or "").strip()
    created_at = ""
    if created_at_raw:
        try:
            created_at = date.fromisoformat(created_at_raw).isoformat()
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid brand creation date") from exc
    return {
        "name": str(payload.get("name", "") or "").strip(),
        "created_at": created_at or date.today().isoformat(),
        "history": str(payload.get("history", "") or "").strip(),
    }

def normalize_equipment_model_record(payload: dict) -> dict:
    created_at_raw = str(payload.get("created_at", "") or "").strip()
    created_at = ""
    if created_at_raw:
        try:
            created_at = date.fromisoformat(created_at_raw).isoformat()
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid model creation date") from exc
    return {
        "brand_id": normalize_optional_int(payload.get("brand_id")),
        "name": str(payload.get("name", "") or "").strip(),
        "created_at": created_at or date.today().isoformat(),
        "history": str(payload.get("history", "") or "").strip(),
    }

def normalize_user_equipment_record(payload: dict) -> dict:
    purchase_date_raw = str(payload.get("purchase_date", "") or "").strip()
    purchase_date = ""
    if purchase_date_raw:
        try:
            purchase_date = date.fromisoformat(purchase_date_raw).isoformat()
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid purchase date") from exc

    return {
        "equipment_id": normalize_optional_int(payload.get("equipment_id")),
        "purchase_date": purchase_date,
        "purchase_price": normalize_optional_float(payload.get("purchase_price")),
        "note": str(payload.get("note", "") or "").strip(),
    }

def upsert_exercise_record(db, payload: dict) -> bool:
    record = normalize_exercise_record(payload)
    if not record["name"]:
        return False

    exists = db.query(ExerciseModel).filter_by(name=record["name"]).first()
    if exists:
        exists.display_name = record["display_name"]
        exists.display_name_fr = record["display_name_fr"]
        exists.display_name_en = record["display_name_en"]
        exists.category = record["category"]
        exists.movement_family = record["movement_family"]
        exists.variant_label = record["variant_label"]
        exists.tracking_mode = record["tracking_mode"]
        exists.weight_unit = record["weight_unit"]
        exists.description = record["description"]
        exists.link = record["link"]
        exists.image = record["image"]
        exists.images_json = record["images_json"]
        exists.document = record["document"]
    else:
        db.add(ExerciseModel(**record))
    return True

def get_exercise_images(row: ExerciseModel) -> list[str]:
    images: list[str] = []
    raw_json = str(row.images_json or "").strip()
    if raw_json:
        try:
            parsed = json.loads(raw_json)
            if isinstance(parsed, list):
                images.extend(str(item or "").strip() for item in parsed)
        except json.JSONDecodeError:
            pass
    primary = str(row.image or "").strip()
    if primary and primary not in images:
        images.insert(0, primary)
    return [image for image in images if image]


def split_exercise_categories(value: str) -> list[str]:
    tokens: list[str] = []
    seen: set[str] = set()
    raw_value = str(value or "").replace(";", ",")
    for raw_token in raw_value.split(","):
        token = raw_token.strip()
        if not token or token in seen:
            continue
        tokens.append(token)
        seen.add(token)
    return tokens


def serialize_exercise(row: ExerciseModel) -> dict:
    return {
        "name": row.name,
        "display_name": row.display_name or row.name.replace("_", " "),
        "display_name_fr": row.display_name_fr or row.display_name or row.name.replace("_", " "),
        "display_name_en": row.display_name_en or row.display_name or row.name.replace("_", " "),
        "category": row.category or "",
        "movement_family": row.movement_family or "",
        "variant_label": row.variant_label or "",
        "tracking_mode": normalize_tracking_mode(row.tracking_mode),
        "weight_unit": normalize_weight_unit(row.weight_unit),
        "description": row.description or "",
        "link": row.link or "",
        "image": row.image or "",
        "images": get_exercise_images(row),
        "document": row.document or "",
    }


def sanitize_upload_suffix(filename: str) -> str:
    suffix = Path(str(filename or "")).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".webp", ".gif"}:
        return suffix
    return ""


def resolve_uploaded_exercise_path(image_url: str) -> Path | None:
    prefix = "/api/uploads/exercises/"
    value = str(image_url or "").strip()
    if not value.startswith(prefix):
        return None
    filename = Path(value.removeprefix(prefix)).name
    if not filename:
        return None
    return EXERCISE_UPLOADS_DIR / filename


def set_exercise_images(row: ExerciseModel, images: list[str]) -> None:
    cleaned = [str(image or "").strip() for image in images if str(image or "").strip()]
    row.image = cleaned[0] if cleaned else ""
    row.images_json = json.dumps(cleaned, ensure_ascii=False)


def serialize_audit_log(row: AuditLogModel) -> dict:
    return {
        "id": row.id,
        "username": row.username,
        "action": row.action,
        "target_type": row.target_type,
        "target_key": row.target_key,
        "summary": row.summary or "",
        "created_at": row.created_at,
    }


def write_audit_log(
    db,
    username: str,
    action: str,
    target_type: str,
    target_key: str,
    summary: str = "",
) -> None:
    db.add(
        AuditLogModel(
            username=str(username or "").strip() or "unknown",
            action=str(action or "").strip() or "unknown",
            target_type=str(target_type or "").strip() or "unknown",
            target_key=str(target_key or "").strip() or "-",
            summary=str(summary or "").strip(),
            created_at=datetime.now(timezone.utc).isoformat(),
        )
    )


def merge_exercise_rows(target_row: ExerciseModel, source_row: ExerciseModel) -> None:
    target_categories = split_exercise_categories(target_row.category or "")
    source_categories = split_exercise_categories(source_row.category or "")
    merged_categories = unique_names(target_categories + source_categories)
    target_row.category = ", ".join(merged_categories)

    merged_images = unique_names(get_exercise_images(target_row) + get_exercise_images(source_row))
    set_exercise_images(target_row, merged_images)

    for field_name in ("display_name", "display_name_fr", "display_name_en", "description", "link", "document"):
        target_value = str(getattr(target_row, field_name) or "").strip()
        source_value = str(getattr(source_row, field_name) or "").strip()
        if not target_value and source_value:
            setattr(target_row, field_name, source_value)

    if not str(target_row.movement_family or "").strip():
        target_row.movement_family = str(source_row.movement_family or "").strip()
    if not str(target_row.variant_label or "").strip():
        target_row.variant_label = str(source_row.variant_label or "").strip()
    if not str(target_row.tracking_mode or "").strip():
        target_row.tracking_mode = normalize_tracking_mode(source_row.tracking_mode)
    if not str(target_row.weight_unit or "").strip():
        target_row.weight_unit = normalize_weight_unit(source_row.weight_unit)


def rename_exercise_references(db, old_name: str, new_name: str) -> None:
    old_value = str(old_name or "").strip()
    new_value = str(new_name or "").strip()
    if not old_value or not new_value or old_value == new_value:
        return

    for exercise_row in db.query(ExerciseModel).filter_by(movement_family=old_value).all():
        exercise_row.movement_family = new_value

    rows = db.query(SessionModel).all()
    for row in rows:
        payload = session_payload_from_row(row)
        changed = False

        exercises = []
        for exercise_name in payload.get("exercises", []) or []:
            normalized_name = new_value if str(exercise_name or "").strip() == old_value else exercise_name
            exercises.append(normalized_name)
            if normalized_name != exercise_name:
                changed = True
        payload["exercises"] = exercises

        for item in payload.get("performed_items", []) or []:
            if str(item.get("exercise_name", "")).strip() == old_value:
                item["exercise_name"] = new_value
                changed = True

        for item in payload.get("planned_items", []) or []:
            if str(item.get("exercise_name", "")).strip() == old_value:
                item["exercise_name"] = new_value
                changed = True

        draft_performed_editor = payload.get("draft_performed_editor", {}) or {}
        if str(draft_performed_editor.get("exercise_name", "")).strip() == old_value:
            draft_performed_editor["exercise_name"] = new_value
            payload["draft_performed_editor"] = draft_performed_editor
            changed = True

        draft_planned_editor = payload.get("draft_planned_editor", {}) or {}
        if str(draft_planned_editor.get("exercise_name", "")).strip() == old_value:
            draft_planned_editor["exercise_name"] = new_value
            payload["draft_planned_editor"] = draft_planned_editor
            changed = True

        if changed:
            row.data = json.dumps(normalize_session_payload(payload), ensure_ascii=False)

def serialize_brand(row: EquipmentBrandModel) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "created_at": row.created_at,
        "history": row.history or "",
    }

def serialize_equipment_model(row: EquipmentModelRef, brand: EquipmentBrandModel | None = None) -> dict:
    return {
        "id": row.id,
        "brand_id": row.brand_id,
        "brand_name": brand.name if brand else "",
        "name": row.name,
        "created_at": row.created_at,
        "history": row.history or "",
    }

def build_equipment_display_name(row: EquipmentModel | None, brand: EquipmentBrandModel | None = None, model: EquipmentModelRef | None = None) -> str:
    if not row:
        return ""
    parts = [str(brand.name or "").strip() if brand else "", str(model.name or "").strip() if model else "", str(row.name or "").strip()]
    return " ".join(part for part in parts if part)

def serialize_equipment(row: EquipmentModel, brand: EquipmentBrandModel | None = None, model: EquipmentModelRef | None = None) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "brand_id": row.brand_id,
        "brand_name": brand.name if brand else "",
        "model_id": row.model_id,
        "model_name": model.name if model else "",
        "display_name": build_equipment_display_name(row, brand, model),
        "category": row.category or "",
        "description": row.description or "",
        "image": row.image or "",
        "link": row.link or "",
    }

def serialize_user_equipment(
    row: UserEquipmentModel,
    equipment: EquipmentModel | None,
    brand: EquipmentBrandModel | None = None,
    model: EquipmentModelRef | None = None,
) -> dict:
    equipment_name = equipment.name if equipment else ""
    display_name = build_equipment_display_name(equipment, brand, model) if equipment else ""
    return {
        "id": row.id,
        "username": row.username,
        "equipment_id": row.equipment_id,
        "equipment_name": equipment_name,
        "display_name": display_name or (equipment_name.replace("_", " ") if equipment_name else ""),
        "brand_id": equipment.brand_id if equipment else None,
        "brand_name": brand.name if brand else "",
        "model_id": equipment.model_id if equipment else None,
        "model_name": model.name if model else "",
        "category": equipment.category if equipment and equipment.category else "",
        "description": equipment.description if equipment and equipment.description else "",
        "image": equipment.image if equipment and equipment.image else "",
        "link": equipment.link if equipment and equipment.link else "",
        "purchase_date": row.purchase_date,
        "purchase_price": row.purchase_price,
        "note": row.note or "",
    }

def parse_json_import_payload(content: str) -> dict:
    try:
        payload = json.loads(content)
    except json.JSONDecodeError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid JSON: {exc.msg}") from exc

    if not isinstance(payload, dict):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="JSON import must be an object")
    return payload

def parse_exercises_csv(content: str) -> list[dict]:
    rows = list(csv.DictReader(StringIO(content)))
    if not rows:
        return []

    exercises = []
    for row in rows:
        record = normalize_exercise_record(row)
        if record["name"]:
            exercises.append(record)
    return exercises

def parse_schedule_csv(content: str) -> dict:
    rows = list(csv.DictReader(StringIO(content)))
    if not rows:
        return {"planned_sessions": []}

    grouped_sessions: dict[str, dict] = {}
    ordered_dates: list[str] = []

    for row in rows:
        date_str = str(row.get("date", "") or row.get("session_date", "") or "").strip()
        if not date_str:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Schedule CSV requires a date column")

        try:
            date.fromisoformat(date_str)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid date in schedule CSV: {date_str}") from exc

        session = grouped_sessions.get(date_str)
        if not session:
            session = {
                "date": date_str,
                "title": str(row.get("title", "") or "").strip(),
                "duration_target_min": normalize_optional_int(row.get("duration_target_min")),
                "location": str(row.get("location", "") or "").strip(),
                "notes": str(row.get("plan_notes", "") or row.get("notes", "") or "").strip(),
                "physio_time": normalize_physio_time(row.get("physio_time", "")),
                "items": [],
            }
            grouped_sessions[date_str] = session
            ordered_dates.append(date_str)

        item = normalize_planned_item({
            "exercise_name": row.get("exercise_name", ""),
            "block": row.get("block", ""),
            "sets": row.get("sets", ""),
            "reps": row.get("reps", ""),
            "duration_min": row.get("duration_min", ""),
            "duration_sec": row.get("duration_sec", ""),
            "notes": row.get("item_notes", "") or row.get("notes", ""),
        })
        if item:
            session["items"].append(item)

    return {"planned_sessions": [grouped_sessions[date_key] for date_key in ordered_dates]}

def normalize_import_sessions(payload: dict) -> list[dict]:
    planned_sessions = payload.get("planned_sessions", [])
    if not isinstance(planned_sessions, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="planned_sessions must be a list")

    start_date_value = payload.get("start_date")
    start_date_obj = None
    if start_date_value:
        try:
            start_date_obj = date.fromisoformat(str(start_date_value))
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid start_date in import payload") from exc

    sessions = []
    for index, session in enumerate(planned_sessions):
        if not isinstance(session, dict):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Each planned session must be an object")

        session_date = str(session.get("date", "") or session.get("session_date", "") or "").strip()
        if not session_date and start_date_obj:
            session_date = (start_date_obj + timedelta(days=index)).isoformat()
        if not session_date:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Each planned session must include a date or import start_date")

        try:
            date.fromisoformat(session_date)
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid session date: {session_date}") from exc

        items = []
        for item in session.get("items", []):
            normalized_item = normalize_planned_item(item)
            if normalized_item:
                items.append(normalized_item)

        sessions.append({
            "date": session_date,
            "plan_title": str(session.get("title", "") or session.get("plan_title", "") or "").strip(),
            "duration_target_min": normalize_optional_int(session.get("duration_target_min")),
            "location": str(session.get("location", "") or "").strip(),
            "plan_notes": str(session.get("notes", "") or session.get("plan_notes", "") or "").strip(),
            "physio_time": normalize_physio_time(session.get("physio_time", "")),
            "planned_items": items,
            "exercises": [item["exercise_name"] for item in items if item.get("exercise_name")],
        })
    return sessions

def import_program_into_db(db, payload: dict, username: str) -> dict:
    exercises = payload.get("exercises", [])
    if exercises and not isinstance(exercises, list):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="exercises must be a list")

    created_exercises = 0
    updated_exercises = 0
    imported_sessions = 0

    for exercise in exercises:
        record = normalize_exercise_record(exercise)
        if not record["name"]:
            continue
        exists = db.query(ExerciseModel).filter_by(name=record["name"]).first()
        if exists:
            updated_exercises += 1
        else:
            created_exercises += 1
        upsert_exercise_record(db, record)

    for session_data in normalize_import_sessions(payload):
        row = get_session_obj(db, username, session_data["date"])
        existing_payload = session_payload_from_row(row) if row else None
        normalized_payload = normalize_session_payload(session_data, existing_payload)
        if row:
            row.data = json.dumps(normalized_payload)
        else:
            db.add(SessionModel(username=username, date=session_data["date"], data=json.dumps(normalized_payload)))
        imported_sessions += 1

    db.commit()
    return {
        "created_exercises": created_exercises,
        "updated_exercises": updated_exercises,
        "imported_sessions": imported_sessions,
    }

def normalize_config(config: dict):
    normalized = {key: config[key] for key in BASE_CONFIG if key in config}
    normalized["start_date"] = date.fromisoformat(str(normalized["start_date"])).isoformat()

    for key in ("start_load", "increment", "weight", "increment_every_days", "sport_after_days"):
        normalized[key] = int(normalized[key])
    return normalized

def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        salt.encode("utf-8"),
        PASSWORD_ITERATIONS,
    ).hex()

def build_password_record(password: str) -> tuple[str, str]:
    salt = secrets.token_hex(16)
    return salt, hash_password(password, salt)

def verify_password(password: str, salt: str, expected_hash: str) -> bool:
    return hmac.compare_digest(hash_password(password, salt), expected_hash)

def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()

def purge_expired_tokens(db):
    now = datetime.now(timezone.utc)
    rows = db.query(AuthTokenModel).all()
    for row in rows:
        try:
            expires_at = datetime.fromisoformat(row.expires_at)
        except ValueError:
            db.delete(row)
            continue
        if expires_at <= now:
            db.delete(row)
    db.commit()

def using_default_password(user: UserModel) -> bool:
    return user.username == DEFAULT_USERNAME and verify_password(
        DEFAULT_PASSWORD,
        user.password_salt,
        user.password_hash,
    )

def normalize_language(value) -> str:
    language = str(value or "").strip().lower()
    return language if language in {"fr", "en"} else "fr"

def estimate_epley_1rm(weight, reps):
    weight_value = normalize_optional_float(weight)
    reps_value = normalize_optional_int(reps)
    if weight_value is None or weight_value <= 0:
        return None
    if reps_value is None or reps_value <= 0:
        reps_value = 1
    return round(weight_value * (1 + reps_value / 30), 2)

def choose_best_set(sets: list[dict]) -> dict | None:
    normalized_sets = []
    for raw_set in sets or []:
        weight_unit = normalize_weight_unit(raw_set.get("weight_unit"))
        weight = normalize_optional_float(raw_set.get("weight"))
        weight_kg = convert_weight_unit(weight, weight_unit, "kg")
        reps = normalize_optional_int(raw_set.get("reps"))
        duration_sec = normalize_optional_int(raw_set.get("duration_sec"))
        watts = normalize_optional_float(raw_set.get("watts"))
        estimated_1rm = estimate_epley_1rm(weight_kg, reps)
        normalized_sets.append({
            "weight": weight,
            "weight_kg": weight_kg,
            "weight_unit": weight_unit,
            "reps": reps,
            "duration_sec": duration_sec,
            "watts": watts,
            "estimated_1rm": estimated_1rm,
        })
    normalized_sets = [
        set_data for set_data in normalized_sets
        if any(
            set_data.get(key) is not None
            for key in ("weight", "reps", "duration_sec", "watts")
        )
    ]
    if not normalized_sets:
        return None
    return max(
        normalized_sets,
        key=lambda set_data: (
            set_data["weight_kg"] if set_data["weight_kg"] is not None else -1,
            set_data["watts"] if set_data["watts"] is not None else -1,
            set_data["duration_sec"] if set_data["duration_sec"] is not None else -1,
            set_data["reps"] if set_data["reps"] is not None else -1,
            set_data["estimated_1rm"] if set_data["estimated_1rm"] is not None else -1,
        ),
    )

def build_exercise_performance_summary(db, username: str, exercise_name: str) -> dict:
    normalized_name = str(exercise_name or "").strip()
    if not normalized_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exercise name is required")
    exercise_row = db.query(ExerciseModel).filter_by(name=normalized_name).first()
    tracking_mode = normalize_tracking_mode(exercise_row.tracking_mode if exercise_row else "")
    default_weight_unit = normalize_weight_unit(exercise_row.weight_unit if exercise_row else "")

    rows = (
        db.query(SessionModel)
        .filter_by(username=username)
        .order_by(SessionModel.date.desc())
        .all()
    )

    matching_sessions: list[dict] = []
    validated_sessions: list[dict] = []

    for row in rows:
        payload = session_payload_from_row(row)
        activity_type = str(payload.get("activity_type", "") or "").strip()
        if activity_type and activity_type != "musculation":
            continue

        matching_items = [
            item for item in payload.get("performed_items", [])
            if str(item.get("exercise_name", "")).strip() == normalized_name
        ]
        if not matching_items:
            continue

        session_sets = []
        for item in matching_items:
            item_work_type = normalize_work_type(item.get("work_type"))
            for raw_set in item.get("sets", []):
                weight_unit = normalize_weight_unit(raw_set.get("weight_unit"))
                weight = normalize_optional_float(raw_set.get("weight"))
                weight_kg = convert_weight_unit(weight, weight_unit, "kg")
                reps = normalize_optional_int(raw_set.get("reps"))
                duration_sec = normalize_optional_int(raw_set.get("duration_sec"))
                watts = normalize_optional_float(raw_set.get("watts"))
                set_data = {
                    "weight": weight,
                    "weight_kg": weight_kg,
                    "weight_unit": weight_unit,
                    "reps": reps,
                    "duration_sec": duration_sec,
                    "watts": watts,
                    "estimated_1rm": estimate_epley_1rm(weight_kg, reps),
                    "work_type": item_work_type,
                }
                if all(set_data[key] is None for key in ("weight", "reps", "duration_sec", "watts")):
                    continue
                session_sets.append(set_data)

        if not session_sets:
            continue

        session_summary = {
            "date": row.date,
            "status": payload.get("status", "todo"),
            "sets": session_sets,
            "top_set": choose_best_set(session_sets),
        }
        matching_sessions.append(session_summary)
        if payload.get("status") == "done":
            validated_sessions.append(session_summary)

    source_sessions = validated_sessions or matching_sessions

    if not source_sessions:
        return {
            "exercise_name": normalized_name,
            "tracking_mode": tracking_mode,
            "weight_unit": default_weight_unit,
            "total_sessions": 0,
            "validated_sessions": 0,
            "last_session": None,
            "recent_sessions": [],
            "personal_records": {
                "heaviest_weight": None,
                "best_estimated_1rm": None,
                "max_watts": None,
                "longest_duration_sec": None,
            },
            "recommendation": None,
            "recommendations": {},
        }

    source_sets = [set_data for session_item in source_sessions for set_data in session_item.get("sets", [])]
    last_session = source_sessions[0]
    recent_sessions = source_sessions[:5]
    heaviest_weight_kg = max((set_data["weight_kg"] for set_data in source_sets if set_data["weight_kg"] is not None), default=None)
    heaviest_weight = convert_weight_unit(heaviest_weight_kg, "kg", default_weight_unit) if heaviest_weight_kg is not None else None
    best_estimated_1rm_kg = max((set_data["estimated_1rm"] for set_data in source_sets if set_data["estimated_1rm"] is not None), default=None)
    best_estimated_1rm = convert_weight_unit(best_estimated_1rm_kg, "kg", default_weight_unit) if best_estimated_1rm_kg is not None else None
    max_watts = max((set_data["watts"] for set_data in source_sets if set_data["watts"] is not None), default=None)
    longest_duration_sec = max((set_data["duration_sec"] for set_data in source_sets if set_data["duration_sec"] is not None), default=None)

    def round_weight_for_display(weight_kg: float | None):
        if weight_kg is None:
            return None
        step = 0.5 if default_weight_unit == "lb" else 0.5
        converted = convert_weight_unit(weight_kg, "kg", default_weight_unit)
        if converted is None:
            return None
        return round(round(converted / step) * step, 2)

    def choose_reference_set(work_type: str):
        for session_item in source_sessions:
            matching_sets = [
                set_data for set_data in session_item.get("sets", [])
                if normalize_work_type(set_data.get("work_type")) == work_type
            ]
            if matching_sets:
                return choose_best_set(matching_sets), True
        last_top = last_session.get("top_set")
        return last_top, False

    recommendations: dict[str, dict] = {}
    rep_profiles = {
        "explosive": {"pct_low": 0.5, "pct_high": 0.65, "reps_low": 3, "reps_high": 5, "note_key": "explosive"},
        "force": {"pct_low": 0.8, "pct_high": 0.9, "reps_low": 3, "reps_high": 6, "note_key": "force"},
        "resistance": {"pct_low": 0.65, "pct_high": 0.75, "reps_low": 8, "reps_high": 12, "note_key": "resistance"},
        "endurance": {"pct_low": 0.4, "pct_high": 0.6, "reps_low": 15, "reps_high": 25, "note_key": "endurance"},
    }
    watts_profiles = {
        "explosive": {"pct_low": 1.3, "pct_high": 1.6, "duration_low": 10, "duration_high": 20, "note_key": "explosive"},
        "force": {"pct_low": 1.1, "pct_high": 1.3, "duration_low": 20, "duration_high": 40, "note_key": "force"},
        "resistance": {"pct_low": 0.85, "pct_high": 1.0, "duration_low": 45, "duration_high": 90, "note_key": "resistance"},
        "endurance": {"pct_low": 0.65, "pct_high": 0.8, "duration_low": 120, "duration_high": 300, "note_key": "endurance"},
    }

    for work_type in ("explosive", "force", "resistance", "endurance"):
        reference_set, from_same_work_type = choose_reference_set(work_type)
        if tracking_mode == "reps_weight":
            profile = rep_profiles[work_type]
            reference_1rm_kg = max(
                (
                    set_data["estimated_1rm"]
                    for set_data in source_sets
                    if set_data["estimated_1rm"] is not None
                ),
                default=None,
            )
            reference_weight_kg = reference_set.get("weight_kg") if reference_set else None
            if reference_1rm_kg is None and reference_weight_kg is None:
                continue
            basis_kg = reference_1rm_kg if reference_1rm_kg is not None else reference_weight_kg
            low_kg = basis_kg * profile["pct_low"]
            high_kg = basis_kg * profile["pct_high"]
            recommendations[work_type] = {
                "work_type": work_type,
                "tracking_mode": tracking_mode,
                "weight_unit": default_weight_unit,
                "target_reps_low": profile["reps_low"],
                "target_reps_high": profile["reps_high"],
                "suggested_weight_low": round_weight_for_display(low_kg),
                "suggested_weight_high": round_weight_for_display(high_kg),
                "reference_metric": "estimated_1rm" if reference_1rm_kg is not None else "top_weight",
                "reference_value": round_weight_for_display(reference_1rm_kg if reference_1rm_kg is not None else reference_weight_kg),
                "reference_reps": normalize_optional_int(reference_set.get("reps")) if reference_set else None,
                "note_key": profile["note_key"],
                "based_on_same_work_type": from_same_work_type,
            }
        else:
            profile = watts_profiles[work_type]
            reference_watts = max((set_data["watts"] for set_data in source_sets if set_data["watts"] is not None), default=None)
            if reference_watts is None:
                continue
            recommendations[work_type] = {
                "work_type": work_type,
                "tracking_mode": tracking_mode,
                "target_duration_low": profile["duration_low"],
                "target_duration_high": profile["duration_high"],
                "suggested_watts_low": round(reference_watts * profile["pct_low"], 1),
                "suggested_watts_high": round(reference_watts * profile["pct_high"], 1),
                "reference_metric": "max_watts",
                "reference_value": round(reference_watts, 1),
                "note_key": profile["note_key"],
                "based_on_same_work_type": from_same_work_type,
            }

    recommendation = recommendations.get("resistance") or next(iter(recommendations.values()), None)
    return {
        "exercise_name": normalized_name,
        "tracking_mode": tracking_mode,
        "weight_unit": default_weight_unit,
        "total_sessions": len(source_sessions),
        "validated_sessions": len(validated_sessions),
        "last_session": last_session,
        "recent_sessions": recent_sessions,
        "personal_records": {
            "heaviest_weight": heaviest_weight,
            "best_estimated_1rm": best_estimated_1rm,
            "max_watts": max_watts,
            "longest_duration_sec": longest_duration_sec,
        },
        "recommendation": recommendation,
        "recommendations": recommendations,
    }

def create_auth_token(db, username: str):
    token = secrets.token_urlsafe(32)
    expires_at = datetime.now(timezone.utc) + timedelta(hours=TOKEN_TTL_HOURS)
    db.add(
        AuthTokenModel(
            token_hash=hash_token(token),
            username=username,
            expires_at=expires_at.isoformat(),
        )
    )
    db.commit()
    return token, expires_at.isoformat()

def get_authorized_user(authorization: str | None):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    token = authorization.split(" ", 1)[1].strip()
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")

    db = get_db()
    try:
        purge_expired_tokens(db)
        token_row = db.query(AuthTokenModel).filter_by(token_hash=hash_token(token)).first()
        if not token_row:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")

        user = db.query(UserModel).filter_by(username=token_row.username).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid session")
        return user
    finally:
        db.close()

def get_current_user(authorization: str | None = Header(default=None)):
    return get_authorized_user(authorization)

def get_current_token(authorization: str | None = Header(default=None)):
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required")
    return authorization.split(" ", 1)[1].strip()

def require_admin(current_user: UserModel = Depends(get_current_user)):
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user

def count_admin_users(db) -> int:
    return db.query(UserModel).filter_by(is_admin=True).count()

def seed_exercises():
    db = SessionLocal()
    if db.query(ExerciseModel).count() == 0:
        db.add_all([
            ExerciseModel(name="bike", display_name="Bike", category="warmup", description="Vélo léger ou endurance selon phase.", link="", image="", document=""),
            ExerciseModel(name="mobility", display_name="Mobility", category="mobility", description="Mobilité douce cheville et hanches.", link="", image="", document=""),
            ExerciseModel(name="upper body", display_name="Upper Body", category="general", description="Musculation haut du corps.", link="", image="", document=""),
            ExerciseModel(name="hangboard", display_name="Hangboard", category="pull", description="Travail doigts / poutre sans charger le pied.", link="", image="", document=""),
            ExerciseModel(name="hockey", display_name="Hockey", category="sport", description="Travail hockey.", link="", image="", document=""),
        ])
        db.commit()
    db.close()

seed_exercises()

def seed_default_user():
    db = SessionLocal()
    existing = db.query(UserModel).filter_by(username=DEFAULT_USERNAME).first()
    if db.query(UserModel).count() == 0:
        salt, password_hash = build_password_record(DEFAULT_PASSWORD)
        db.add(
            UserModel(
                username=DEFAULT_USERNAME,
                password_hash=password_hash,
                password_salt=salt,
                is_admin=True,
            )
        )
        db.commit()
    elif existing and not existing.is_admin:
        existing.is_admin = True
        db.commit()
    db.close()

seed_default_user()

def load_config():
    db = SessionLocal()
    try:
        config = dict(BASE_CONFIG)
        rows = db.query(AppConfigModel).all()
        for row in rows:
            if row.key not in BASE_CONFIG:
                db.delete(row)
                continue
            try:
                config[row.key] = json.loads(row.value)
            except json.JSONDecodeError:
                config[row.key] = row.value

        for key, value in BASE_CONFIG.items():
            if key not in config:
                config[key] = value
                db.merge(AppConfigModel(key=key, value=json.dumps(value)))

        config = normalize_config(config)
        for key, value in config.items():
            db.merge(AppConfigModel(key=key, value=json.dumps(value)))

        db.commit()
        return config
    finally:
        db.close()

def save_config(config: dict):
    config = normalize_config(config)
    db = SessionLocal()
    try:
        for key, value in config.items():
            db.merge(AppConfigModel(key=key, value=json.dumps(value)))
        db.commit()
    finally:
        db.close()

CONFIG = load_config()

def get_db():
    return SessionLocal()

def get_session_obj(db, username: str, date_str: str):
    return db.query(SessionModel).filter_by(username=username, date=date_str).first()

def session_payload_from_row(row):
    if row:
        return normalize_session_payload(json.loads(row.data))
    return dict(DEFAULT_SESSION)

def get_target_for_date(date_str: str):
    current = date.fromisoformat(date_str)
    start_date = date.fromisoformat(CONFIG["start_date"])
    rehab_day = max(1, (current - start_date).days + 1)
    target = CONFIG["start_load"] + ((rehab_day - 1) // CONFIG["increment_every_days"]) * CONFIG["increment"]
    pct_bw = round(target / CONFIG["weight"] * 100)
    sport_allowed = rehab_day > CONFIG["sport_after_days"]
    return {
        "rehab_day": rehab_day,
        "target_load": target,
        "target_pct_bw": pct_bw,
        "sport_allowed": sport_allowed,
    }

@app.post("/api/auth/login")
def login(payload: dict):
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    if not username or not password:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username and password are required")

    db = get_db()
    try:
        purge_expired_tokens(db)
        user = db.query(UserModel).filter_by(username=username).first()
        if not user or not verify_password(password, user.password_salt, user.password_hash):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

        token, expires_at = create_auth_token(db, user.username)
        write_audit_log(db, user.username, "login", "auth", user.username, "User logged in")
        db.commit()
        return {
            "token": token,
            "username": user.username,
            "is_admin": bool(user.is_admin),
            "language": normalize_language(user.language),
            "expires_at": expires_at,
            "must_change_password": using_default_password(user),
        }
    finally:
        db.close()

@app.get("/api/auth/me")
def read_current_user(current_user: UserModel = Depends(get_current_user)):
    return {
        "username": current_user.username,
        "is_admin": bool(current_user.is_admin),
        "language": normalize_language(current_user.language),
        "must_change_password": using_default_password(current_user),
    }

@app.post("/api/auth/logout")
def logout(
    current_user: UserModel = Depends(get_current_user),
    token: str = Depends(get_current_token),
):
    db = get_db()
    try:
        db.query(AuthTokenModel).filter_by(token_hash=hash_token(token)).delete()
        write_audit_log(db, current_user.username, "logout", "auth", current_user.username, "User logged out")
        db.commit()
        return {"ok": True}
    finally:
        db.close()

@app.post("/api/auth/change-password")
def change_password(
    payload: dict,
    current_user: UserModel = Depends(get_current_user),
):
    current_password = str(payload.get("current_password", ""))
    new_password = str(payload.get("new_password", ""))
    if len(new_password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="New password must be at least 8 characters")

    db = get_db()
    try:
        user = db.query(UserModel).filter_by(username=current_user.username).first()
        if not user or not verify_password(current_password, user.password_salt, user.password_hash):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")

        salt, password_hash = build_password_record(new_password)
        user.password_salt = salt
        user.password_hash = password_hash
        db.query(AuthTokenModel).filter_by(username=user.username).delete()
        write_audit_log(db, user.username, "change_password", "user", user.username, "User changed own password")
        db.commit()
        return {"ok": True}
    finally:
        db.close()

@app.put("/api/auth/preferences")
def update_auth_preferences(
    payload: dict,
    current_user: UserModel = Depends(get_current_user),
):
    db = get_db()
    try:
        user = db.query(UserModel).filter_by(username=current_user.username).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        user.language = normalize_language(payload.get("language"))
        write_audit_log(db, user.username, "update_preferences", "user", user.username, f"Language set to {user.language}")
        db.commit()
        return {"ok": True, "language": normalize_language(user.language)}
    finally:
        db.close()

@app.get("/api/admin/users")
def list_users(_: UserModel = Depends(require_admin)):
    db = get_db()
    try:
        rows = db.query(UserModel).order_by(UserModel.username).all()
        return [
            {
                "username": row.username,
                "is_admin": bool(row.is_admin),
                "is_default_admin": row.username == DEFAULT_USERNAME,
            }
            for row in rows
        ]
    finally:
        db.close()

@app.get("/api/admin/audit-logs")
def list_audit_logs(
    username: str | None = None,
    action: str | None = None,
    date_from: str | None = None,
    date_to: str | None = None,
    limit: int = 100,
    _: UserModel = Depends(require_admin),
):
    db = get_db()
    try:
        query = db.query(AuditLogModel)
        normalized_username = str(username or "").strip()
        normalized_action = str(action or "").strip()
        normalized_date_from = str(date_from or "").strip()
        normalized_date_to = str(date_to or "").strip()
        if normalized_username:
            query = query.filter(AuditLogModel.username == normalized_username)
        if normalized_action:
            query = query.filter(AuditLogModel.action == normalized_action)
        if normalized_date_from:
            query = query.filter(AuditLogModel.created_at >= normalized_date_from)
        if normalized_date_to:
            query = query.filter(AuditLogModel.created_at <= normalized_date_to)
        capped_limit = max(1, min(int(limit or 100), 500))
        rows = query.order_by(AuditLogModel.id.desc()).limit(capped_limit).all()
        return [serialize_audit_log(row) for row in rows]
    finally:
        db.close()

@app.post("/api/admin/users")
def create_user(payload: dict, current_user: UserModel = Depends(require_admin)):
    username = str(payload.get("username", "")).strip()
    password = str(payload.get("password", ""))
    is_admin = bool(payload.get("is_admin", False))

    if not username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username is required")
    if len(password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters")

    db = get_db()
    try:
        if db.query(UserModel).filter_by(username=username).first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="User already exists")

        salt, password_hash = build_password_record(password)
        db.add(
            UserModel(
                username=username,
                password_hash=password_hash,
                password_salt=salt,
                is_admin=is_admin,
            )
        )
        write_audit_log(
            db,
            current_user.username,
            "create_user",
            "user",
            username,
            f"Created {'admin' if is_admin else 'user'} account {username}",
        )
        db.commit()
        return {"ok": True}
    finally:
        db.close()

@app.put("/api/admin/users/{username}")
def update_user_role(
    username: str,
    payload: dict,
    current_user: UserModel = Depends(require_admin),
):
    db = get_db()
    try:
        user = db.query(UserModel).filter_by(username=username).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        new_is_admin = bool(payload.get("is_admin", user.is_admin))
        if user.is_admin and not new_is_admin and count_admin_users(db) <= 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one admin must remain")

        user.is_admin = new_is_admin
        write_audit_log(
            db,
            current_user.username,
            "update_user_role",
            "user",
            user.username,
            f"Set admin={bool(new_is_admin)} for {user.username}",
        )
        db.commit()
        return {
            "ok": True,
            "user": {
                "username": user.username,
                "is_admin": bool(user.is_admin),
                "is_self": user.username == current_user.username,
            },
        }
    finally:
        db.close()

@app.put("/api/admin/users/{username}/password")
def admin_change_user_password(
    username: str,
    payload: dict,
    current_user: UserModel = Depends(require_admin),
):
    new_password = str(payload.get("new_password", ""))
    if len(new_password) < 8:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Password must be at least 8 characters")

    db = get_db()
    try:
        user = db.query(UserModel).filter_by(username=username).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

        salt, password_hash = build_password_record(new_password)
        user.password_salt = salt
        user.password_hash = password_hash
        db.query(AuthTokenModel).filter_by(username=username).delete()
        write_audit_log(
            db,
            current_user.username,
            "reset_user_password",
            "user",
            user.username,
            f"Reset password for {user.username}",
        )
        db.commit()
        return {"ok": True}
    finally:
        db.close()

@app.delete("/api/admin/users/{username}")
def delete_user(
    username: str,
    current_user: UserModel = Depends(require_admin),
):
    db = get_db()
    try:
        user = db.query(UserModel).filter_by(username=username).first()
        if not user:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
        if user.username == current_user.username:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You cannot delete your own account")
        if user.is_admin and count_admin_users(db) <= 1:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least one admin must remain")

        db.query(AuthTokenModel).filter_by(username=username).delete()
        write_audit_log(
            db,
            current_user.username,
            "delete_user",
            "user",
            user.username,
            f"Deleted user account {user.username}",
        )
        db.delete(user)
        db.commit()
        return {"ok": True}
    finally:
        db.close()

@app.get("/api/config")
def read_config(_: UserModel = Depends(get_current_user)):
    return CONFIG

@app.put("/api/config")
def update_config(payload: dict, _: UserModel = Depends(get_current_user)):
    for key in list(CONFIG.keys()):
        if key in payload:
            if key == "start_date":
                CONFIG[key] = date.fromisoformat(str(payload[key])).isoformat()
            else:
                CONFIG[key] = payload[key]
    CONFIG.update(normalize_config(CONFIG))
    save_config(CONFIG)
    return {"ok": True, "config": CONFIG}

@app.get("/api/exercises")
def get_exercises(_: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        rows = db.query(ExerciseModel).order_by(ExerciseModel.name).all()
        return [serialize_exercise(r) for r in rows]
    finally:
        db.close()

@app.post("/api/exercises")
def add_exercise(e: dict, current_user: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        if not upsert_exercise_record(db, e):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exercise name is required")
        record = normalize_exercise_record(e)
        action = "update_exercise" if db.query(ExerciseModel).filter_by(name=record["name"]).first() else "create_exercise"
        write_audit_log(
            db,
            current_user.username,
            action,
            "exercise",
            record["name"],
            f"{'Updated' if action == 'update_exercise' else 'Created'} exercise {record['name']}",
        )
        db.commit()
        row = db.query(ExerciseModel).filter_by(name=record["name"]).first()
        return {"ok": True, "exercise": serialize_exercise(row) if row else record}
    finally:
        db.close()

@app.get("/api/exercises/{exercise_name}/performance")
def get_exercise_performance(
    exercise_name: str,
    current_user: UserModel = Depends(get_current_user),
):
    db = get_db()
    try:
        return build_exercise_performance_summary(db, current_user.username, exercise_name)
    finally:
        db.close()

@app.put("/api/exercises/{name}")
def update_exercise(name: str, e: dict, current_user: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        row = db.query(ExerciseModel).filter_by(name=name).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")

        record = normalize_exercise_record(e)
        if not record["name"]:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exercise name is required")

        target_name = record["name"]
        if target_name != name:
            existing_target = db.query(ExerciseModel).filter_by(name=target_name).first()
            if existing_target:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="An exercise already uses this technical name")
            rename_exercise_references(db, name, target_name)

        row.name = target_name
        row.display_name = record["display_name"]
        row.display_name_fr = record["display_name_fr"]
        row.display_name_en = record["display_name_en"]
        row.category = record["category"]
        row.movement_family = record["movement_family"]
        row.variant_label = record["variant_label"]
        row.tracking_mode = record["tracking_mode"]
        row.weight_unit = record["weight_unit"]
        row.description = record["description"]
        row.link = record["link"]
        row.image = record["image"]
        row.images_json = record["images_json"]
        row.document = record["document"]
        write_audit_log(
            db,
            current_user.username,
            "update_exercise",
            "exercise",
            target_name,
            f"Updated exercise {name} -> {target_name}" if target_name != name else f"Updated exercise {target_name}",
        )
        db.commit()
        return {"ok": True, "exercise": serialize_exercise(row)}
    finally:
        db.close()


@app.post("/api/exercises/{name}/merge-into")
def merge_exercise(name: str, payload: dict, current_user: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        source_name = str(name or "").strip()
        target_name = str(payload.get("target_name", "") or "").strip()
        if not source_name or not target_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Source and target exercises are required")
        if source_name == target_name:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Choose a different target exercise")

        source_row = db.query(ExerciseModel).filter_by(name=source_name).first()
        if not source_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Source exercise not found")

        target_row = db.query(ExerciseModel).filter_by(name=target_name).first()
        if not target_row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target exercise not found")

        rename_exercise_references(db, source_name, target_name)
        merge_exercise_rows(target_row, source_row)
        write_audit_log(
            db,
            current_user.username,
            "merge_exercise",
            "exercise",
            target_name,
            f"Merged exercise {source_name} into {target_name}",
        )
        db.delete(source_row)
        db.commit()
        db.refresh(target_row)
        return {"ok": True, "exercise": serialize_exercise(target_row)}
    finally:
        db.close()


@app.post("/api/exercises/{name}/upload-image")
def upload_exercise_image(
    name: str,
    image_file: UploadFile = File(...),
    current_user: UserModel = Depends(get_current_user),
):
    db = get_db()
    try:
        row = db.query(ExerciseModel).filter_by(name=name).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")

        suffix = sanitize_upload_suffix(image_file.filename)
        if not suffix:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported image format")

        safe_name = "".join(ch if ch.isalnum() or ch in {"_", "-"} else "_" for ch in row.name).strip("_") or "exercise"
        target_name = f"{safe_name}_{uuid.uuid4().hex[:12]}{suffix}"
        target_path = EXERCISE_UPLOADS_DIR / target_name

        with target_path.open("wb") as output:
            shutil.copyfileobj(image_file.file, output)

        image_url = f"/api/uploads/exercises/{target_name}"
        existing_images = get_exercise_images(row)
        merged_images = [image_url] + [item for item in existing_images if item != image_url]
        set_exercise_images(row, merged_images)
        write_audit_log(
            db,
            current_user.username,
            "upload_exercise_image",
            "exercise",
            row.name,
            f"Uploaded image for {row.name}",
        )
        db.commit()
        db.refresh(row)
        return {"ok": True, "image_url": image_url, "exercise": serialize_exercise(row)}
    finally:
        image_file.file.close()
        db.close()


@app.post("/api/exercises/{name}/set-primary-image")
def set_primary_exercise_image(name: str, payload: dict, current_user: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        row = db.query(ExerciseModel).filter_by(name=name).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
        image_url = str(payload.get("image_url", "") or "").strip()
        existing_images = get_exercise_images(row)
        if image_url not in existing_images:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found on exercise")
        reordered = [image_url] + [item for item in existing_images if item != image_url]
        set_exercise_images(row, reordered)
        write_audit_log(
            db,
            current_user.username,
            "set_primary_exercise_image",
            "exercise",
            row.name,
            f"Changed primary image for {row.name}",
        )
        db.commit()
        db.refresh(row)
        return {"ok": True, "exercise": serialize_exercise(row)}
    finally:
        db.close()


@app.post("/api/exercises/{name}/delete-image")
def delete_exercise_image(name: str, payload: dict, current_user: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        row = db.query(ExerciseModel).filter_by(name=name).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Exercise not found")
        image_url = str(payload.get("image_url", "") or "").strip()
        existing_images = get_exercise_images(row)
        if image_url not in existing_images:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found on exercise")
        remaining = [item for item in existing_images if item != image_url]
        set_exercise_images(row, remaining)
        uploaded_path = resolve_uploaded_exercise_path(image_url)
        if uploaded_path and uploaded_path.is_file():
            uploaded_path.unlink(missing_ok=True)
        write_audit_log(
            db,
            current_user.username,
            "delete_exercise_image",
            "exercise",
            row.name,
            f"Deleted an image from {row.name}",
        )
        db.commit()
        db.refresh(row)
        return {"ok": True, "exercise": serialize_exercise(row)}
    finally:
        db.close()


@app.get("/api/uploads/exercises/{filename}")
def get_uploaded_exercise_image(filename: str):
    safe_filename = Path(filename).name
    target_path = EXERCISE_UPLOADS_DIR / safe_filename
    if not target_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    return FileResponse(target_path)

@app.delete("/api/exercises/{name}")
def delete_exercise(name: str, current_user: UserModel = Depends(require_admin)):
    db = get_db()
    try:
        if db.query(ExerciseModel).filter_by(name=name).first():
            write_audit_log(
                db,
                current_user.username,
                "delete_exercise",
                "exercise",
                name,
                f"Deleted exercise {name}",
            )
        db.query(ExerciseModel).filter_by(name=name).delete()
        db.commit()
        return {"ok": True}
    finally:
        db.close()

@app.get("/api/equipment/brands")
def get_equipment_brands(_: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        rows = db.query(EquipmentBrandModel).order_by(EquipmentBrandModel.name).all()
        return [serialize_brand(row) for row in rows]
    finally:
        db.close()

@app.post("/api/equipment/brands")
def add_equipment_brand(payload: dict, current_user: UserModel = Depends(get_current_user)):
    record = normalize_brand_record(payload)
    if not record["name"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Brand name is required")
    db = get_db()
    try:
        existing = db.query(EquipmentBrandModel).filter_by(name=record["name"]).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Brand already exists")
        row = EquipmentBrandModel(**record)
        db.add(row)
        write_audit_log(db, current_user.username, "create_equipment_brand", "equipment_brand", record["name"], f"Created equipment brand {record['name']}")
        db.commit()
        db.refresh(row)
        return {"ok": True, "brand": serialize_brand(row)}
    finally:
        db.close()

@app.put("/api/equipment/brands/{brand_id}")
def update_equipment_brand(brand_id: int, payload: dict, current_user: UserModel = Depends(get_current_user)):
    record = normalize_brand_record(payload)
    if not record["name"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Brand name is required")
    db = get_db()
    try:
        row = db.query(EquipmentBrandModel).filter_by(id=brand_id).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")
        duplicate = db.query(EquipmentBrandModel).filter(EquipmentBrandModel.name == record["name"], EquipmentBrandModel.id != brand_id).first()
        if duplicate:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Brand already exists")
        row.name = record["name"]
        row.created_at = record["created_at"]
        row.history = record["history"]
        write_audit_log(db, current_user.username, "update_equipment_brand", "equipment_brand", row.name, f"Updated equipment brand {row.name}")
        db.commit()
        db.refresh(row)
        return {"ok": True, "brand": serialize_brand(row)}
    finally:
        db.close()

@app.delete("/api/equipment/brands/{brand_id}")
def delete_equipment_brand(brand_id: int, current_user: UserModel = Depends(require_admin)):
    db = get_db()
    try:
        row = db.query(EquipmentBrandModel).filter_by(id=brand_id).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")
        if db.query(EquipmentModelRef).filter_by(brand_id=brand_id).first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Delete linked models first")
        if db.query(EquipmentModel).filter_by(brand_id=brand_id).first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Delete linked equipment first")
        write_audit_log(db, current_user.username, "delete_equipment_brand", "equipment_brand", row.name, f"Deleted equipment brand {row.name}")
        db.delete(row)
        db.commit()
        return {"ok": True}
    finally:
        db.close()

@app.get("/api/equipment/models")
def get_equipment_models(_: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        rows = db.query(EquipmentModelRef).order_by(EquipmentModelRef.name).all()
        brand_map = {row.id: row for row in db.query(EquipmentBrandModel).all()}
        return [serialize_equipment_model(row, brand_map.get(row.brand_id)) for row in rows]
    finally:
        db.close()

@app.post("/api/equipment/models")
def add_equipment_model(payload: dict, current_user: UserModel = Depends(get_current_user)):
    record = normalize_equipment_model_record(payload)
    if not record["brand_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="brand_id is required")
    if not record["name"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Model name is required")
    db = get_db()
    try:
        brand = db.query(EquipmentBrandModel).filter_by(id=record["brand_id"]).first()
        if not brand:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")
        existing = db.query(EquipmentModelRef).filter_by(brand_id=record["brand_id"], name=record["name"]).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Model already exists for this brand")
        row = EquipmentModelRef(**record)
        db.add(row)
        write_audit_log(db, current_user.username, "create_equipment_model", "equipment_model", record["name"], f"Created equipment model {record['name']} for {brand.name}")
        db.commit()
        db.refresh(row)
        return {"ok": True, "model": serialize_equipment_model(row, brand)}
    finally:
        db.close()

@app.put("/api/equipment/models/{model_id}")
def update_equipment_model(model_id: int, payload: dict, current_user: UserModel = Depends(get_current_user)):
    record = normalize_equipment_model_record(payload)
    if not record["brand_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="brand_id is required")
    if not record["name"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Model name is required")
    db = get_db()
    try:
        row = db.query(EquipmentModelRef).filter_by(id=model_id).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
        brand = db.query(EquipmentBrandModel).filter_by(id=record["brand_id"]).first()
        if not brand:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")
        duplicate = db.query(EquipmentModelRef).filter(
            EquipmentModelRef.brand_id == record["brand_id"],
            EquipmentModelRef.name == record["name"],
            EquipmentModelRef.id != model_id,
        ).first()
        if duplicate:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Model already exists for this brand")
        row.brand_id = record["brand_id"]
        row.name = record["name"]
        row.created_at = record["created_at"]
        row.history = record["history"]
        write_audit_log(db, current_user.username, "update_equipment_model", "equipment_model", row.name, f"Updated equipment model {row.name}")
        db.commit()
        db.refresh(row)
        return {"ok": True, "model": serialize_equipment_model(row, brand)}
    finally:
        db.close()

@app.delete("/api/equipment/models/{model_id}")
def delete_equipment_model(model_id: int, current_user: UserModel = Depends(require_admin)):
    db = get_db()
    try:
        row = db.query(EquipmentModelRef).filter_by(id=model_id).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
        if db.query(EquipmentModel).filter_by(model_id=model_id).first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Delete linked equipment first")
        write_audit_log(db, current_user.username, "delete_equipment_model", "equipment_model", row.name, f"Deleted equipment model {row.name}")
        db.delete(row)
        db.commit()
        return {"ok": True}
    finally:
        db.close()

@app.get("/api/equipment")
def get_equipment(_: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        rows = db.query(EquipmentModel).order_by(EquipmentModel.name).all()
        brand_map = {row.id: row for row in db.query(EquipmentBrandModel).all()}
        model_map = {row.id: row for row in db.query(EquipmentModelRef).all()}
        return [serialize_equipment(row, brand_map.get(row.brand_id), model_map.get(row.model_id)) for row in rows]
    finally:
        db.close()

@app.post("/api/equipment")
def add_equipment(payload: dict, current_user: UserModel = Depends(get_current_user)):
    record = normalize_equipment_record(payload)
    if not record["name"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Equipment name is required")
    if not record["brand_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="brand_id is required")
    if not record["model_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="model_id is required")

    db = get_db()
    try:
        existing = db.query(EquipmentModel).filter_by(name=record["name"]).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Equipment already exists")
        brand = db.query(EquipmentBrandModel).filter_by(id=record["brand_id"]).first()
        if not brand:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")
        model = db.query(EquipmentModelRef).filter_by(id=record["model_id"]).first()
        if not model:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
        if model.brand_id != brand.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Model does not belong to selected brand")
        row = EquipmentModel(**record)
        db.add(row)
        write_audit_log(db, current_user.username, "create_equipment", "equipment", record["name"], f"Created equipment {record['name']}")
        db.commit()
        db.refresh(row)
        return {"ok": True, "equipment": serialize_equipment(row, brand, model)}
    finally:
        db.close()

@app.put("/api/equipment/{equipment_id}")
def update_equipment(equipment_id: int, payload: dict, current_user: UserModel = Depends(get_current_user)):
    record = normalize_equipment_record(payload)
    if not record["name"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Equipment name is required")
    if not record["brand_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="brand_id is required")
    if not record["model_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="model_id is required")

    db = get_db()
    try:
        row = db.query(EquipmentModel).filter_by(id=equipment_id).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipment not found")
        duplicate = db.query(EquipmentModel).filter(EquipmentModel.name == record["name"], EquipmentModel.id != equipment_id).first()
        if duplicate:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Equipment already exists")
        brand = db.query(EquipmentBrandModel).filter_by(id=record["brand_id"]).first()
        if not brand:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")
        model = db.query(EquipmentModelRef).filter_by(id=record["model_id"]).first()
        if not model:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
        if model.brand_id != brand.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Model does not belong to selected brand")
        row.name = record["name"]
        row.brand_id = record["brand_id"]
        row.model_id = record["model_id"]
        row.category = record["category"]
        row.description = record["description"]
        row.image = record["image"]
        row.link = record["link"]
        write_audit_log(db, current_user.username, "update_equipment", "equipment", row.name, f"Updated equipment {row.name}")
        db.commit()
        return {"ok": True, "equipment": serialize_equipment(row, brand, model)}
    finally:
        db.close()

@app.delete("/api/equipment/{equipment_id}")
def delete_equipment(equipment_id: int, current_user: UserModel = Depends(require_admin)):
    db = get_db()
    try:
        row = db.query(EquipmentModel).filter_by(id=equipment_id).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipment not found")
        db.query(UserEquipmentModel).filter_by(equipment_id=equipment_id).delete()
        write_audit_log(db, current_user.username, "delete_equipment", "equipment", row.name, f"Deleted equipment {row.name}")
        db.delete(row)
        db.commit()
        return {"ok": True}
    finally:
        db.close()

@app.get("/api/my-equipment")
def get_my_equipment(current_user: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        purchases = db.query(UserEquipmentModel).filter_by(username=current_user.username).order_by(UserEquipmentModel.purchase_date.desc(), UserEquipmentModel.id.desc()).all()
        equipment_map = {row.id: row for row in db.query(EquipmentModel).all()}
        brand_map = {row.id: row for row in db.query(EquipmentBrandModel).all()}
        model_map = {row.id: row for row in db.query(EquipmentModelRef).all()}
        return [
            serialize_user_equipment(
                row,
                equipment_map.get(row.equipment_id),
                brand_map.get(equipment_map.get(row.equipment_id).brand_id) if equipment_map.get(row.equipment_id) else None,
                model_map.get(equipment_map.get(row.equipment_id).model_id) if equipment_map.get(row.equipment_id) else None,
            )
            for row in purchases
        ]
    finally:
        db.close()

@app.post("/api/my-equipment")
def add_my_equipment(payload: dict, current_user: UserModel = Depends(get_current_user)):
    record = normalize_user_equipment_record(payload)
    if not record["equipment_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="equipment_id is required")
    if not record["purchase_date"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="purchase_date is required")

    db = get_db()
    try:
        equipment = db.query(EquipmentModel).filter_by(id=record["equipment_id"]).first()
        if not equipment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipment not found")
        row = UserEquipmentModel(
            username=current_user.username,
            equipment_id=record["equipment_id"],
            purchase_date=record["purchase_date"],
            purchase_price=record["purchase_price"],
            note=record["note"],
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        brand = db.query(EquipmentBrandModel).filter_by(id=equipment.brand_id).first() if equipment.brand_id else None
        model = db.query(EquipmentModelRef).filter_by(id=equipment.model_id).first() if equipment.model_id else None
        write_audit_log(
            db,
            current_user.username,
            "add_my_equipment",
            "user_equipment",
            str(row.id),
            f"Added owned equipment {build_equipment_display_name(equipment, brand, model)}",
        )
        db.commit()
        return {"ok": True, "purchase": serialize_user_equipment(row, equipment, brand, model)}
    finally:
        db.close()

@app.put("/api/my-equipment/{purchase_id}")
def update_my_equipment(purchase_id: int, payload: dict, current_user: UserModel = Depends(get_current_user)):
    record = normalize_user_equipment_record(payload)
    if not record["equipment_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="equipment_id is required")
    if not record["purchase_date"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="purchase_date is required")

    db = get_db()
    try:
        row = db.query(UserEquipmentModel).filter_by(id=purchase_id, username=current_user.username).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase not found")
        equipment = db.query(EquipmentModel).filter_by(id=record["equipment_id"]).first()
        if not equipment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipment not found")
        row.equipment_id = record["equipment_id"]
        row.purchase_date = record["purchase_date"]
        row.purchase_price = record["purchase_price"]
        row.note = record["note"]
        db.commit()
        brand = db.query(EquipmentBrandModel).filter_by(id=equipment.brand_id).first() if equipment.brand_id else None
        model = db.query(EquipmentModelRef).filter_by(id=equipment.model_id).first() if equipment.model_id else None
        write_audit_log(
            db,
            current_user.username,
            "update_my_equipment",
            "user_equipment",
            str(row.id),
            f"Updated owned equipment {build_equipment_display_name(equipment, brand, model)}",
        )
        db.commit()
        return {"ok": True, "purchase": serialize_user_equipment(row, equipment, brand, model)}
    finally:
        db.close()

@app.delete("/api/my-equipment/{purchase_id}")
def delete_my_equipment(purchase_id: int, current_user: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        row = db.query(UserEquipmentModel).filter_by(id=purchase_id, username=current_user.username).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase not found")
        equipment = db.query(EquipmentModel).filter_by(id=row.equipment_id).first()
        brand = db.query(EquipmentBrandModel).filter_by(id=equipment.brand_id).first() if equipment and equipment.brand_id else None
        model = db.query(EquipmentModelRef).filter_by(id=equipment.model_id).first() if equipment and equipment.model_id else None
        write_audit_log(
            db,
            current_user.username,
            "delete_my_equipment",
            "user_equipment",
            str(row.id),
            f"Deleted owned equipment {build_equipment_display_name(equipment, brand, model) if equipment else row.equipment_id}",
        )
        db.delete(row)
        db.commit()
        return {"ok": True}
    finally:
        db.close()

@app.post("/api/import/program")
def import_program(payload: dict, current_user: UserModel = Depends(get_current_user)):
    import_format = str(payload.get("format", "json") or "json").strip().lower()
    content = payload.get("content", "")

    if not isinstance(content, str) or not content.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Import content is required")

    if import_format == "json":
        parsed_payload = parse_json_import_payload(content)
    elif import_format == "schedule_csv":
        parsed_payload = parse_schedule_csv(content)
    elif import_format == "exercises_csv":
        parsed_payload = {"exercises": parse_exercises_csv(content)}
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported import format")

    db = get_db()
    try:
        result = import_program_into_db(db, parsed_payload, current_user.username)
        write_audit_log(
            db,
            current_user.username,
            "import_program",
            "import",
            current_user.username,
            f"Imported program: {result['imported_sessions']} sessions, {result['created_exercises']} created, {result['updated_exercises']} updated",
        )
        db.commit()
        return {"ok": True, **result}
    finally:
        db.close()

@app.get("/api/session/{date_str}")
def read_session(date_str: str, current_user: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        row = get_session_obj(db, current_user.username, date_str)
        data = session_payload_from_row(row)
    finally:
        db.close()
    target = get_target_for_date(date_str)
    data.update(target)
    data["diff"] = round((data.get("load", 0) or 0) - target["target_load"], 2)
    return data

@app.post("/api/session/{date_str}")
def write_session(date_str: str, payload: dict, current_user: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        row = get_session_obj(db, current_user.username, date_str)
        existing_payload = session_payload_from_row(row) if row else None
        normalized_payload = normalize_session_payload(payload, existing_payload)
        if row:
            row.data = json.dumps(normalized_payload)
        else:
            db.add(SessionModel(username=current_user.username, date=date_str, data=json.dumps(normalized_payload)))
        if not str(normalized_payload.get("draft_updated_at", "") or "").strip():
            write_audit_log(
                db,
                current_user.username,
                "save_session",
                "session",
                date_str,
                f"Saved {normalized_payload.get('activity_type') or 'session'} activity on {date_str}",
            )
        db.commit()
        return {"ok": True}
    finally:
        db.close()

@app.get("/api/calendar")
def get_calendar(
    days_back: int = 3,
    days_forward: int = 21,
    start_date: str | None = None,
    end_date: str | None = None,
    current_user: UserModel = Depends(get_current_user),
):
    out = []
    db = get_db()
    try:
        if start_date or end_date:
            if not start_date or not end_date:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="start_date and end_date must be provided together")
            try:
                start_obj = date.fromisoformat(str(start_date))
                end_obj = date.fromisoformat(str(end_date))
            except ValueError as exc:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid calendar date range") from exc
            if end_obj < start_obj:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="end_date must be after start_date")
            dates = [start_obj + timedelta(days=offset) for offset in range((end_obj - start_obj).days + 1)]
        else:
            today = date.today()
            dates = [today + timedelta(days=i) for i in range(-days_back, days_forward + 1)]

        for d in dates:
            date_str = d.isoformat()
            row = get_session_obj(db, current_user.username, date_str)
            payload = session_payload_from_row(row)
            target = get_target_for_date(date_str)
            display_exercises = get_calendar_display_exercises(payload)
            planned_exercises = unique_names(
                [
                    item.get("exercise_name", "")
                    for item in payload.get("planned_items", [])
                    if item.get("exercise_name")
                ]
            )
            performed_exercises = unique_names(
                [item.get("custom_name", "") or item.get("exercise_name", "") for item in payload.get("performed_items", [])]
            )
            out.append({
                "date": date_str,
                "rehab_day": target["rehab_day"],
                "status": payload.get("status", "todo"),
                "target_load": target["target_load"],
                "actual_load": payload.get("load", 0),
                "diff": round((payload.get("load", 0) or 0) - target["target_load"], 2),
                "sport_allowed": target["sport_allowed"],
                "physio_time": payload.get("physio_time", ""),
                "activity_type": payload.get("activity_type", ""),
                "activity_details": payload.get("activity_details", ""),
                "climbing_routes": payload.get("climbing_routes", []),
                "exercises": display_exercises,
                "planned_exercises": planned_exercises,
                "performed_exercises": performed_exercises,
                "plan_title": payload.get("plan_title", ""),
            })
        return out
    finally:
        db.close()
