
import csv
import hashlib
import hmac
import json
import math
import mimetypes
import os
import re
import secrets
import unicodedata
import uuid
from datetime import date, datetime, timedelta, timezone
from io import BytesIO, StringIO
from pathlib import Path
from urllib.parse import quote, urlparse
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET

from fastapi import Depends, FastAPI, File, Form, Header, HTTPException, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from sqlalchemy import Boolean, Column, Float, ForeignKey, Integer, String, Text, UniqueConstraint, create_engine, event
from sqlalchemy.orm import object_session, sessionmaker, declarative_base

app = FastAPI(title="Rehab Tracker V19b")

def parse_env_csv(value: str) -> list[str]:
    items = []
    seen = set()
    for raw_item in str(value or "").split(","):
        item = raw_item.strip()
        if item and item not in seen:
            items.append(item)
            seen.add(item)
    return items

CORS_ALLOWED_ORIGINS = parse_env_csv(os.getenv("REHAB_CORS_ALLOWED_ORIGINS")) or [
    "https://go.foudefun.ch",
    "http://localhost",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
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
ACTIVITY_UPLOADS_DIR = UPLOADS_DIR / "activities"
ACTIVITY_SOURCE_UPLOADS_DIR = UPLOADS_DIR / "activity-sources"
BRAND_LOGOS_DIR = UPLOADS_DIR / "equipment-brands"
EXERCISE_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
ACTIVITY_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
ACTIVITY_SOURCE_UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
BRAND_LOGOS_DIR.mkdir(parents=True, exist_ok=True)

engine = create_engine(f"sqlite:///{DB_PATH.as_posix()}", connect_args={"check_same_thread": False})

@event.listens_for(engine, "connect")
def enable_sqlite_foreign_keys(dbapi_connection, _):
    cursor = dbapi_connection.cursor()
    cursor.execute("PRAGMA foreign_keys=ON")
    cursor.close()

SessionLocal = sessionmaker(bind=engine)
Base = declarative_base()

DEFAULT_USERNAME = os.getenv("REHAB_DEFAULT_USERNAME", "admin")
DEFAULT_PASSWORD = os.getenv("REHAB_DEFAULT_PASSWORD", "")
LEGACY_DEFAULT_PASSWORD = "changeme123"
TOKEN_TTL_HOURS = int(os.getenv("REHAB_TOKEN_TTL_HOURS", "168"))
PASSWORD_ITERATIONS = 200_000
MAX_IMAGE_UPLOAD_BYTES = int(os.getenv("REHAB_MAX_IMAGE_UPLOAD_BYTES", str(5 * 1024 * 1024)))
MAX_ACTIVITY_SOURCE_UPLOAD_BYTES = int(os.getenv("REHAB_MAX_ACTIVITY_SOURCE_UPLOAD_BYTES", str(25 * 1024 * 1024)))

class SessionModel(Base):
    __tablename__ = "sessions"
    __table_args__ = (UniqueConstraint("username", "date", name="uq_sessions_username_date"),)
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, ForeignKey("users.username", ondelete="CASCADE"), nullable=False)
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

class ExerciseCategoryModel(Base):
    __tablename__ = "exercise_categories"
    name = Column(String, primary_key=True)
    display_name_fr = Column(Text)
    display_name_en = Column(Text)

class ExerciseCategoryLinkModel(Base):
    __tablename__ = "exercise_category_links"
    exercise_name = Column(String, ForeignKey("exercises.name", ondelete="CASCADE"), primary_key=True)
    category_name = Column(String, ForeignKey("exercise_categories.name", ondelete="CASCADE"), primary_key=True)

class ExerciseMovementFamilyModel(Base):
    __tablename__ = "exercise_movement_families"
    name = Column(String, primary_key=True)
    display_name_fr = Column(Text)
    display_name_en = Column(Text)

class ExerciseMovementFamilyLinkModel(Base):
    __tablename__ = "exercise_movement_family_links"
    exercise_name = Column(String, ForeignKey("exercises.name", ondelete="CASCADE"), primary_key=True)
    family_name = Column(String, ForeignKey("exercise_movement_families.name", ondelete="CASCADE"), nullable=False)

class CountryModel(Base):
    __tablename__ = "countries"
    id = Column(Integer, primary_key=True, autoincrement=True)
    iso_code = Column(String, nullable=False, unique=True)
    name_fr = Column(String, nullable=False)
    name_en = Column(String, nullable=False)
    is_active = Column(Boolean, nullable=False, default=True)

class EquipmentBrandModel(Base):
    __tablename__ = "equipment_brands"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False, unique=True)
    normalized_name = Column(String)
    country_id = Column(Integer, ForeignKey("countries.id"))
    year_established = Column(Integer)
    website_url = Column(Text)
    description = Column(Text)
    logo_url = Column(Text)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String)
    history = Column(Text)

class EquipmentModelRef(Base):
    __tablename__ = "equipment_models"
    __table_args__ = (UniqueConstraint("brand_id", "normalized_name", name="uq_equipment_models_brand_normalized_name"),)
    id = Column(Integer, primary_key=True, autoincrement=True)
    brand_id = Column(Integer, ForeignKey("equipment_brands.id"), nullable=False)
    name = Column(String, nullable=False)
    normalized_name = Column(String)
    category_id = Column(Integer, ForeignKey("equipment_categories.id"))
    description = Column(Text)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String)
    history = Column(Text)

class EquipmentCategoryModel(Base):
    __tablename__ = "equipment_categories"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False, unique=True)
    normalized_name = Column(String, unique=True)
    display_name_fr = Column(Text)
    display_name_en = Column(Text)
    parent_id = Column(Integer, ForeignKey("equipment_categories.id"))
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String)

class EquipmentModelVersionModel(Base):
    __tablename__ = "equipment_model_versions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    model_id = Column(Integer, ForeignKey("equipment_models.id", ondelete="CASCADE"), nullable=False)
    version_name = Column(String)
    release_year = Column(Integer)
    season = Column(String)
    generation = Column(String)
    description = Column(Text)
    technical_specs = Column(Text)
    product_url = Column(Text)
    image_url = Column(Text)
    discontinued_year = Column(Integer)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String)

class EquipmentModelColorModel(Base):
    __tablename__ = "equipment_model_colors"
    id = Column(Integer, primary_key=True, autoincrement=True)
    model_version_id = Column(Integer, ForeignKey("equipment_model_versions.id", ondelete="CASCADE"), nullable=False)
    color_name = Column(String, nullable=False)
    manufacturer_color_name = Column(String)
    color_code = Column(String)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String)

class EquipmentModelSizeModel(Base):
    __tablename__ = "equipment_model_sizes"
    id = Column(Integer, primary_key=True, autoincrement=True)
    model_version_id = Column(Integer, ForeignKey("equipment_model_versions.id", ondelete="CASCADE"), nullable=False)
    size_label = Column(String, nullable=False)
    size_system = Column(String)
    size_type = Column(String)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String)

class EquipmentModelVariantModel(Base):
    __tablename__ = "equipment_model_variants"
    __table_args__ = (UniqueConstraint("model_version_id", "color_id", "size_id", "sku", name="uq_equipment_model_variants_combo_sku"),)
    id = Column(Integer, primary_key=True, autoincrement=True)
    model_version_id = Column(Integer, ForeignKey("equipment_model_versions.id", ondelete="CASCADE"), nullable=False)
    color_id = Column(Integer, ForeignKey("equipment_model_colors.id"))
    size_id = Column(Integer, ForeignKey("equipment_model_sizes.id"))
    sku = Column(String)
    barcode = Column(String)
    manufacturer_reference = Column(String)
    is_available = Column(Boolean, nullable=False, default=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String)

class EquipmentItemModel(Base):
    __tablename__ = "equipment_items"
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, ForeignKey("users.username", ondelete="CASCADE"), nullable=False)
    model_version_id = Column(Integer, ForeignKey("equipment_model_versions.id"), nullable=False)
    variant_id = Column(Integer, ForeignKey("equipment_model_variants.id"))
    purchase_date = Column(String)
    purchase_price = Column(Float)
    purchase_currency = Column(String)
    purchase_location = Column(Text)
    purchase_shop_url = Column(Text)
    purchase_condition = Column(String)
    serial_number = Column(String)
    nickname = Column(String)
    status = Column(String, nullable=False, default="owned")
    notes = Column(Text)
    created_at = Column(String, nullable=False)
    updated_at = Column(String)

class EquipmentItemEventModel(Base):
    __tablename__ = "equipment_item_events"
    id = Column(Integer, primary_key=True, autoincrement=True)
    equipment_item_id = Column(Integer, ForeignKey("equipment_items.id", ondelete="CASCADE"), nullable=False)
    event_type = Column(String, nullable=False)
    event_date = Column(String)
    price = Column(Float)
    currency = Column(String)
    location = Column(Text)
    counterparty = Column(Text)
    notes = Column(Text)
    created_at = Column(String, nullable=False)

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
    username = Column(String, ForeignKey("users.username", ondelete="CASCADE"), nullable=False)
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

class ClimbingAreaModel(Base):
    __tablename__ = "climbing_areas"
    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String, nullable=False, unique=True)
    country = Column(String)
    region = Column(String)
    description = Column(Text)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class ClimbingCragModel(Base):
    __tablename__ = "climbing_crags"
    id = Column(Integer, primary_key=True, autoincrement=True)
    area_id = Column(Integer, ForeignKey("climbing_areas.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    latitude = Column(Float)
    longitude = Column(Float)
    approach_notes = Column(Text)
    description = Column(Text)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class ClimbingSectorModel(Base):
    __tablename__ = "climbing_sectors"
    id = Column(Integer, primary_key=True, autoincrement=True)
    crag_id = Column(Integer, ForeignKey("climbing_crags.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    aspect = Column(String)
    approach_minutes = Column(Integer)
    description = Column(Text)
    safety_note = Column(Text)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class ClimbingTopoImageModel(Base):
    __tablename__ = "climbing_topo_images"
    id = Column(Integer, primary_key=True, autoincrement=True)
    sector_id = Column(Integer, ForeignKey("climbing_sectors.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    image_url = Column(Text, nullable=False)
    width = Column(Integer, nullable=False)
    height = Column(Integer, nullable=False)
    source = Column(Text)
    attribution = Column(Text)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class ClimbingRouteModel(Base):
    __tablename__ = "climbing_routes"
    id = Column(Integer, primary_key=True, autoincrement=True)
    sector_id = Column(Integer, ForeignKey("climbing_sectors.id", ondelete="CASCADE"), nullable=False)
    topo_image_id = Column(Integer, ForeignKey("climbing_topo_images.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    grade = Column(String)
    length_m = Column(Float)
    pitches = Column(Integer)
    style = Column(String)
    description = Column(Text)
    notes = Column(Text)
    danger_flag = Column(Boolean, nullable=False, default=False)
    color = Column(String)
    polyline_json = Column(Text, nullable=False)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class ClimbingCalibrationSessionModel(Base):
    __tablename__ = "climbing_calibration_sessions"
    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, ForeignKey("users.username", ondelete="CASCADE"), nullable=False)
    sector_id = Column(Integer, ForeignKey("climbing_sectors.id", ondelete="CASCADE"), nullable=False)
    topo_image_id = Column(Integer, ForeignKey("climbing_topo_images.id", ondelete="CASCADE"), nullable=False)
    name = Column(String)
    transform_type = Column(String, nullable=False, default="affine")
    transform_json = Column(Text, nullable=False)
    opacity = Column(Float, nullable=False, default=0.75)
    route_visibility_json = Column(Text)
    is_active = Column(Boolean, nullable=False, default=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

class ClimbingCalibrationPointModel(Base):
    __tablename__ = "climbing_calibration_points"
    id = Column(Integer, primary_key=True, autoincrement=True)
    calibration_session_id = Column(Integer, ForeignKey("climbing_calibration_sessions.id", ondelete="CASCADE"), nullable=False)
    order_index = Column(Integer, nullable=False)
    label = Column(String)
    topo_x = Column(Float, nullable=False)
    topo_y = Column(Float, nullable=False)
    camera_x = Column(Float, nullable=False)
    camera_y = Column(Float, nullable=False)

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

        brand_columns = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(equipment_brands)").fetchall()}
        if brand_columns:
            if "normalized_name" not in brand_columns:
                conn.exec_driver_sql("ALTER TABLE equipment_brands ADD COLUMN normalized_name VARCHAR")
            if "country_id" not in brand_columns:
                conn.exec_driver_sql("ALTER TABLE equipment_brands ADD COLUMN country_id INTEGER")
            if "year_established" not in brand_columns:
                conn.exec_driver_sql("ALTER TABLE equipment_brands ADD COLUMN year_established INTEGER")
            if "website_url" not in brand_columns:
                conn.exec_driver_sql("ALTER TABLE equipment_brands ADD COLUMN website_url TEXT")
            if "description" not in brand_columns:
                conn.exec_driver_sql("ALTER TABLE equipment_brands ADD COLUMN description TEXT")
            if "logo_url" not in brand_columns:
                conn.exec_driver_sql("ALTER TABLE equipment_brands ADD COLUMN logo_url TEXT")
            if "is_active" not in brand_columns:
                conn.exec_driver_sql("ALTER TABLE equipment_brands ADD COLUMN is_active BOOLEAN DEFAULT 1")
            if "updated_at" not in brand_columns:
                conn.exec_driver_sql("ALTER TABLE equipment_brands ADD COLUMN updated_at VARCHAR")
            conn.exec_driver_sql("UPDATE equipment_brands SET is_active = 1 WHERE is_active IS NULL")

        conn.exec_driver_sql(
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
            )
            """
        )

        model_columns = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(equipment_models)").fetchall()}
        if model_columns:
            if "normalized_name" not in model_columns:
                conn.exec_driver_sql("ALTER TABLE equipment_models ADD COLUMN normalized_name VARCHAR")
            if "category_id" not in model_columns:
                conn.exec_driver_sql("ALTER TABLE equipment_models ADD COLUMN category_id INTEGER")
            if "description" not in model_columns:
                conn.exec_driver_sql("ALTER TABLE equipment_models ADD COLUMN description TEXT")
            if "is_active" not in model_columns:
                conn.exec_driver_sql("ALTER TABLE equipment_models ADD COLUMN is_active BOOLEAN DEFAULT 1")
            if "updated_at" not in model_columns:
                conn.exec_driver_sql("ALTER TABLE equipment_models ADD COLUMN updated_at VARCHAR")
            conn.exec_driver_sql("UPDATE equipment_models SET normalized_name = LOWER(TRIM(name)) WHERE COALESCE(normalized_name, '') = ''")
            conn.exec_driver_sql("UPDATE equipment_models SET is_active = 1 WHERE is_active IS NULL")
            duplicate_model_keys = conn.exec_driver_sql(
                """
                SELECT brand_id, normalized_name
                FROM equipment_models
                WHERE COALESCE(normalized_name, '') != ''
                GROUP BY brand_id, normalized_name
                HAVING COUNT(*) > 1
                """
            ).fetchall()
            for brand_id, normalized_name in duplicate_model_keys:
                duplicate_rows = conn.exec_driver_sql(
                    """
                    SELECT id
                    FROM equipment_models
                    WHERE brand_id = :brand_id AND normalized_name = :normalized_name
                    ORDER BY id
                    """,
                    {"brand_id": brand_id, "normalized_name": normalized_name},
                ).fetchall()
                for duplicate_row in duplicate_rows[1:]:
                    conn.exec_driver_sql(
                        "UPDATE equipment_models SET normalized_name = :normalized_name WHERE id = :id",
                        {"normalized_name": f"{normalized_name} {duplicate_row[0]}", "id": duplicate_row[0]},
                    )

        conn.exec_driver_sql(
            """
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
            )
            """
        )
        conn.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS equipment_model_colors (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                model_version_id INTEGER NOT NULL,
                color_name VARCHAR NOT NULL,
                manufacturer_color_name VARCHAR,
                color_code VARCHAR,
                is_active BOOLEAN NOT NULL DEFAULT 1,
                created_at VARCHAR NOT NULL,
                updated_at VARCHAR,
                FOREIGN KEY(model_version_id) REFERENCES equipment_model_versions(id) ON DELETE CASCADE
            )
            """
        )
        conn.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS equipment_model_sizes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                model_version_id INTEGER NOT NULL,
                size_label VARCHAR NOT NULL,
                size_system VARCHAR,
                size_type VARCHAR,
                is_active BOOLEAN NOT NULL DEFAULT 1,
                created_at VARCHAR NOT NULL,
                updated_at VARCHAR,
                FOREIGN KEY(model_version_id) REFERENCES equipment_model_versions(id) ON DELETE CASCADE
            )
            """
        )
        conn.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS equipment_model_variants (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                model_version_id INTEGER NOT NULL,
                color_id INTEGER,
                size_id INTEGER,
                sku VARCHAR,
                barcode VARCHAR,
                manufacturer_reference VARCHAR,
                is_available BOOLEAN NOT NULL DEFAULT 1,
                created_at VARCHAR NOT NULL,
                updated_at VARCHAR,
                FOREIGN KEY(model_version_id) REFERENCES equipment_model_versions(id) ON DELETE CASCADE,
                FOREIGN KEY(color_id) REFERENCES equipment_model_colors(id),
                FOREIGN KEY(size_id) REFERENCES equipment_model_sizes(id)
            )
            """
        )
        conn.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS equipment_items (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username VARCHAR NOT NULL,
                model_version_id INTEGER NOT NULL,
                variant_id INTEGER,
                purchase_date VARCHAR,
                purchase_price FLOAT,
                purchase_currency VARCHAR,
                purchase_location TEXT,
                purchase_shop_url TEXT,
                purchase_condition VARCHAR,
                serial_number VARCHAR,
                nickname VARCHAR,
                status VARCHAR NOT NULL DEFAULT 'owned',
                notes TEXT,
                created_at VARCHAR NOT NULL,
                updated_at VARCHAR,
                FOREIGN KEY(username) REFERENCES users(username) ON DELETE CASCADE,
                FOREIGN KEY(model_version_id) REFERENCES equipment_model_versions(id),
                FOREIGN KEY(variant_id) REFERENCES equipment_model_variants(id)
            )
            """
        )
        conn.exec_driver_sql(
            """
            CREATE TABLE IF NOT EXISTS equipment_item_events (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                equipment_item_id INTEGER NOT NULL,
                event_type VARCHAR NOT NULL,
                event_date VARCHAR,
                price FLOAT,
                currency VARCHAR,
                location TEXT,
                counterparty TEXT,
                notes TEXT,
                created_at VARCHAR NOT NULL,
                FOREIGN KEY(equipment_item_id) REFERENCES equipment_items(id) ON DELETE CASCADE
            )
            """
        )

        equipment_exists = conn.exec_driver_sql(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='equipment'"
        ).fetchone()
        if equipment_exists:
            today = date.today().isoformat()
            legacy_rows = conn.exec_driver_sql(
                "SELECT id, name, brand_id, model_id, category, description, image, link FROM equipment ORDER BY id"
            ).fetchall()
            for row in legacy_rows:
                equipment_id, name, brand_id, model_id, category_name, description, image, link = row
                category_id = None
                category_label = str(category_name or "").strip()
                if category_label:
                    category_key = category_label.lower()
                    conn.exec_driver_sql(
                        """
                        INSERT OR IGNORE INTO equipment_categories
                        (name, normalized_name, display_name_fr, display_name_en, is_active, created_at, updated_at)
                        VALUES (:name, :normalized_name, :display_name_fr, :display_name_en, 1, :created_at, :updated_at)
                        """,
                        {
                            "name": category_key,
                            "normalized_name": category_key,
                            "display_name_fr": category_label,
                            "display_name_en": category_label,
                            "created_at": today,
                            "updated_at": today,
                        },
                    )
                    category_id_row = conn.exec_driver_sql(
                        "SELECT id FROM equipment_categories WHERE normalized_name = :normalized_name",
                        {"normalized_name": category_key},
                    ).fetchone()
                    category_id = category_id_row[0] if category_id_row else None

                resolved_model_id = model_id
                if not resolved_model_id and brand_id:
                    model_name = str(name or "").strip() or f"Equipment {equipment_id}"
                    conn.exec_driver_sql(
                        """
                        INSERT INTO equipment_models
                        (brand_id, name, normalized_name, category_id, description, is_active, created_at, updated_at, history)
                        VALUES (:brand_id, :name, :normalized_name, :category_id, :description, 1, :created_at, :updated_at, '')
                        """,
                        {
                            "brand_id": brand_id,
                            "name": model_name,
                            "normalized_name": model_name.lower(),
                            "category_id": category_id,
                            "description": description or "",
                            "created_at": today,
                            "updated_at": today,
                        },
                    )
                    resolved_model_id = conn.exec_driver_sql("SELECT last_insert_rowid()").scalar()

                if not resolved_model_id:
                    continue

                if category_id:
                    conn.exec_driver_sql(
                        "UPDATE equipment_models SET category_id = COALESCE(category_id, :category_id) WHERE id = :model_id",
                        {"category_id": category_id, "model_id": resolved_model_id},
                    )
                if description:
                    conn.exec_driver_sql(
                        "UPDATE equipment_models SET description = COALESCE(NULLIF(description, ''), :description) WHERE id = :model_id",
                        {"description": description, "model_id": resolved_model_id},
                    )

                conn.exec_driver_sql(
                    """
                    INSERT OR IGNORE INTO equipment_model_versions
                    (id, model_id, version_name, description, product_url, image_url, is_active, created_at, updated_at)
                    VALUES (:id, :model_id, :version_name, :description, :product_url, :image_url, 1, :created_at, :updated_at)
                    """,
                    {
                        "id": equipment_id,
                        "model_id": resolved_model_id,
                        "version_name": str(name or "").strip(),
                        "description": description or "",
                        "product_url": link or "",
                        "image_url": image or "",
                        "created_at": today,
                        "updated_at": today,
                    },
                )

            user_equipment_exists = conn.exec_driver_sql(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='user_equipment'"
            ).fetchone()
            if user_equipment_exists:
                user_equipment_rows = conn.exec_driver_sql(
                    "SELECT id, username, equipment_id, purchase_date, purchase_price, note FROM user_equipment ORDER BY id"
                ).fetchall()
                for row in user_equipment_rows:
                    purchase_id, username, equipment_id, purchase_date, purchase_price, note = row
                    version_exists = conn.exec_driver_sql(
                        "SELECT id FROM equipment_model_versions WHERE id = :id",
                        {"id": equipment_id},
                    ).fetchone()
                    if not version_exists:
                        continue
                    conn.exec_driver_sql(
                        """
                        INSERT OR IGNORE INTO equipment_items
                        (id, username, model_version_id, purchase_date, purchase_price, status, notes, created_at, updated_at)
                        VALUES (:id, :username, :model_version_id, :purchase_date, :purchase_price, 'owned', :notes, :created_at, :updated_at)
                        """,
                        {
                            "id": purchase_id,
                            "username": username,
                            "model_version_id": equipment_id,
                            "purchase_date": purchase_date,
                            "purchase_price": purchase_price,
                            "notes": note or "",
                            "created_at": purchase_date or today,
                            "updated_at": today,
                        },
                    )
                conn.exec_driver_sql("DROP TABLE user_equipment")
            conn.exec_driver_sql("DROP TABLE equipment")

        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_equipment_models_brand_id ON equipment_models(brand_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_equipment_models_normalized_name ON equipment_models(normalized_name)")
        conn.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_models_brand_normalized_name_idx ON equipment_models(brand_id, normalized_name) WHERE COALESCE(normalized_name, '') != ''")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_equipment_model_versions_model_id ON equipment_model_versions(model_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_equipment_model_colors_version_id ON equipment_model_colors(model_version_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_equipment_model_sizes_version_id ON equipment_model_sizes(model_version_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_equipment_model_variants_version_id ON equipment_model_variants(model_version_id)")
        conn.exec_driver_sql("CREATE UNIQUE INDEX IF NOT EXISTS uq_equipment_model_variants_combo_sku_idx ON equipment_model_variants(model_version_id, color_id, size_id, sku)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_equipment_items_username ON equipment_items(username)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_equipment_items_model_version_id ON equipment_items(model_version_id)")
        conn.exec_driver_sql("CREATE INDEX IF NOT EXISTS ix_equipment_item_events_item_id ON equipment_item_events(equipment_item_id)")

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

SQLITE_FOREIGN_KEY_TABLES = {
    "equipment_brands": {
        "columns": "id, name, normalized_name, country_id, year_established, website_url, description, logo_url, is_active, created_at, updated_at, history",
        "foreign_keys": {("country_id", "countries", "id", "NO ACTION")},
        "create_sql": """
            CREATE TABLE {table} (
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
        """,
    },
    "exercise_category_links": {
        "columns": "exercise_name, category_name",
        "foreign_keys": {
            ("exercise_name", "exercises", "name", "CASCADE"),
            ("category_name", "exercise_categories", "name", "CASCADE"),
        },
        "create_sql": """
            CREATE TABLE {table} (
                exercise_name VARCHAR NOT NULL,
                category_name VARCHAR NOT NULL,
                PRIMARY KEY (exercise_name, category_name),
                FOREIGN KEY(exercise_name) REFERENCES exercises(name) ON DELETE CASCADE,
                FOREIGN KEY(category_name) REFERENCES exercise_categories(name) ON DELETE CASCADE
            )
        """,
    },
    "exercise_movement_family_links": {
        "columns": "exercise_name, family_name",
        "foreign_keys": {
            ("exercise_name", "exercises", "name", "CASCADE"),
            ("family_name", "exercise_movement_families", "name", "CASCADE"),
        },
        "create_sql": """
            CREATE TABLE {table} (
                exercise_name VARCHAR NOT NULL PRIMARY KEY,
                family_name VARCHAR NOT NULL,
                FOREIGN KEY(exercise_name) REFERENCES exercises(name) ON DELETE CASCADE,
                FOREIGN KEY(family_name) REFERENCES exercise_movement_families(name) ON DELETE CASCADE
            )
        """,
    },
    "sessions": {
        "columns": "id, username, date, data",
        "foreign_keys": {("username", "users", "username", "CASCADE")},
        "create_sql": """
            CREATE TABLE {table} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username VARCHAR NOT NULL,
                date VARCHAR NOT NULL,
                data TEXT,
                FOREIGN KEY(username) REFERENCES users(username) ON DELETE CASCADE,
                UNIQUE(username, date)
            )
        """,
    },
    "auth_tokens": {
        "columns": "token_hash, username, expires_at",
        "foreign_keys": {("username", "users", "username", "CASCADE")},
        "create_sql": """
            CREATE TABLE {table} (
                token_hash VARCHAR PRIMARY KEY,
                username VARCHAR NOT NULL,
                expires_at VARCHAR NOT NULL,
                FOREIGN KEY(username) REFERENCES users(username) ON DELETE CASCADE
            )
        """,
    },
    "equipment_models": {
        "columns": "id, brand_id, name, normalized_name, category_id, description, is_active, created_at, updated_at, history",
        "foreign_keys": {
            ("brand_id", "equipment_brands", "id", "NO ACTION"),
            ("category_id", "equipment_categories", "id", "NO ACTION"),
        },
        "create_sql": """
            CREATE TABLE {table} (
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
            )
        """,
    },
    "equipment_categories": {
        "columns": "id, name, normalized_name, display_name_fr, display_name_en, parent_id, is_active, created_at, updated_at",
        "foreign_keys": {
            ("parent_id", "equipment_categories", "id", "NO ACTION"),
        },
        "create_sql": """
            CREATE TABLE {table} (
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
            )
        """,
    },
    "equipment_model_versions": {
        "columns": "id, model_id, version_name, release_year, season, generation, description, technical_specs, product_url, image_url, discontinued_year, is_active, created_at, updated_at",
        "foreign_keys": {("model_id", "equipment_models", "id", "CASCADE")},
        "create_sql": """
            CREATE TABLE {table} (
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
            )
        """,
    },
    "equipment_model_colors": {
        "columns": "id, model_version_id, color_name, manufacturer_color_name, color_code, is_active, created_at, updated_at",
        "foreign_keys": {("model_version_id", "equipment_model_versions", "id", "CASCADE")},
        "create_sql": """
            CREATE TABLE {table} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                model_version_id INTEGER NOT NULL,
                color_name VARCHAR NOT NULL,
                manufacturer_color_name VARCHAR,
                color_code VARCHAR,
                is_active BOOLEAN NOT NULL DEFAULT 1,
                created_at VARCHAR NOT NULL,
                updated_at VARCHAR,
                FOREIGN KEY(model_version_id) REFERENCES equipment_model_versions(id) ON DELETE CASCADE
            )
        """,
    },
    "equipment_model_sizes": {
        "columns": "id, model_version_id, size_label, size_system, size_type, is_active, created_at, updated_at",
        "foreign_keys": {("model_version_id", "equipment_model_versions", "id", "CASCADE")},
        "create_sql": """
            CREATE TABLE {table} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                model_version_id INTEGER NOT NULL,
                size_label VARCHAR NOT NULL,
                size_system VARCHAR,
                size_type VARCHAR,
                is_active BOOLEAN NOT NULL DEFAULT 1,
                created_at VARCHAR NOT NULL,
                updated_at VARCHAR,
                FOREIGN KEY(model_version_id) REFERENCES equipment_model_versions(id) ON DELETE CASCADE
            )
        """,
    },
    "equipment_model_variants": {
        "columns": "id, model_version_id, color_id, size_id, sku, barcode, manufacturer_reference, is_available, created_at, updated_at",
        "foreign_keys": {
            ("model_version_id", "equipment_model_versions", "id", "CASCADE"),
            ("color_id", "equipment_model_colors", "id", "NO ACTION"),
            ("size_id", "equipment_model_sizes", "id", "NO ACTION"),
        },
        "create_sql": """
            CREATE TABLE {table} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                model_version_id INTEGER NOT NULL,
                color_id INTEGER,
                size_id INTEGER,
                sku VARCHAR,
                barcode VARCHAR,
                manufacturer_reference VARCHAR,
                is_available BOOLEAN NOT NULL DEFAULT 1,
                created_at VARCHAR NOT NULL,
                updated_at VARCHAR,
                FOREIGN KEY(model_version_id) REFERENCES equipment_model_versions(id) ON DELETE CASCADE,
                FOREIGN KEY(color_id) REFERENCES equipment_model_colors(id),
                FOREIGN KEY(size_id) REFERENCES equipment_model_sizes(id),
                UNIQUE(model_version_id, color_id, size_id, sku)
            )
        """,
    },
    "equipment_items": {
        "columns": "id, username, model_version_id, variant_id, purchase_date, purchase_price, purchase_currency, purchase_location, purchase_shop_url, purchase_condition, serial_number, nickname, status, notes, created_at, updated_at",
        "foreign_keys": {
            ("username", "users", "username", "CASCADE"),
            ("model_version_id", "equipment_model_versions", "id", "NO ACTION"),
            ("variant_id", "equipment_model_variants", "id", "NO ACTION"),
        },
        "create_sql": """
            CREATE TABLE {table} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username VARCHAR NOT NULL,
                model_version_id INTEGER NOT NULL,
                variant_id INTEGER,
                purchase_date VARCHAR,
                purchase_price FLOAT,
                purchase_currency VARCHAR,
                purchase_location TEXT,
                purchase_shop_url TEXT,
                purchase_condition VARCHAR,
                serial_number VARCHAR,
                nickname VARCHAR,
                status VARCHAR NOT NULL DEFAULT 'owned',
                notes TEXT,
                created_at VARCHAR NOT NULL,
                updated_at VARCHAR,
                FOREIGN KEY(username) REFERENCES users(username) ON DELETE CASCADE,
                FOREIGN KEY(model_version_id) REFERENCES equipment_model_versions(id),
                FOREIGN KEY(variant_id) REFERENCES equipment_model_variants(id)
            )
        """,
    },
    "equipment_item_events": {
        "columns": "id, equipment_item_id, event_type, event_date, price, currency, location, counterparty, notes, created_at",
        "foreign_keys": {("equipment_item_id", "equipment_items", "id", "CASCADE")},
        "create_sql": """
            CREATE TABLE {table} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                equipment_item_id INTEGER NOT NULL,
                event_type VARCHAR NOT NULL,
                event_date VARCHAR,
                price FLOAT,
                currency VARCHAR,
                location TEXT,
                counterparty TEXT,
                notes TEXT,
                created_at VARCHAR NOT NULL,
                FOREIGN KEY(equipment_item_id) REFERENCES equipment_items(id) ON DELETE CASCADE
            )
        """,
    },
    "climbing_crags": {
        "columns": "id, area_id, name, latitude, longitude, approach_notes, description, created_at, updated_at",
        "foreign_keys": {("area_id", "climbing_areas", "id", "CASCADE")},
        "create_sql": """
            CREATE TABLE {table} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                area_id INTEGER NOT NULL,
                name VARCHAR NOT NULL,
                latitude FLOAT,
                longitude FLOAT,
                approach_notes TEXT,
                description TEXT,
                created_at VARCHAR NOT NULL,
                updated_at VARCHAR NOT NULL,
                FOREIGN KEY(area_id) REFERENCES climbing_areas(id) ON DELETE CASCADE
            )
        """,
    },
    "climbing_sectors": {
        "columns": "id, crag_id, name, aspect, approach_minutes, description, safety_note, created_at, updated_at",
        "foreign_keys": {("crag_id", "climbing_crags", "id", "CASCADE")},
        "create_sql": """
            CREATE TABLE {table} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                crag_id INTEGER NOT NULL,
                name VARCHAR NOT NULL,
                aspect VARCHAR,
                approach_minutes INTEGER,
                description TEXT,
                safety_note TEXT,
                created_at VARCHAR NOT NULL,
                updated_at VARCHAR NOT NULL,
                FOREIGN KEY(crag_id) REFERENCES climbing_crags(id) ON DELETE CASCADE
            )
        """,
    },
    "climbing_topo_images": {
        "columns": "id, sector_id, title, image_url, width, height, source, attribution, created_at, updated_at",
        "foreign_keys": {("sector_id", "climbing_sectors", "id", "CASCADE")},
        "create_sql": """
            CREATE TABLE {table} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sector_id INTEGER NOT NULL,
                title VARCHAR NOT NULL,
                image_url TEXT NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                source TEXT,
                attribution TEXT,
                created_at VARCHAR NOT NULL,
                updated_at VARCHAR NOT NULL,
                FOREIGN KEY(sector_id) REFERENCES climbing_sectors(id) ON DELETE CASCADE
            )
        """,
    },
    "climbing_routes": {
        "columns": "id, sector_id, topo_image_id, name, grade, length_m, pitches, style, description, notes, danger_flag, color, polyline_json, created_at, updated_at",
        "foreign_keys": {
            ("sector_id", "climbing_sectors", "id", "CASCADE"),
            ("topo_image_id", "climbing_topo_images", "id", "CASCADE"),
        },
        "create_sql": """
            CREATE TABLE {table} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                sector_id INTEGER NOT NULL,
                topo_image_id INTEGER NOT NULL,
                name VARCHAR NOT NULL,
                grade VARCHAR,
                length_m FLOAT,
                pitches INTEGER,
                style VARCHAR,
                description TEXT,
                notes TEXT,
                danger_flag BOOLEAN NOT NULL,
                color VARCHAR,
                polyline_json TEXT NOT NULL,
                created_at VARCHAR NOT NULL,
                updated_at VARCHAR NOT NULL,
                FOREIGN KEY(sector_id) REFERENCES climbing_sectors(id) ON DELETE CASCADE,
                FOREIGN KEY(topo_image_id) REFERENCES climbing_topo_images(id) ON DELETE CASCADE
            )
        """,
    },
    "climbing_calibration_sessions": {
        "columns": "id, username, sector_id, topo_image_id, name, transform_type, transform_json, opacity, route_visibility_json, is_active, created_at, updated_at",
        "foreign_keys": {
            ("username", "users", "username", "CASCADE"),
            ("sector_id", "climbing_sectors", "id", "CASCADE"),
            ("topo_image_id", "climbing_topo_images", "id", "CASCADE"),
        },
        "create_sql": """
            CREATE TABLE {table} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username VARCHAR NOT NULL,
                sector_id INTEGER NOT NULL,
                topo_image_id INTEGER NOT NULL,
                name VARCHAR,
                transform_type VARCHAR NOT NULL,
                transform_json TEXT NOT NULL,
                opacity FLOAT NOT NULL,
                route_visibility_json TEXT,
                is_active BOOLEAN NOT NULL,
                created_at VARCHAR NOT NULL,
                updated_at VARCHAR NOT NULL,
                FOREIGN KEY(username) REFERENCES users(username) ON DELETE CASCADE,
                FOREIGN KEY(sector_id) REFERENCES climbing_sectors(id) ON DELETE CASCADE,
                FOREIGN KEY(topo_image_id) REFERENCES climbing_topo_images(id) ON DELETE CASCADE
            )
        """,
    },
    "climbing_calibration_points": {
        "columns": "id, calibration_session_id, order_index, label, topo_x, topo_y, camera_x, camera_y",
        "foreign_keys": {("calibration_session_id", "climbing_calibration_sessions", "id", "CASCADE")},
        "create_sql": """
            CREATE TABLE {table} (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                calibration_session_id INTEGER NOT NULL,
                order_index INTEGER NOT NULL,
                label VARCHAR,
                topo_x FLOAT NOT NULL,
                topo_y FLOAT NOT NULL,
                camera_x FLOAT NOT NULL,
                camera_y FLOAT NOT NULL,
                FOREIGN KEY(calibration_session_id) REFERENCES climbing_calibration_sessions(id) ON DELETE CASCADE
            )
        """,
    },
}

def sqlite_table_exists(cursor, table_name: str) -> bool:
    return cursor.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    ).fetchone() is not None

def sqlite_foreign_key_signature(cursor, table_name: str) -> set[tuple[str, str, str, str]]:
    return {
        (row[3], row[2], row[4], row[6])
        for row in cursor.execute(f"PRAGMA foreign_key_list({table_name})").fetchall()
    }

def sqlite_orphan_count(cursor, child_table: str, child_column: str, parent_table: str, parent_column: str) -> int:
    return cursor.execute(
        f"""
        SELECT COUNT(*)
        FROM {child_table} AS child
        LEFT JOIN {parent_table} AS parent ON child.{child_column} = parent.{parent_column}
        WHERE child.{child_column} IS NOT NULL AND parent.{parent_column} IS NULL
        """
    ).fetchone()[0]

def migrate_sqlite_foreign_keys():
    if engine.dialect.name != "sqlite":
        return

    dbapi_connection = engine.raw_connection()
    cursor = dbapi_connection.cursor()
    try:
        tables_to_rebuild = []
        for table_name, spec in SQLITE_FOREIGN_KEY_TABLES.items():
            if not sqlite_table_exists(cursor, table_name):
                continue
            for child_column, parent_table, parent_column, _ in spec["foreign_keys"]:
                if not sqlite_table_exists(cursor, parent_table):
                    continue
                orphan_count = sqlite_orphan_count(cursor, table_name, child_column, parent_table, parent_column)
                if orphan_count:
                    raise RuntimeError(
                        f"Cannot add foreign key {table_name}.{child_column} -> "
                        f"{parent_table}.{parent_column}: {orphan_count} orphaned row(s)"
                    )
            if not spec["foreign_keys"].issubset(sqlite_foreign_key_signature(cursor, table_name)):
                tables_to_rebuild.append(table_name)

        if not tables_to_rebuild:
            cursor.execute("PRAGMA foreign_keys=ON")
            problems = cursor.execute("PRAGMA foreign_key_check").fetchall()
            if problems:
                raise RuntimeError(f"SQLite foreign key check failed: {problems}")
            return

        cursor.execute("PRAGMA foreign_keys=OFF")
        cursor.execute("BEGIN")
        for table_name in tables_to_rebuild:
            spec = SQLITE_FOREIGN_KEY_TABLES[table_name]
            new_table = f"{table_name}__with_fks"
            cursor.execute(f"DROP TABLE IF EXISTS {new_table}")
            cursor.execute(spec["create_sql"].format(table=new_table))
            cursor.execute(
                f"INSERT INTO {new_table} ({spec['columns']}) "
                f"SELECT {spec['columns']} FROM {table_name}"
            )
            cursor.execute(f"DROP TABLE {table_name}")
            cursor.execute(f"ALTER TABLE {new_table} RENAME TO {table_name}")
        dbapi_connection.commit()

        cursor.execute("PRAGMA foreign_keys=ON")
        problems = cursor.execute("PRAGMA foreign_key_check").fetchall()
        if problems:
            raise RuntimeError(f"SQLite foreign key check failed: {problems}")
    except Exception:
        dbapi_connection.rollback()
        raise
    finally:
        cursor.close()
        dbapi_connection.close()

ensure_columns()
migrate_sqlite_foreign_keys()

DEFAULT_COUNTRIES = [
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

def seed_countries():
    db = SessionLocal()
    try:
        existing = {row.iso_code: row for row in db.query(CountryModel).all()}
        changed = False
        for iso_code, name_fr, name_en in DEFAULT_COUNTRIES:
            row = existing.get(iso_code)
            if row:
                if row.name_fr != name_fr or row.name_en != name_en or not row.is_active:
                    row.name_fr = name_fr
                    row.name_en = name_en
                    row.is_active = True
                    changed = True
            else:
                db.add(CountryModel(iso_code=iso_code, name_fr=name_fr, name_en=name_en, is_active=True))
                changed = True
        if changed:
            db.commit()
    finally:
        db.close()

seed_countries()

BASE_CONFIG = {
    "start_date": "2026-04-07",
    "start_load": 10,
    "increment": 5,
    "weight": 75,
    "shoe_size": 42,
    "increment_every_days": 2,
    "sport_after_days": 30,
}
TARGET_END_DATE = os.getenv("REHAB_TARGET_END_DATE", "2026-05-13")

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
    "activities": [],
    "draft_active_activity_index": 0,
    "draft_performed_editor": {},
    "draft_planned_editor": {},
    "draft_selected_strength_category": "",
    "draft_planned_section_expanded": False,
    "draft_updated_at": "",
}

DEFAULT_ACTIVITY = {
    "exercises": [],
    "note": "",
    "status": "todo",
    "load": 0,
    "physio_time": "",
    "title": "",
    "activity_type": "",
    "activity_details": "",
    "image": "",
    "climbing_routes": [],
    "performed_items": [],
    "used_equipment": [],
    "source_files": [],
    "metric_source_preferences": {},
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

def normalize_text_key(value: str) -> str:
    normalized = unicodedata.normalize("NFD", str(value or "").strip().lower())
    without_accents = "".join(ch for ch in normalized if unicodedata.category(ch) != "Mn")
    return re.sub(r"[^a-z0-9]+", " ", without_accents).strip()

def backfill_brand_normalized_names():
    db = SessionLocal()
    try:
        changed = False
        for row in db.query(EquipmentBrandModel).all():
            if not row.normalized_name:
                row.normalized_name = normalize_text_key(row.name)
                changed = True
        if changed:
            db.commit()
    finally:
        db.close()

backfill_brand_normalized_names()

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
        "outdoor_climbing",
        "musculation",
        "yoga",
        "pilates",
    }
    normalized = str(value or "").strip().lower()
    return normalized if normalized in allowed else ""

ACTIVITY_LABELS = {
    "course_a_pied": {"fr": "Course", "en": "Running"},
    "velo": {"fr": "Vélo", "en": "Cycling"},
    "vtt": {"fr": "VTT", "en": "MTB"},
    "hockey": {"fr": "Hockey", "en": "Hockey"},
    "escalade": {"fr": "Escalade", "en": "Climbing"},
    "outdoor_climbing": {"fr": "Escalade outdoor", "en": "Outdoor Climbing"},
    "musculation": {"fr": "Musculation", "en": "Strength"},
    "yoga": {"fr": "Yoga", "en": "Yoga"},
    "pilates": {"fr": "Pilates", "en": "Pilates"},
}

class NormalizedCoordinate(BaseModel):
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)

class CalibrationPointPayload(BaseModel):
    label: str = ""
    topo: NormalizedCoordinate
    camera: NormalizedCoordinate

class CalibrationSessionPayload(BaseModel):
    topo_image_id: int
    name: str = ""
    transform_type: str = "affine"
    transform: dict = Field(default_factory=dict)
    points: list[CalibrationPointPayload] = Field(default_factory=list)
    opacity: float = Field(default=0.75, ge=0, le=1)
    route_visibility: dict[str, bool] = Field(default_factory=dict)
    is_active: bool = True

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

ACTIVITY_SOURCE_METRICS = {
    "heart_rate": ("avg_hr", "max_hr"),
    "power": ("avg_power", "max_power"),
    "cadence": ("avg_cadence",),
    "distance": ("distance_km",),
    "duration": ("duration_seconds",),
    "calories": ("calories",),
}


def normalize_activity_source_metrics(metrics: dict) -> dict:
    if not isinstance(metrics, dict):
        return {}
    normalized = {}
    for metric_name, values in metrics.items():
        if metric_name not in ACTIVITY_SOURCE_METRICS or not isinstance(values, dict):
            continue
        cleaned_values = {}
        for key, value in values.items():
            numeric = normalize_optional_float(value)
            if numeric is not None:
                cleaned_values[str(key)] = numeric
        if cleaned_values:
            normalized[metric_name] = cleaned_values
    return normalized


def build_activity_source_metrics(parsed_activity: dict) -> dict:
    metrics = {}
    if parsed_activity.get("avg_hr") is not None or parsed_activity.get("max_hr") is not None:
        metrics["heart_rate"] = {
            key: value
            for key, value in {
                "avg": normalize_optional_float(parsed_activity.get("avg_hr")),
                "max": normalize_optional_float(parsed_activity.get("max_hr")),
            }.items()
            if value is not None
        }
    if parsed_activity.get("avg_power") is not None or parsed_activity.get("max_power") is not None:
        metrics["power"] = {
            key: value
            for key, value in {
                "avg": normalize_optional_float(parsed_activity.get("avg_power")),
                "max": normalize_optional_float(parsed_activity.get("max_power")),
            }.items()
            if value is not None
        }
    if parsed_activity.get("avg_cadence") is not None:
        metrics["cadence"] = {"avg": normalize_optional_float(parsed_activity.get("avg_cadence"))}
    if parsed_activity.get("distance_km") is not None:
        metrics["distance"] = {"km": normalize_optional_float(parsed_activity.get("distance_km"))}
    if parsed_activity.get("duration_seconds") is not None:
        metrics["duration"] = {"seconds": normalize_optional_float(parsed_activity.get("duration_seconds"))}
    if parsed_activity.get("calories") is not None:
        metrics["calories"] = {"value": normalize_optional_float(parsed_activity.get("calories"))}
    return normalize_activity_source_metrics(metrics)


def normalize_activity_source_file(item: dict) -> dict:
    if not isinstance(item, dict):
        return {}
    source_id = str(item.get("id", "") or "").strip()
    if not source_id:
        source_id = uuid.uuid4().hex
    parsed = item.get("parsed") if isinstance(item.get("parsed"), dict) else {}
    metrics = normalize_activity_source_metrics(item.get("metrics") if isinstance(item.get("metrics"), dict) else {})
    if not metrics and parsed:
        metrics = build_activity_source_metrics(parsed)
    normalized = {
        "id": source_id,
        "provider": str(item.get("provider", "") or "").strip(),
        "label": str(item.get("label", "") or "").strip(),
        "filename": str(item.get("filename", "") or "").strip(),
        "file_format": str(item.get("file_format", "") or "").strip().lower(),
        "file_url": str(item.get("file_url", "") or "").strip(),
        "imported_at": str(item.get("imported_at", "") or "").strip(),
        "parsed": parsed,
        "metrics": metrics,
    }
    return {key: value for key, value in normalized.items() if value not in ("", None, {}, [])}


def normalize_activity_source_files(items) -> list[dict]:
    if not isinstance(items, list):
        return []
    normalized = []
    seen_ids = set()
    for item in items:
        source = normalize_activity_source_file(item)
        source_id = source.get("id")
        if not source_id or source_id in seen_ids:
            continue
        normalized.append(source)
        seen_ids.add(source_id)
    return normalized


def normalize_metric_source_preferences(preferences: dict, source_files: list[dict]) -> dict:
    if not isinstance(preferences, dict):
        preferences = {}
    source_by_id = {str(item.get("id", "")): item for item in source_files if item.get("id")}
    normalized = {}
    for metric_name in ACTIVITY_SOURCE_METRICS:
        selected_id = str(preferences.get(metric_name, "") or "").strip()
        if selected_id and selected_id in source_by_id and metric_name in source_by_id[selected_id].get("metrics", {}):
            normalized[metric_name] = selected_id
            continue
        for source in source_files:
            if metric_name in source.get("metrics", {}):
                normalized[metric_name] = source["id"]
                break
    return normalized


def activity_has_content(payload: dict) -> bool:
    return bool(
        payload.get("performed_items")
        or str(payload.get("title", "") or "").strip()
        or str(payload.get("activity_type", "") or "").strip()
        or str(payload.get("activity_details", "") or "").strip()
        or str(payload.get("image", "") or "").strip()
        or payload.get("source_files")
        or payload.get("climbing_routes")
        or float(payload.get("load", 0) or 0) > 0
        or str(payload.get("physio_time", "") or "").strip()
        or str(payload.get("note", "") or "").strip()
    )

def get_session_activities(payload: dict) -> list[dict]:
    activities = payload.get("activities", [])
    return activities if isinstance(activities, list) else []

def get_primary_activity(payload: dict) -> dict:
    activities = get_session_activities(payload)
    if activities:
        for activity in activities:
            if activity_has_content(activity):
                return activity
        return activities[0]
    return {}

def normalize_activity_entry(payload: dict) -> dict:
    base = dict(DEFAULT_ACTIVITY)
    if payload:
        base.update(payload)

    performed_items = [
        normalized_item
        for item in base.get("performed_items", [])
        if (normalized_item := normalize_performed_item(item))
    ]
    exercise_names = [str(name).strip() for name in base.get("exercises", []) if str(name).strip()]
    if performed_items:
        exercise_names = unique_names(
            [item.get("exercise_name", "") for item in performed_items if item.get("exercise_name")] + exercise_names
        )
    source_files = normalize_activity_source_files(base.get("source_files", []))
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
        "title": str(base.get("title", "") or "").strip(),
        "activity_type": normalized_activity_type,
        "activity_details": str(base.get("activity_details", "") or "").strip(),
        "image": str(base.get("image", "") or "").strip(),
        "climbing_routes": [
            normalized_route
            for item in base.get("climbing_routes", [])
            if (normalized_route := normalize_climbing_route(item))
        ],
        "performed_items": performed_items,
        "used_equipment": [
            normalized_item
            for item in base.get("used_equipment", [])
            if (normalized_item := normalize_used_equipment_item(item))
        ],
        "source_files": source_files,
        "metric_source_preferences": normalize_metric_source_preferences(
            base.get("metric_source_preferences", {}),
            source_files,
        ),
    }
    normalized["status"] = "done" if activity_has_content(normalized) else "todo"
    if normalized["activity_type"] not in {"escalade", "outdoor_climbing"}:
        normalized["climbing_routes"] = []
    if normalized["activity_type"] != "musculation":
        normalized["performed_items"] = []
        normalized["exercises"] = []
    return normalized

def derive_legacy_activities(payload: dict) -> list[dict]:
    legacy_activity = normalize_activity_entry(payload)
    return [legacy_activity] if activity_has_content(legacy_activity) else []

def get_payload_display_exercises(payload: dict) -> list[str]:
    primary_payload = get_primary_activity(payload) or payload
    performed_items = primary_payload.get("performed_items", []) or []
    if performed_items:
        return unique_names(
            [item.get("custom_name", "") or item.get("exercise_name", "") for item in performed_items]
        )

    if primary_payload.get("exercises"):
        return unique_names(primary_payload.get("exercises", []))

    return unique_names(
        [
            item.get("custom_name", "") or item.get("exercise_name", "")
            for item in primary_payload.get("planned_items", payload.get("planned_items", []))
            if item.get("custom_name") or item.get("exercise_name")
        ]
    )

def get_calendar_display_exercises(payload: dict) -> list[str]:
    activities = get_session_activities(payload)
    if activities:
        return unique_names(
            [
                item.get("custom_name", "") or item.get("exercise_name", "")
                for activity in activities
                for item in activity.get("performed_items", [])
                if item.get("custom_name") or item.get("exercise_name")
            ]
        )

    if str(payload.get("status", "todo") or "todo") == "done":
        return get_payload_display_exercises(payload)

    return unique_names(
        [
            item.get("custom_name", "") or item.get("exercise_name", "")
            for item in payload.get("planned_items", [])
            if item.get("custom_name") or item.get("exercise_name")
        ]
    )


def build_calendar_activity_entries(payload: dict) -> list[dict]:
    activities = [normalize_activity_entry(item) for item in get_session_activities(payload)]
    if activities:
        return [activity for activity in activities if activity_has_content(activity)]

    legacy_activity = normalize_activity_entry({
        "title": payload.get("title", ""),
        "activity_type": payload.get("activity_type", ""),
        "activity_details": payload.get("activity_details", ""),
        "image": payload.get("image", ""),
        "climbing_routes": payload.get("climbing_routes", []),
        "performed_items": payload.get("performed_items", []),
        "used_equipment": payload.get("used_equipment", []),
        "load": payload.get("load", 0),
        "physio_time": payload.get("physio_time", ""),
        "note": payload.get("note", ""),
    })
    return [legacy_activity] if activity_has_content(legacy_activity) else []


def get_calendar_activity_summary(activity: dict) -> str:
    title = str(activity.get("title", "") or "").strip()
    activity_type = str(activity.get("activity_type", "") or "").strip()
    details = str(activity.get("activity_details", "") or "").strip()
    type_label = ACTIVITY_LABELS.get(activity_type, {}).get("fr", "") if activity_type else ""
    performed_count = len(activity.get("performed_items", []) or [])
    climbing_count = len(activity.get("climbing_routes", []) or [])
    if title:
        return title
    if details and not type_label:
        return details
    if type_label and details:
        return f"{type_label} | {details}"
    if type_label:
        if performed_count:
            return f"{type_label} | {performed_count} ex."
        if climbing_count:
            return f"{type_label} | {climbing_count} voie(s)"
        return type_label
    if performed_count:
        return f"{performed_count} ex."
    if climbing_count:
        return f"{climbing_count} voie(s)"
    return ""


def get_calendar_activity_entry_summaries(payload: dict) -> list[dict]:
    entries = []
    for activity in build_calendar_activity_entries(payload):
        activity_type = str(activity.get("activity_type", "") or "").strip()
        summary = get_calendar_activity_summary(activity)
        entries.append({
            "activity_type": activity_type,
            "summary": summary,
            "title": str(activity.get("title", "") or "").strip(),
            "details": str(activity.get("activity_details", "") or "").strip(),
        })
    return entries


def get_calendar_activity_summaries(payload: dict) -> list[str]:
    return unique_names(
        [
            entry.get("summary", "")
            for entry in get_calendar_activity_entry_summaries(payload)
            if entry.get("summary")
        ]
    )


def get_calendar_activity_types(payload: dict) -> list[str]:
    return unique_names(
        [
            str(activity.get("activity_type", "") or "").strip()
            for activity in build_calendar_activity_entries(payload)
            if str(activity.get("activity_type", "") or "").strip()
        ]
    )

def compute_session_status(payload: dict) -> str:
    activities = get_session_activities(payload)
    if activities and any(activity_has_content(activity) for activity in activities):
        return "done"
    has_actual_content = bool(
        payload.get("performed_items")
        or str(payload.get("title", "") or "").strip()
        or str(payload.get("activity_type", "") or "").strip()
        or str(payload.get("activity_details", "") or "").strip()
        or str(payload.get("image", "") or "").strip()
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

    normalized_activities = [
        normalized_activity
        for item in base.get("activities", [])
        if (normalized_activity := normalize_activity_entry(item))
    ]
    if not normalized_activities:
        normalized_activities = derive_legacy_activities(base)
    active_activity_index = normalize_optional_int(base.get("draft_active_activity_index"))
    if normalized_activities:
        if active_activity_index is None:
            active_activity_index = 0
        active_activity_index = max(0, min(active_activity_index, len(normalized_activities) - 1))
        primary_activity = normalized_activities[active_activity_index]
        mirrored_activity = primary_activity
        if not activity_has_content(mirrored_activity) and not str(base.get("draft_updated_at", "") or "").strip():
            mirrored_activity = get_primary_activity({"activities": normalized_activities}) or mirrored_activity
    else:
        active_activity_index = 0
        primary_activity = dict(DEFAULT_ACTIVITY)
        mirrored_activity = primary_activity

    planned_items = [
        normalized_item
        for item in base.get("planned_items", [])
        if (normalized_item := normalize_planned_item(item))
    ]

    normalized = {
        "exercises": mirrored_activity.get("exercises", []),
        "note": mirrored_activity.get("note", ""),
        "status": "todo",
        "load": float(mirrored_activity.get("load", 0) or 0),
        "physio_time": mirrored_activity.get("physio_time", ""),
        "title": mirrored_activity.get("title", ""),
        "activity_type": mirrored_activity.get("activity_type", ""),
        "activity_details": mirrored_activity.get("activity_details", ""),
        "image": mirrored_activity.get("image", ""),
        "climbing_routes": mirrored_activity.get("climbing_routes", []),
        "performed_items": mirrored_activity.get("performed_items", []),
        "plan_activity_type": normalize_activity_type(base.get("plan_activity_type", "")),
        "plan_time": normalize_physio_time(base.get("plan_time", "")),
        "plan_title": str(base.get("plan_title", "") or ""),
        "duration_target_min": normalize_optional_int(base.get("duration_target_min")),
        "location": str(base.get("location", "") or ""),
        "plan_notes": str(base.get("plan_notes", "") or ""),
        "planned_items": planned_items,
        "used_equipment": mirrored_activity.get("used_equipment", []),
        "activities": normalized_activities,
        "draft_active_activity_index": active_activity_index,
        "draft_performed_editor": normalize_performed_editor_draft(base.get("draft_performed_editor", {})),
        "draft_planned_editor": normalize_planned_editor_draft(base.get("draft_planned_editor", {})),
        "draft_selected_strength_category": str(base.get("draft_selected_strength_category", "") or "").strip().lower(),
        "draft_planned_section_expanded": bool(base.get("draft_planned_section_expanded", False)),
        "draft_updated_at": str(base.get("draft_updated_at", "") or "").strip(),
    }
    normalized["status"] = compute_session_status(normalized)
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
    name = str(payload.get("name", "") or "").strip()
    updated_at_raw = str(payload.get("updated_at", "") or "").strip()
    updated_at = ""
    if updated_at_raw:
        try:
            updated_at = date.fromisoformat(updated_at_raw).isoformat()
        except ValueError as exc:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid brand update date") from exc
    year_established = normalize_optional_int(payload.get("year_established"))
    if year_established is not None and not (1500 <= year_established <= date.today().year):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid establishment year")
    return {
        "name": name,
        "normalized_name": normalize_text_key(payload.get("normalized_name") or name),
        "country_id": normalize_optional_int(payload.get("country_id")),
        "year_established": year_established,
        "website_url": str(payload.get("website_url", "") or "").strip(),
        "description": str(payload.get("description", "") or "").strip(),
        "logo_url": str(payload.get("logo_url", "") or "").strip(),
        "is_active": bool(payload.get("is_active", True)),
        "created_at": created_at or date.today().isoformat(),
        "updated_at": updated_at or date.today().isoformat(),
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
        "normalized_name": normalize_text_key(payload.get("normalized_name") or payload.get("name")),
        "category_id": normalize_optional_int(payload.get("category_id")),
        "description": str(payload.get("description", "") or "").strip(),
        "is_active": bool(payload.get("is_active", True)),
        "created_at": created_at or date.today().isoformat(),
        "updated_at": date.today().isoformat(),
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
        "model_version_id": normalize_optional_int(payload.get("model_version_id") or payload.get("equipment_id")),
        "variant_id": normalize_optional_int(payload.get("variant_id")),
        "purchase_date": purchase_date,
        "purchase_price": normalize_optional_float(payload.get("purchase_price")),
        "purchase_currency": str(payload.get("purchase_currency", "") or "").strip().upper()[:3],
        "purchase_location": str(payload.get("purchase_location", "") or "").strip(),
        "purchase_shop_url": str(payload.get("purchase_shop_url", "") or "").strip(),
        "purchase_condition": str(payload.get("purchase_condition", "") or "").strip(),
        "serial_number": str(payload.get("serial_number", "") or "").strip(),
        "nickname": str(payload.get("nickname", "") or "").strip(),
        "status": str(payload.get("status", "owned") or "owned").strip(),
        "notes": str(payload.get("notes", payload.get("note", "")) or "").strip(),
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
        sync_exercise_taxonomy(db, exists)
    else:
        row = ExerciseModel(**record)
        db.add(row)
        db.flush()
        sync_exercise_taxonomy(db, row)
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


def ensure_exercise_category(db, category_name: str) -> None:
    cleaned = str(category_name or "").strip()
    if not cleaned:
        return
    if not db.query(ExerciseCategoryModel).filter_by(name=cleaned).first():
        db.add(
            ExerciseCategoryModel(
                name=cleaned,
                display_name_fr=cleaned,
                display_name_en=cleaned,
            )
        )


def ensure_exercise_movement_family(db, family_name: str) -> None:
    cleaned = str(family_name or "").strip()
    if not cleaned:
        return
    if not db.query(ExerciseMovementFamilyModel).filter_by(name=cleaned).first():
        db.add(
            ExerciseMovementFamilyModel(
                name=cleaned,
                display_name_fr=cleaned,
                display_name_en=cleaned,
            )
        )


def ensure_equipment_category(db, category_name: str) -> EquipmentCategoryModel | None:
    cleaned = str(category_name or "").strip()
    if not cleaned:
        return None
    normalized = normalize_text_key(cleaned)
    if not normalized:
        return None
    row = db.query(EquipmentCategoryModel).filter_by(normalized_name=normalized).first()
    if row:
        return row
    row = EquipmentCategoryModel(
        name=normalized,
        normalized_name=normalized,
        display_name_fr=cleaned,
        display_name_en=cleaned,
        is_active=True,
        created_at=date.today().isoformat(),
        updated_at=date.today().isoformat(),
    )
    db.add(row)
    db.flush()
    return row


def clear_exercise_taxonomy(db, exercise_name: str) -> None:
    cleaned = str(exercise_name or "").strip()
    if not cleaned:
        return
    db.query(ExerciseCategoryLinkModel).filter_by(exercise_name=cleaned).delete()
    db.query(ExerciseMovementFamilyLinkModel).filter_by(exercise_name=cleaned).delete()


def sync_exercise_taxonomy(db, row: ExerciseModel) -> None:
    if not row or not row.name:
        return
    clear_exercise_taxonomy(db, row.name)
    for category_name in split_exercise_categories(row.category or ""):
        ensure_exercise_category(db, category_name)
        db.flush()
        db.add(ExerciseCategoryLinkModel(exercise_name=row.name, category_name=category_name))
    family_name = str(row.movement_family or "").strip()
    if family_name:
        ensure_exercise_movement_family(db, family_name)
        db.flush()
        db.add(ExerciseMovementFamilyLinkModel(exercise_name=row.name, family_name=family_name))


def get_normalized_exercise_categories(db, exercise_name: str) -> list[str]:
    return [
        row.category_name
        for row in db.query(ExerciseCategoryLinkModel)
        .filter_by(exercise_name=exercise_name)
        .order_by(ExerciseCategoryLinkModel.category_name)
        .all()
    ]


def get_normalized_exercise_family(db, exercise_name: str) -> str:
    row = db.query(ExerciseMovementFamilyLinkModel).filter_by(exercise_name=exercise_name).first()
    return row.family_name if row else ""


def serialize_exercise(row: ExerciseModel) -> dict:
    db = object_session(row)
    normalized_categories = get_normalized_exercise_categories(db, row.name) if db else []
    normalized_family = get_normalized_exercise_family(db, row.name) if db else ""
    return {
        "name": row.name,
        "display_name": row.display_name or row.name.replace("_", " "),
        "display_name_fr": row.display_name_fr or row.display_name or row.name.replace("_", " "),
        "display_name_en": row.display_name_en or row.display_name or row.name.replace("_", " "),
        "category": ", ".join(normalized_categories) if normalized_categories else row.category or "",
        "categories": normalized_categories or split_exercise_categories(row.category or ""),
        "movement_family": normalized_family or row.movement_family or "",
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


def sanitize_activity_source_suffix(filename: str, selected_format: str = "") -> str:
    detected_format = detect_activity_file_format(filename, selected_format)
    if detected_format in {"fit", "tcx", "gpx"}:
        return f".{detected_format}"
    return ""


def save_upload_file_with_limit(source_file, target_path: Path, max_bytes: int) -> int:
    written = 0
    try:
        with target_path.open("wb") as output:
            while chunk := source_file.read(1024 * 1024):
                written += len(chunk)
                if written > max_bytes:
                    raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="Uploaded file is too large")
                output.write(chunk)
    except Exception:
        target_path.unlink(missing_ok=True)
        raise
    return written


def resolve_uploaded_exercise_path(image_url: str) -> Path | None:
    prefix = "/api/uploads/exercises/"
    value = str(image_url or "").strip()
    if not value.startswith(prefix):
        return None
    filename = Path(value.removeprefix(prefix)).name
    if not filename:
        return None
    return EXERCISE_UPLOADS_DIR / filename


def resolve_uploaded_activity_path(image_url: str) -> Path | None:
    prefix = "/api/uploads/activities/"
    value = str(image_url or "").strip()
    if not value.startswith(prefix):
        return None
    filename = Path(value.removeprefix(prefix)).name
    if not filename:
        return None
    return ACTIVITY_UPLOADS_DIR / filename


def build_activity_source_file_record(
    *,
    source_id: str,
    provider: str,
    label: str,
    filename: str,
    file_format: str,
    file_url: str,
    parsed_activity: dict,
) -> dict:
    return normalize_activity_source_file({
        "id": source_id,
        "provider": str(provider or "").strip() or "Other",
        "label": str(label or "").strip() or str(provider or "").strip() or parsed_activity.get("source_label", ""),
        "filename": str(filename or "").strip(),
        "file_format": str(file_format or "").strip().lower(),
        "file_url": file_url,
        "imported_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z"),
        "parsed": parsed_activity,
        "metrics": build_activity_source_metrics(parsed_activity),
    })


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

        for activity in payload.get("activities", []) or []:
            activity_exercises = []
            for exercise_name in activity.get("exercises", []) or []:
                normalized_name = new_value if str(exercise_name or "").strip() == old_value else exercise_name
                activity_exercises.append(normalized_name)
                if normalized_name != exercise_name:
                    changed = True
            activity["exercises"] = activity_exercises

            for item in activity.get("performed_items", []) or []:
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

def serialize_country(row: CountryModel, language: str = "fr") -> dict:
    country_name = row.name_en if normalize_language(language) == "en" else row.name_fr
    return {
        "id": row.id,
        "iso_code": row.iso_code,
        "name": country_name,
        "name_fr": row.name_fr,
        "name_en": row.name_en,
        "is_active": bool(row.is_active),
    }

def serialize_brand(row: EquipmentBrandModel, country: CountryModel | None = None, language: str = "fr") -> dict:
    country_name = ""
    if country:
        country_name = country.name_en if normalize_language(language) == "en" else country.name_fr
    return {
        "id": row.id,
        "name": row.name,
        "normalized_name": row.normalized_name or "",
        "country_id": row.country_id,
        "country_name": country_name,
        "country_iso_code": country.iso_code if country else "",
        "year_established": row.year_established,
        "website_url": row.website_url or "",
        "description": row.description or "",
        "logo_url": row.logo_url or "",
        "is_active": bool(row.is_active),
        "created_at": row.created_at,
        "updated_at": row.updated_at or "",
        "history": row.history or "",
    }


def is_local_brand_logo(value: str) -> bool:
    return str(value or "").strip().startswith("/api/uploads/equipment-brands/")


def is_http_url(value: str) -> bool:
    cleaned = str(value or "").strip().lower()
    return cleaned.startswith("https://") or cleaned.startswith("http://")


def brand_logo_slug(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "_", str(value or "").lower()).strip("_")
    return slug or "brand"


def brand_domain_from_url(value: str) -> str:
    parsed = urlparse(value if "://" in str(value or "") else f"https://{value}")
    return parsed.netloc.removeprefix("www.").strip().lower()


def brand_logo_extension(url: str, content_type: str) -> str:
    normalized_content_type = str(content_type or "").split(";", 1)[0].strip().lower()
    if normalized_content_type == "image/svg+xml":
        return ".svg"
    guessed = mimetypes.guess_extension(normalized_content_type)
    if guessed in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}:
        return ".jpg" if guessed == ".jpeg" else guessed
    suffix = Path(urlparse(url).path).suffix.lower()
    if suffix in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}:
        return ".jpg" if suffix == ".jpeg" else suffix
    return ".png"


def download_brand_logo(url: str) -> tuple[bytes, str] | None:
    request = Request(url, headers={"User-Agent": "RehabTracker/1.0"})
    with urlopen(request, timeout=8) as response:
        content_type = response.headers.get("Content-Type", "")
        if "image/" not in content_type:
            return None
        data = response.read(1_500_001)
        if not data or len(data) > 1_500_000:
            return None
        return data, brand_logo_extension(url, content_type)


def brand_logo_candidates(row: EquipmentBrandModel) -> list[str]:
    candidates: list[str] = []
    logo_url = str(row.logo_url or "").strip()
    website_url = str(row.website_url or "").strip()
    if is_http_url(logo_url):
        candidates.append(logo_url)
    if website_url:
        domain = brand_domain_from_url(website_url)
        if domain:
            candidates.append(f"https://www.google.com/s2/favicons?domain={quote(domain)}&sz=256")
    return candidates


def cache_existing_brand_logos(limit: int = 100) -> None:
    db = SessionLocal()
    cached = 0
    try:
        rows = db.query(EquipmentBrandModel).order_by(EquipmentBrandModel.name).all()
        for row in rows:
            if cached >= limit:
                break
            if is_local_brand_logo(row.logo_url or ""):
                continue
            for candidate in brand_logo_candidates(row):
                try:
                    result = download_brand_logo(candidate)
                except Exception:
                    continue
                if not result:
                    continue
                data, extension = result
                filename = f"{brand_logo_slug(row.name)}_{row.id}{extension}"
                (BRAND_LOGOS_DIR / filename).write_bytes(data)
                row.logo_url = f"/api/uploads/equipment-brands/{filename}"
                row.updated_at = date.today().isoformat()
                cached += 1
                break
        if cached:
            db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()

def serialize_equipment_model(
    row: EquipmentModelRef,
    brand: EquipmentBrandModel | None = None,
    category: EquipmentCategoryModel | None = None,
) -> dict:
    return {
        "id": row.id,
        "brand_id": row.brand_id,
        "brand_name": brand.name if brand else "",
        "name": row.name,
        "normalized_name": row.normalized_name or "",
        "category_id": row.category_id,
        "category": category.display_name_en if category and category.display_name_en else (category.name if category else ""),
        "description": row.description or "",
        "is_active": row.is_active is not False,
        "created_at": row.created_at,
        "updated_at": row.updated_at or "",
        "history": row.history or "",
    }

def build_equipment_display_name(row: EquipmentModelVersionModel | None, brand: EquipmentBrandModel | None = None, model: EquipmentModelRef | None = None) -> str:
    if not row:
        return ""
    parts = [str(brand.name or "").strip() if brand else "", str(model.name or "").strip() if model else "", str(row.version_name or "").strip()]
    return " ".join(part for part in parts if part)

def serialize_equipment(
    row: EquipmentModelVersionModel,
    brand: EquipmentBrandModel | None = None,
    model: EquipmentModelRef | None = None,
    category: EquipmentCategoryModel | None = None,
) -> dict:
    category_label = ""
    if category:
        category_label = category.display_name_en or category.display_name_fr or category.name or ""
    return {
        "id": row.id,
        "name": row.version_name or (model.name if model else ""),
        "brand_id": model.brand_id if model else None,
        "brand_name": brand.name if brand else "",
        "model_id": row.model_id,
        "model_name": model.name if model else "",
        "display_name": build_equipment_display_name(row, brand, model),
        "category_id": model.category_id if model else None,
        "category": category_label,
        "description": row.description or (model.description if model else "") or "",
        "image": row.image_url or "",
        "link": row.product_url or "",
        "release_year": row.release_year,
        "season": row.season or "",
        "generation": row.generation or "",
        "technical_specs": row.technical_specs or "",
        "discontinued_year": row.discontinued_year,
        "is_active": row.is_active is not False,
    }

def serialize_user_equipment(
    row: EquipmentItemModel,
    equipment: EquipmentModelVersionModel | None,
    brand: EquipmentBrandModel | None = None,
    model: EquipmentModelRef | None = None,
    category: EquipmentCategoryModel | None = None,
) -> dict:
    equipment_name = equipment.version_name if equipment else ""
    display_name = build_equipment_display_name(equipment, brand, model) if equipment else ""
    return {
        "id": row.id,
        "username": row.username,
        "equipment_id": row.model_version_id,
        "model_version_id": row.model_version_id,
        "variant_id": row.variant_id,
        "equipment_name": equipment_name,
        "display_name": display_name or (equipment_name.replace("_", " ") if equipment_name else ""),
        "brand_id": model.brand_id if model else None,
        "brand_name": brand.name if brand else "",
        "model_id": equipment.model_id if equipment else None,
        "model_name": model.name if model else "",
        "category": (category.display_name_en or category.display_name_fr or category.name) if category else "",
        "description": equipment.description if equipment and equipment.description else (model.description if model else ""),
        "image": equipment.image_url if equipment and equipment.image_url else "",
        "link": equipment.product_url if equipment and equipment.product_url else "",
        "purchase_date": row.purchase_date,
        "purchase_price": row.purchase_price,
        "purchase_currency": row.purchase_currency or "",
        "purchase_location": row.purchase_location or "",
        "purchase_shop_url": row.purchase_shop_url or "",
        "purchase_condition": row.purchase_condition or "",
        "serial_number": row.serial_number or "",
        "nickname": row.nickname or "",
        "status": row.status or "owned",
        "note": row.notes or "",
        "notes": row.notes or "",
    }


def format_duration_hms(total_seconds) -> str:
    seconds_value = normalize_optional_int(total_seconds)
    if seconds_value is None or seconds_value < 0:
        return ""
    hours, remainder = divmod(seconds_value, 3600)
    minutes, seconds = divmod(remainder, 60)
    return f"{hours:02d}:{minutes:02d}:{seconds:02d}"


def build_fit_activity_summary(parsed: dict, source_name: str, extra_details: str = "") -> str:
    lines = []
    if parsed.get("source_label"):
        lines.append(parsed["source_label"])
    if source_name:
        lines.append(f"Fichier: {source_name}")

    metrics = []
    if parsed.get("duration"):
        metrics.append(f"Durée {parsed['duration']}")
    if parsed.get("distance_km") is not None:
        metrics.append(f"Distance {parsed['distance_km']:.2f} km")
    if parsed.get("avg_power") is not None:
        metrics.append(f"Puissance moy. {int(round(parsed['avg_power']))} W")
    if parsed.get("max_power") is not None:
        metrics.append(f"Puissance max {int(round(parsed['max_power']))} W")
    if parsed.get("avg_hr") is not None:
        metrics.append(f"FC moy. {int(round(parsed['avg_hr']))} bpm")
    if parsed.get("max_hr") is not None:
        metrics.append(f"FC max {int(round(parsed['max_hr']))} bpm")
    if parsed.get("avg_cadence") is not None:
        metrics.append(f"Cadence moy. {int(round(parsed['avg_cadence']))} rpm")
    if parsed.get("calories") is not None:
        metrics.append(f"Calories {int(round(parsed['calories']))}")

    if metrics:
        lines.append(" | ".join(metrics))
    if extra_details:
        lines.append(extra_details.strip())
    return "\n".join(part for part in lines if part).strip()


def infer_activity_type_from_fit(sport: str, sub_sport: str) -> str:
    normalized_sport = str(sport or "").strip().lower()
    normalized_sub_sport = str(sub_sport or "").strip().lower()
    if normalized_sport == "running":
        return "course_a_pied"
    if normalized_sport in {"cycling", "biking"}:
        if "mountain" in normalized_sub_sport:
            return "vtt"
        return "velo"
    return ""


def parse_activity_datetime(value: str | None) -> datetime | None:
    raw_value = str(value or "").strip()
    if not raw_value:
        return None
    if raw_value.endswith("Z"):
        raw_value = f"{raw_value[:-1]}+00:00"
    try:
        parsed = datetime.fromisoformat(raw_value)
    except ValueError:
        return None
    return parsed


def xml_local_name(tag: str) -> str:
    return str(tag or "").rsplit("}", 1)[-1].lower()


def iter_xml(root, *names: str):
    wanted = {name.lower() for name in names}
    for element in root.iter():
        if xml_local_name(element.tag) in wanted:
            yield element


def first_xml_text(root, *names: str) -> str:
    for element in iter_xml(root, *names):
        value = str(element.text or "").strip()
        if value:
            return value
    return ""


def numeric_xml_values(root, *names: str) -> list[float]:
    values: list[float] = []
    for element in iter_xml(root, *names):
        value = normalize_optional_float(element.text)
        if value is not None:
            values.append(value)
    return values


def nested_numeric_xml_values(root, parent_name: str, child_name: str = "Value") -> list[float]:
    values: list[float] = []
    for parent in iter_xml(root, parent_name):
        value = normalize_optional_float(first_xml_text(parent, child_name))
        if value is not None:
            values.append(value)
    return values


def average(values: list[float]) -> float | None:
    cleaned = [value for value in values if value is not None]
    if not cleaned:
        return None
    return sum(cleaned) / len(cleaned)


def haversine_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    radius_m = 6371000
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)
    a = math.sin(delta_phi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2) ** 2
    return radius_m * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def infer_activity_type_from_text(value: str, *, has_power: bool = False, has_cadence: bool = False) -> str:
    normalized = str(value or "").strip().lower()
    if any(token in normalized for token in ("run", "running", "course", "jog")):
        return "course_a_pied"
    if any(token in normalized for token in ("mtb", "vtt", "mountain bike")):
        return "vtt"
    if any(token in normalized for token in ("bike", "biking", "cycling", "cycle", "velo", "vélo", "mywhoosh", "zwift")):
        return "velo"
    if has_power or has_cadence:
        return "velo"
    return ""


def parse_tcx_activity_file(content: bytes, filename: str = "") -> dict:
    try:
        root = ET.fromstring(content)
    except ET.ParseError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to read this TCX file") from exc

    activity = next(iter_xml(root, "Activity"), root)
    sport = str(activity.attrib.get("Sport", "") or "")
    start_time = parse_activity_datetime(first_xml_text(activity, "Id"))
    lap_starts = [parse_activity_datetime(element.attrib.get("StartTime")) for element in iter_xml(activity, "Lap")]
    track_times = [parse_activity_datetime(str(element.text or "")) for element in iter_xml(activity, "Time")]
    timestamps = [value for value in ([start_time] + lap_starts + track_times) if isinstance(value, datetime)]
    if not start_time and timestamps:
        start_time = min(timestamps)
    if not start_time:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This TCX file does not contain a valid activity date")

    duration_values = numeric_xml_values(activity, "TotalTimeSeconds")
    duration_seconds = int(round(sum(duration_values))) if duration_values else None
    if duration_seconds is None and len(track_times) >= 2:
        valid_times = [value for value in track_times if isinstance(value, datetime)]
        if len(valid_times) >= 2:
            duration_seconds = max(0, int((max(valid_times) - min(valid_times)).total_seconds()))

    distance_values = numeric_xml_values(activity, "DistanceMeters")
    distance_m = max(distance_values) if distance_values else None
    avg_hr_values = nested_numeric_xml_values(activity, "AverageHeartRateBpm")
    max_hr_values = nested_numeric_xml_values(activity, "MaximumHeartRateBpm")
    hr_values = nested_numeric_xml_values(activity, "HeartRateBpm")
    cadence_values = numeric_xml_values(activity, "Cadence")
    avg_power_values = numeric_xml_values(activity, "AvgWatts", "Watts")
    max_power_values = numeric_xml_values(activity, "MaxWatts", "Watts")
    calories_values = numeric_xml_values(activity, "Calories")

    return {
        "date": start_time.date().isoformat(),
        "started_at": start_time.isoformat(),
        "sport": sport.strip().lower(),
        "sub_sport": "",
        "activity_type": infer_activity_type_from_text(f"{sport} {filename}", has_power=bool(avg_power_values), has_cadence=bool(cadence_values)),
        "duration_seconds": duration_seconds,
        "duration": format_duration_hms(duration_seconds),
        "distance_m": distance_m,
        "distance_km": round(distance_m / 1000, 2) if distance_m is not None else None,
        "avg_power": average(avg_power_values),
        "max_power": max(max_power_values) if max_power_values else None,
        "avg_hr": average(avg_hr_values) or average(hr_values),
        "max_hr": max(max_hr_values or hr_values) if (max_hr_values or hr_values) else None,
        "avg_cadence": average(cadence_values),
        "calories": sum(calories_values) if calories_values else None,
        "record_count": len(track_times),
        "source_label": f"Import TCX: {sport.strip() or 'activity'}",
        "source_file": str(filename or "").strip(),
    }


def parse_gpx_activity_file(content: bytes, filename: str = "") -> dict:
    try:
        root = ET.fromstring(content)
    except ET.ParseError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to read this GPX file") from exc

    name = first_xml_text(root, "name")
    points = []
    timestamps = []
    hr_values: list[float] = []
    cadence_values: list[float] = []
    power_values: list[float] = []
    for point in iter_xml(root, "trkpt"):
        lat = normalize_optional_float(point.attrib.get("lat"))
        lon = normalize_optional_float(point.attrib.get("lon"))
        if lat is not None and lon is not None:
            points.append((lat, lon))
        for time_element in iter_xml(point, "time"):
            parsed_time = parse_activity_datetime(time_element.text)
            if parsed_time:
                timestamps.append(parsed_time)
                break
        hr_values.extend(numeric_xml_values(point, "hr", "heartrate", "heartRate"))
        cadence_values.extend(numeric_xml_values(point, "cad", "cadence"))
        power_values.extend(numeric_xml_values(point, "power", "watts"))

    if not timestamps:
        metadata_time = parse_activity_datetime(first_xml_text(root, "time"))
        if metadata_time:
            timestamps.append(metadata_time)
    if not timestamps:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This GPX file does not contain a valid activity date")

    distance_m = 0.0
    for index in range(1, len(points)):
        distance_m += haversine_m(points[index - 1][0], points[index - 1][1], points[index][0], points[index][1])
    if not points:
        distance_m = None

    duration_seconds = None
    if len(timestamps) >= 2:
        duration_seconds = max(0, int((max(timestamps) - min(timestamps)).total_seconds()))

    activity_type = infer_activity_type_from_text(f"{name} {filename}", has_power=bool(power_values), has_cadence=bool(cadence_values))
    return {
        "date": min(timestamps).date().isoformat(),
        "started_at": min(timestamps).isoformat(),
        "sport": activity_type,
        "sub_sport": "",
        "activity_type": activity_type,
        "duration_seconds": duration_seconds,
        "duration": format_duration_hms(duration_seconds),
        "distance_m": distance_m,
        "distance_km": round(distance_m / 1000, 2) if distance_m is not None else None,
        "avg_power": average(power_values),
        "max_power": max(power_values) if power_values else None,
        "avg_hr": average(hr_values),
        "max_hr": max(hr_values) if hr_values else None,
        "avg_cadence": average(cadence_values),
        "calories": None,
        "record_count": len(points),
        "source_label": f"Import GPX: {name or activity_type or 'activity'}",
        "source_file": str(filename or "").strip(),
    }


def detect_activity_file_format(filename: str, selected_format: str = "") -> str:
    normalized_format = str(selected_format or "").strip().lower()
    if normalized_format in {"fit", "tcx", "gpx"}:
        return normalized_format
    suffix = Path(str(filename or "")).suffix.lower()
    if suffix in {".fit", ".tcx", ".gpx"}:
        return suffix[1:]
    return ""


def parse_activity_file(content: bytes, filename: str = "", selected_format: str = "") -> dict:
    detected_format = detect_activity_file_format(filename, selected_format)
    if detected_format == "fit":
        return parse_fit_activity_file(content, filename)
    if detected_format == "tcx":
        return parse_tcx_activity_file(content, filename)
    if detected_format == "gpx":
        return parse_gpx_activity_file(content, filename)
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please upload a FIT, TCX, or GPX activity file")


def parse_fit_activity_file(content: bytes, filename: str = "") -> dict:
    try:
        from fitparse import FitFile
    except ImportError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="FIT import is not available on the server yet.",
        ) from exc

    try:
        fit_file = FitFile(BytesIO(content))
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to read this FIT file") from exc

    session_message = None
    file_id_message = None
    first_record_timestamp = None
    last_record_timestamp = None
    last_record_distance = None
    record_count = 0

    try:
        for message in fit_file.get_messages():
            message_name = getattr(message, "name", "")
            if message_name == "file_id" and file_id_message is None:
                file_id_message = message
            elif message_name == "session" and session_message is None:
                session_message = message
            elif message_name == "record":
                record_count += 1
                timestamp = message.get_value("timestamp")
                if isinstance(timestamp, datetime):
                    if first_record_timestamp is None or timestamp < first_record_timestamp:
                        first_record_timestamp = timestamp
                    if last_record_timestamp is None or timestamp > last_record_timestamp:
                        last_record_timestamp = timestamp
                distance_value = normalize_optional_float(message.get_value("distance"))
                if distance_value is not None:
                    last_record_distance = distance_value
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Failed while parsing FIT activity data") from exc

    if session_message is None and file_id_message is None and record_count == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No usable activity data found in this FIT file")

    session_start = session_message.get_value("start_time") if session_message else None
    if not isinstance(session_start, datetime):
        session_start = first_record_timestamp
    if not isinstance(session_start, datetime):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="This FIT file does not contain a valid activity date")

    sport = ""
    sub_sport = ""
    if session_message is not None:
        sport = str(session_message.get_value("sport") or "")
        sub_sport = str(session_message.get_value("sub_sport") or "")
    if not sport and file_id_message is not None:
        sport = str(file_id_message.get_value("sport") or "")

    duration_seconds = None
    if session_message is not None:
        duration_seconds = normalize_optional_int(session_message.get_value("total_timer_time"))
        if duration_seconds is None:
            duration_seconds = normalize_optional_int(session_message.get_value("total_elapsed_time"))
    if duration_seconds is None and first_record_timestamp and last_record_timestamp:
        duration_seconds = max(0, int((last_record_timestamp - first_record_timestamp).total_seconds()))

    distance_m = None
    if session_message is not None:
        distance_m = normalize_optional_float(session_message.get_value("total_distance"))
    if distance_m is None and last_record_distance is not None:
        distance_m = last_record_distance

    avg_power = normalize_optional_float(session_message.get_value("avg_power") if session_message else None)
    max_power = normalize_optional_float(session_message.get_value("max_power") if session_message else None)
    avg_hr = normalize_optional_float(session_message.get_value("avg_heart_rate") if session_message else None)
    max_hr = normalize_optional_float(session_message.get_value("max_heart_rate") if session_message else None)
    avg_cadence = normalize_optional_float(session_message.get_value("avg_cadence") if session_message else None)
    calories = normalize_optional_float(session_message.get_value("total_calories") if session_message else None)

    source_label = "Importé depuis un fichier FIT"
    if sport:
        sport_label = sport.replace("_", " ").strip()
        if sub_sport:
            sport_label = f"{sport_label} ({sub_sport.replace('_', ' ').strip()})"
        source_label = f"Import FIT: {sport_label}"

    return {
        "date": session_start.date().isoformat(),
        "started_at": session_start.isoformat(),
        "sport": sport.strip().lower(),
        "sub_sport": sub_sport.strip().lower(),
        "activity_type": infer_activity_type_from_fit(sport, sub_sport),
        "duration_seconds": duration_seconds,
        "duration": format_duration_hms(duration_seconds),
        "distance_m": distance_m,
        "distance_km": round(distance_m / 1000, 2) if distance_m is not None else None,
        "avg_power": avg_power,
        "max_power": max_power,
        "avg_hr": avg_hr,
        "max_hr": max_hr,
        "avg_cadence": avg_cadence,
        "calories": calories,
        "record_count": record_count,
        "source_label": source_label,
        "source_file": str(filename or "").strip(),
    }


def import_activity_file_into_db(
    db,
    username: str,
    *,
    parsed_activity: dict,
    activity_type_override: str = "",
    date_override: str = "",
    title: str = "",
    note: str = "",
) -> dict:
    target_date = str(date_override or parsed_activity.get("date") or "").strip()
    if not target_date:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No target date could be determined from the activity file")
    try:
        date.fromisoformat(target_date)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid target date for imported activity") from exc

    row = get_session_obj(db, username, target_date)
    existing_payload = session_payload_from_row(row) if row else normalize_session_payload({})
    existing_activities = [normalize_activity_entry(item) for item in get_session_activities(existing_payload)]

    activity_type = normalize_activity_type(activity_type_override) or normalize_activity_type(parsed_activity.get("activity_type")) or "velo"
    summary = build_fit_activity_summary(parsed_activity, parsed_activity.get("source_file", ""))
    imported_activity = normalize_activity_entry({
        "title": str(title or "").strip(),
        "activity_type": activity_type,
        "activity_details": summary,
        "note": str(note or "").strip(),
    })
    existing_activities.append(imported_activity)

    payload_to_save = dict(existing_payload)
    payload_to_save["activities"] = existing_activities
    payload_to_save["draft_active_activity_index"] = len(existing_activities) - 1
    payload_to_save["draft_updated_at"] = ""
    normalized_payload = normalize_session_payload(payload_to_save)

    if row:
        row.data = json.dumps(normalized_payload, ensure_ascii=False)
    else:
        db.add(SessionModel(username=username, date=target_date, data=json.dumps(normalized_payload, ensure_ascii=False)))

    db.commit()
    return {
        "date": target_date,
        "activity_index": len(existing_activities) - 1,
        "activity_type": activity_type,
        "activity_count": len(existing_activities),
        "summary": summary,
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
    normalized["shoe_size"] = round(float(normalized["shoe_size"]), 1)
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
    return user.username == DEFAULT_USERNAME and any(
        candidate and verify_password(candidate, user.password_salt, user.password_hash)
        for candidate in {DEFAULT_PASSWORD, LEGACY_DEFAULT_PASSWORD}
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

def build_exercise_performance_summary(db, username: str, exercise_name: str, exclude_date: str | None = None) -> dict:
    normalized_name = str(exercise_name or "").strip()
    if not normalized_name:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Exercise name is required")
    excluded_date = str(exclude_date or "").strip()
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
        if excluded_date and str(row.date or "").strip() == excluded_date:
            continue
        payload = session_payload_from_row(row)
        activities = get_session_activities(payload) or [payload]
        matching_items = []
        activity_status = payload.get("status", "todo")
        for activity in activities:
            activity_type = str(activity.get("activity_type", "") or "").strip()
            if activity_type and activity_type != "musculation":
                continue
            matching_items.extend(
                item for item in activity.get("performed_items", [])
                if str(item.get("exercise_name", "")).strip() == normalized_name
            )
            if matching_items and activity.get("status") == "done":
                activity_status = "done"
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
            "status": activity_status,
            "sets": session_sets,
            "top_set": choose_best_set(session_sets),
        }
        matching_sessions.append(session_summary)
        if activity_status == "done":
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

def sync_existing_exercise_taxonomy():
    db = SessionLocal()
    try:
        for row in db.query(ExerciseModel).all():
            has_categories = db.query(ExerciseCategoryLinkModel).filter_by(exercise_name=row.name).first() is not None
            has_family = db.query(ExerciseMovementFamilyLinkModel).filter_by(exercise_name=row.name).first() is not None
            if not has_categories or (row.movement_family and not has_family):
                sync_exercise_taxonomy(db, row)
        db.commit()
    finally:
        db.close()

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
sync_existing_exercise_taxonomy()

def seed_default_user():
    db = SessionLocal()
    existing = db.query(UserModel).filter_by(username=DEFAULT_USERNAME).first()
    if db.query(UserModel).count() == 0:
        if not DEFAULT_PASSWORD:
            raise RuntimeError("REHAB_DEFAULT_PASSWORD must be set before creating the first admin user")
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
cache_existing_brand_logos()

def seed_climbing_data():
    db = SessionLocal()
    try:
        existing = db.query(ClimbingAreaModel).filter_by(name="Val d'Azur").first()
        if existing:
            return

        now = datetime.now(timezone.utc).isoformat()
        area = ClimbingAreaModel(
            name="Val d'Azur",
            country="CH",
            region="Fictional Alps",
            description="Fictional seed area for the outdoor climbing topo MVP.",
            created_at=now,
            updated_at=now,
        )
        db.add(area)
        db.commit()
        db.refresh(area)

        crag = ClimbingCragModel(
            area_id=area.id,
            name="Roc du Signal",
            latitude=46.5284,
            longitude=6.6322,
            approach_notes="Twenty minute forest approach from the old mill parking.",
            description="Compact limestone wall with easy visual landmarks for manual calibration.",
            created_at=now,
            updated_at=now,
        )
        db.add(crag)
        db.commit()
        db.refresh(crag)

        sector = ClimbingSectorModel(
            crag_id=crag.id,
            name="South Face",
            aspect="S",
            approach_minutes=20,
            description="Sunny single-pitch sector used as sample data for the topo overlay.",
            safety_note="Fictional data. Overlay is indicative and not safety-critical route guidance.",
            created_at=now,
            updated_at=now,
        )
        db.add(sector)
        db.commit()
        db.refresh(sector)

        topo = ClimbingTopoImageModel(
            sector_id=sector.id,
            title="South Face overview",
            image_url="/assets/climbing/fictional-sector-topo.svg",
            width=1200,
            height=900,
            source="Seed placeholder",
            attribution="Generated placeholder topo for MVP development",
            created_at=now,
            updated_at=now,
        )
        db.add(topo)
        db.commit()
        db.refresh(topo)

        routes = [
            {
                "name": "Sun Ladder",
                "grade": "5b",
                "length_m": 18,
                "pitches": 1,
                "style": "sport",
                "color": "#f97316",
                "polyline": [{"x": 0.16, "y": 0.86}, {"x": 0.18, "y": 0.70}, {"x": 0.21, "y": 0.53}, {"x": 0.24, "y": 0.34}, {"x": 0.26, "y": 0.16}],
                "description": "Friendly warm-up following positive holds.",
            },
            {
                "name": "Mistral Arete",
                "grade": "5c",
                "length_m": 21,
                "pitches": 1,
                "style": "sport",
                "color": "#22c55e",
                "polyline": [{"x": 0.25, "y": 0.88}, {"x": 0.29, "y": 0.72}, {"x": 0.33, "y": 0.57}, {"x": 0.35, "y": 0.39}, {"x": 0.37, "y": 0.18}],
                "description": "Arete climbing with a thoughtful middle section.",
            },
            {
                "name": "Blue Hour",
                "grade": "6a",
                "length_m": 22,
                "pitches": 1,
                "style": "sport",
                "color": "#2563eb",
                "polyline": [{"x": 0.33, "y": 0.89}, {"x": 0.36, "y": 0.75}, {"x": 0.40, "y": 0.62}, {"x": 0.44, "y": 0.45}, {"x": 0.45, "y": 0.22}],
                "description": "Technical face line on small edges.",
            },
            {
                "name": "Pocket Radio",
                "grade": "6a+",
                "length_m": 24,
                "pitches": 1,
                "style": "sport",
                "color": "#a855f7",
                "polyline": [{"x": 0.43, "y": 0.88}, {"x": 0.45, "y": 0.72}, {"x": 0.49, "y": 0.55}, {"x": 0.52, "y": 0.38}, {"x": 0.54, "y": 0.15}],
                "description": "Pocketed wall with a precise finish.",
            },
            {
                "name": "Quiet Thunder",
                "grade": "6b",
                "length_m": 25,
                "pitches": 1,
                "style": "trad",
                "color": "#e11d48",
                "danger_flag": True,
                "polyline": [{"x": 0.54, "y": 0.90}, {"x": 0.56, "y": 0.76}, {"x": 0.59, "y": 0.60}, {"x": 0.61, "y": 0.42}, {"x": 0.63, "y": 0.19}],
                "description": "Fictional mixed-protection line. Caution marker included for UI testing.",
                "notes": "Check gear placements carefully.",
            },
            {
                "name": "La Traverse",
                "grade": "6b+",
                "length_m": 28,
                "pitches": 1,
                "style": "sport",
                "color": "#06b6d4",
                "polyline": [{"x": 0.60, "y": 0.87}, {"x": 0.65, "y": 0.74}, {"x": 0.69, "y": 0.58}, {"x": 0.70, "y": 0.40}, {"x": 0.72, "y": 0.20}],
                "description": "Diagonal movement into a compact headwall.",
            },
            {
                "name": "Golden Lichen",
                "grade": "6c",
                "length_m": 26,
                "pitches": 1,
                "style": "sport",
                "color": "#ca8a04",
                "polyline": [{"x": 0.70, "y": 0.88}, {"x": 0.73, "y": 0.72}, {"x": 0.76, "y": 0.54}, {"x": 0.79, "y": 0.35}, {"x": 0.81, "y": 0.14}],
                "description": "Sustained face climbing.",
            },
            {
                "name": "Last Train",
                "grade": "7a",
                "length_m": 27,
                "pitches": 1,
                "style": "multipitch",
                "color": "#111827",
                "polyline": [{"x": 0.80, "y": 0.90}, {"x": 0.82, "y": 0.74}, {"x": 0.85, "y": 0.59}, {"x": 0.87, "y": 0.39}, {"x": 0.89, "y": 0.15}],
                "description": "Steeper finish used to test label clutter.",
            },
        ]

        for route in routes:
            db.add(
                ClimbingRouteModel(
                    sector_id=sector.id,
                    topo_image_id=topo.id,
                    name=route["name"],
                    grade=route["grade"],
                    length_m=route["length_m"],
                    pitches=route["pitches"],
                    style=route["style"],
                    description=route.get("description", ""),
                    notes=route.get("notes", ""),
                    danger_flag=bool(route.get("danger_flag", False)),
                    color=route["color"],
                    polyline_json=json.dumps(route["polyline"], ensure_ascii=False),
                    created_at=now,
                    updated_at=now,
                )
            )
        db.commit()
    finally:
        db.close()

seed_climbing_data()

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
    target_end = date.fromisoformat(TARGET_END_DATE)
    if current > target_end:
        return {
            "rehab_day": rehab_day,
            "target_load": None,
            "target_pct_bw": None,
            "sport_allowed": False,
            "target_active": False,
        }
    target = CONFIG["start_load"] + ((rehab_day - 1) // CONFIG["increment_every_days"]) * CONFIG["increment"]
    pct_bw = round(target / CONFIG["weight"] * 100)
    sport_allowed = rehab_day > CONFIG["sport_after_days"]
    return {
        "rehab_day": rehab_day,
        "target_load": target,
        "target_pct_bw": pct_bw,
        "sport_allowed": sport_allowed,
        "target_active": True,
    }

def parse_json_field(value, fallback):
    raw = str(value or "").strip()
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        return fallback

def serialize_climbing_area(row: ClimbingAreaModel) -> dict:
    return {
        "id": row.id,
        "name": row.name,
        "country": row.country or "",
        "region": row.region or "",
        "description": row.description or "",
    }

def serialize_climbing_crag(row: ClimbingCragModel) -> dict:
    return {
        "id": row.id,
        "area_id": row.area_id,
        "name": row.name,
        "latitude": row.latitude,
        "longitude": row.longitude,
        "approach_notes": row.approach_notes or "",
        "description": row.description or "",
    }

def serialize_climbing_sector(row: ClimbingSectorModel) -> dict:
    return {
        "id": row.id,
        "crag_id": row.crag_id,
        "name": row.name,
        "aspect": row.aspect or "",
        "approach_minutes": row.approach_minutes,
        "description": row.description or "",
        "safety_note": row.safety_note or "",
    }

def serialize_climbing_topo(row: ClimbingTopoImageModel) -> dict:
    return {
        "id": row.id,
        "sector_id": row.sector_id,
        "title": row.title,
        "image_url": row.image_url,
        "width": row.width,
        "height": row.height,
        "source": row.source or "",
        "attribution": row.attribution or "",
    }

def serialize_climbing_route(row: ClimbingRouteModel) -> dict:
    return {
        "id": row.id,
        "sector_id": row.sector_id,
        "topo_image_id": row.topo_image_id,
        "name": row.name,
        "grade": row.grade or "",
        "length_m": row.length_m,
        "pitches": row.pitches,
        "style": row.style or "",
        "description": row.description or "",
        "notes": row.notes or "",
        "danger_flag": bool(row.danger_flag),
        "color": row.color or "#f97316",
        "polyline": parse_json_field(row.polyline_json, []),
    }

def serialize_climbing_calibration(db, row: ClimbingCalibrationSessionModel | None) -> dict | None:
    if not row:
        return None
    points = db.query(ClimbingCalibrationPointModel).filter_by(
        calibration_session_id=row.id
    ).order_by(ClimbingCalibrationPointModel.order_index).all()
    return {
        "id": row.id,
        "username": row.username,
        "sector_id": row.sector_id,
        "topo_image_id": row.topo_image_id,
        "name": row.name or "",
        "transform_type": row.transform_type,
        "transform": parse_json_field(row.transform_json, {}),
        "opacity": row.opacity,
        "route_visibility": parse_json_field(row.route_visibility_json, {}),
        "is_active": bool(row.is_active),
        "created_at": row.created_at,
        "updated_at": row.updated_at,
        "points": [
            {
                "id": point.id,
                "label": point.label or "",
                "topo": {"x": point.topo_x, "y": point.topo_y},
                "camera": {"x": point.camera_x, "y": point.camera_y},
            }
            for point in points
        ],
    }

def require_climbing_sector(db, sector_id: int) -> ClimbingSectorModel:
    sector = db.query(ClimbingSectorModel).filter_by(id=sector_id).first()
    if not sector:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Climbing sector not found")
    return sector

@app.get("/api/v1/climbing/areas")
def list_climbing_areas(_: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        rows = db.query(ClimbingAreaModel).order_by(ClimbingAreaModel.name).all()
        return [serialize_climbing_area(row) for row in rows]
    finally:
        db.close()

@app.get("/api/v1/climbing/areas/{area_id}/crags")
def list_climbing_crags(area_id: int, _: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        area = db.query(ClimbingAreaModel).filter_by(id=area_id).first()
        if not area:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Climbing area not found")
        rows = db.query(ClimbingCragModel).filter_by(area_id=area_id).order_by(ClimbingCragModel.name).all()
        return [serialize_climbing_crag(row) for row in rows]
    finally:
        db.close()

@app.get("/api/v1/climbing/crags/{crag_id}/sectors")
def list_climbing_sectors(crag_id: int, _: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        crag = db.query(ClimbingCragModel).filter_by(id=crag_id).first()
        if not crag:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Climbing crag not found")
        rows = db.query(ClimbingSectorModel).filter_by(crag_id=crag_id).order_by(ClimbingSectorModel.name).all()
        return [serialize_climbing_sector(row) for row in rows]
    finally:
        db.close()

@app.get("/api/v1/climbing/sectors/{sector_id}/topo-images")
def list_climbing_topo_images(sector_id: int, _: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        require_climbing_sector(db, sector_id)
        rows = db.query(ClimbingTopoImageModel).filter_by(sector_id=sector_id).order_by(ClimbingTopoImageModel.id).all()
        return [serialize_climbing_topo(row) for row in rows]
    finally:
        db.close()

@app.get("/api/v1/climbing/sectors/{sector_id}/routes")
def list_climbing_routes(sector_id: int, _: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        require_climbing_sector(db, sector_id)
        rows = db.query(ClimbingRouteModel).filter_by(sector_id=sector_id).order_by(ClimbingRouteModel.id).all()
        return [serialize_climbing_route(row) for row in rows]
    finally:
        db.close()

@app.get("/api/v1/climbing/sectors/{sector_id}/topo")
def get_climbing_sector_topo(sector_id: int, current_user: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        sector = require_climbing_sector(db, sector_id)
        crag = db.query(ClimbingCragModel).filter_by(id=sector.crag_id).first()
        area = db.query(ClimbingAreaModel).filter_by(id=crag.area_id).first() if crag else None
        topo_images = db.query(ClimbingTopoImageModel).filter_by(sector_id=sector_id).order_by(ClimbingTopoImageModel.id).all()
        routes = db.query(ClimbingRouteModel).filter_by(sector_id=sector_id).order_by(ClimbingRouteModel.id).all()
        calibration = db.query(ClimbingCalibrationSessionModel).filter_by(
            username=current_user.username,
            sector_id=sector_id,
            is_active=True,
        ).order_by(ClimbingCalibrationSessionModel.updated_at.desc()).first()
        return {
            "area": serialize_climbing_area(area) if area else None,
            "crag": serialize_climbing_crag(crag) if crag else None,
            "sector": serialize_climbing_sector(sector),
            "topo_images": [serialize_climbing_topo(row) for row in topo_images],
            "routes": [serialize_climbing_route(row) for row in routes],
            "latest_calibration": serialize_climbing_calibration(db, calibration),
        }
    finally:
        db.close()

@app.get("/api/v1/climbing/sectors/{sector_id}/calibrations")
def list_climbing_calibrations(sector_id: int, current_user: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        require_climbing_sector(db, sector_id)
        rows = db.query(ClimbingCalibrationSessionModel).filter_by(
            username=current_user.username,
            sector_id=sector_id,
        ).order_by(ClimbingCalibrationSessionModel.updated_at.desc()).all()
        return [serialize_climbing_calibration(db, row) for row in rows]
    finally:
        db.close()

@app.post("/api/v1/climbing/sectors/{sector_id}/calibrations")
def save_climbing_calibration(
    sector_id: int,
    payload: CalibrationSessionPayload,
    current_user: UserModel = Depends(get_current_user),
):
    if len(payload.points) < 3:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="At least 3 calibration point pairs are required")
    transform_type = str(payload.transform_type or "affine").strip().lower()
    if transform_type not in {"affine", "homography"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported transform type")

    db = get_db()
    try:
        require_climbing_sector(db, sector_id)
        topo = db.query(ClimbingTopoImageModel).filter_by(id=payload.topo_image_id, sector_id=sector_id).first()
        if not topo:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Topo image not found for sector")

        now = datetime.now(timezone.utc).isoformat()
        if payload.is_active:
            active_rows = db.query(ClimbingCalibrationSessionModel).filter_by(
                username=current_user.username,
                sector_id=sector_id,
                is_active=True,
            ).all()
            for active_row in active_rows:
                active_row.is_active = False
                active_row.updated_at = now

        row = ClimbingCalibrationSessionModel(
            username=current_user.username,
            sector_id=sector_id,
            topo_image_id=payload.topo_image_id,
            name=str(payload.name or "").strip() or f"Calibration {now[:10]}",
            transform_type=transform_type,
            transform_json=json.dumps(payload.transform, ensure_ascii=False),
            opacity=float(payload.opacity),
            route_visibility_json=json.dumps(payload.route_visibility, ensure_ascii=False),
            is_active=bool(payload.is_active),
            created_at=now,
            updated_at=now,
        )
        db.add(row)
        db.commit()
        db.refresh(row)

        for index, point in enumerate(payload.points):
            db.add(
                ClimbingCalibrationPointModel(
                    calibration_session_id=row.id,
                    order_index=index,
                    label=str(point.label or "").strip(),
                    topo_x=point.topo.x,
                    topo_y=point.topo.y,
                    camera_x=point.camera.x,
                    camera_y=point.camera.y,
                )
            )
        write_audit_log(
            db,
            current_user.username,
            "save_climbing_calibration",
            "climbing_sector",
            str(sector_id),
            f"Saved {transform_type} calibration with {len(payload.points)} point pairs",
        )
        db.commit()
        return {"ok": True, "calibration": serialize_climbing_calibration(db, row)}
    finally:
        db.close()

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

@app.get("/api/admin/activity-summary")
def admin_activity_summary(_: UserModel = Depends(require_admin)):
    db = get_db()
    try:
        since_iso = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
        total_7d = db.query(AuditLogModel).filter(AuditLogModel.created_at >= since_iso).count()
        active_users = (
            db.query(AuditLogModel.username)
            .filter(AuditLogModel.created_at >= since_iso)
            .distinct()
            .count()
        )
        logins_7d = db.query(AuditLogModel).filter(
            AuditLogModel.action == "login",
            AuditLogModel.created_at >= since_iso,
        ).count()
        session_actions_7d = db.query(AuditLogModel).filter(
            AuditLogModel.action.in_(["save_session", "import_activity_file", "import_program"]),
            AuditLogModel.created_at >= since_iso,
        ).count()
        latest_by_user = []
        for user in db.query(UserModel).order_by(UserModel.username).all():
            last_log = (
                db.query(AuditLogModel)
                .filter(AuditLogModel.username == user.username)
                .order_by(AuditLogModel.id.desc())
                .first()
            )
            actions_7d = db.query(AuditLogModel).filter(
                AuditLogModel.username == user.username,
                AuditLogModel.created_at >= since_iso,
            ).count()
            latest_by_user.append({
                "username": user.username,
                "is_admin": bool(user.is_admin),
                "last_action": last_log.action if last_log else "",
                "last_seen_at": last_log.created_at if last_log else "",
                "actions_7d": actions_7d,
            })

        def latest_actions(actions: list[str], limit: int = 5) -> list[dict]:
            rows = (
                db.query(AuditLogModel)
                .filter(AuditLogModel.action.in_(actions))
                .order_by(AuditLogModel.id.desc())
                .limit(limit)
                .all()
            )
            return [serialize_audit_log(row) for row in rows]

        return {
            "total_actions_7d": total_7d,
            "active_users_7d": active_users,
            "logins_7d": logins_7d,
            "session_actions_7d": session_actions_7d,
            "latest_by_user": latest_by_user,
            "latest_imports": latest_actions(["import_program", "import_activity_file"], 5),
            "latest_sessions": latest_actions(["save_session", "import_activity_file"], 5),
        }
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
    exclude_date: str | None = None,
    current_user: UserModel = Depends(get_current_user),
):
    db = get_db()
    try:
        return build_exercise_performance_summary(db, current_user.username, exercise_name, exclude_date)
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
            clear_exercise_taxonomy(db, name)
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
        db.flush()
        sync_exercise_taxonomy(db, row)
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
        sync_exercise_taxonomy(db, target_row)
        write_audit_log(
            db,
            current_user.username,
            "merge_exercise",
            "exercise",
            target_name,
            f"Merged exercise {source_name} into {target_name}",
        )
        clear_exercise_taxonomy(db, source_name)
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

        save_upload_file_with_limit(image_file.file, target_path, MAX_IMAGE_UPLOAD_BYTES)

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


@app.post("/api/session/{date_str}/activities/{activity_index}/upload-image")
def upload_activity_image(
    date_str: str,
    activity_index: int,
    image_file: UploadFile = File(...),
    current_user: UserModel = Depends(get_current_user),
):
    db = get_db()
    try:
        row = get_session_obj(db, current_user.username, date_str)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

        payload = session_payload_from_row(row)
        activities = get_session_activities(payload)
        if not activities and activity_index == 0:
            activities = [normalize_activity_entry(DEFAULT_ACTIVITY)]
        if activity_index < 0 or activity_index >= len(activities):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")

        suffix = sanitize_upload_suffix(image_file.filename)
        if not suffix:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unsupported image format")

        safe_username = "".join(ch if ch.isalnum() or ch in {"_", "-"} else "_" for ch in current_user.username).strip("_") or "user"
        safe_date = date_str.replace("-", "")
        target_name = f"{safe_username}_{safe_date}_activity_{activity_index + 1}_{uuid.uuid4().hex[:12]}{suffix}"
        target_path = ACTIVITY_UPLOADS_DIR / target_name

        save_upload_file_with_limit(image_file.file, target_path, MAX_IMAGE_UPLOAD_BYTES)

        activity = normalize_activity_entry(activities[activity_index])
        previous_image = str(activity.get("image", "") or "").strip()
        image_url = f"/api/uploads/activities/{target_name}"
        activity["image"] = image_url
        activities[activity_index] = activity
        row.data = json.dumps(normalize_session_payload({
            "activities": activities,
            "draft_active_activity_index": activity_index,
        }, payload))
        uploaded_path = resolve_uploaded_activity_path(previous_image)
        if uploaded_path and uploaded_path.is_file():
            uploaded_path.unlink(missing_ok=True)
        write_audit_log(
            db,
            current_user.username,
            "upload_activity_image",
            "session_activity",
            f"{date_str}:{activity_index}",
            f"Uploaded image for activity {activity_index + 1} on {date_str}",
        )
        db.commit()
        return {"ok": True, "image_url": image_url, "session": session_payload_from_row(row)}
    finally:
        image_file.file.close()
        db.close()


@app.post("/api/session/{date_str}/activities/{activity_index}/delete-image")
def delete_activity_image(
    date_str: str,
    activity_index: int,
    current_user: UserModel = Depends(get_current_user),
):
    db = get_db()
    try:
        row = get_session_obj(db, current_user.username, date_str)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

        payload = session_payload_from_row(row)
        activities = get_session_activities(payload)
        if activity_index < 0 or activity_index >= len(activities):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")

        activity = normalize_activity_entry(activities[activity_index])
        image_url = str(activity.get("image", "") or "").strip()
        if not image_url:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity image not found")

        activity["image"] = ""
        activities[activity_index] = activity
        row.data = json.dumps(normalize_session_payload({
            "activities": activities,
            "draft_active_activity_index": activity_index,
        }, payload))
        uploaded_path = resolve_uploaded_activity_path(image_url)
        if uploaded_path and uploaded_path.is_file():
            uploaded_path.unlink(missing_ok=True)
        write_audit_log(
            db,
            current_user.username,
            "delete_activity_image",
            "session_activity",
            f"{date_str}:{activity_index}",
            f"Deleted image for activity {activity_index + 1} on {date_str}",
        )
        db.commit()
        return {"ok": True, "session": session_payload_from_row(row)}
    finally:
        db.close()


@app.post("/api/session/{date_str}/activities/{activity_index}/source-files")
async def upload_activity_source_file(
    date_str: str,
    activity_index: int,
    activity_file: UploadFile = File(...),
    format: str = Form(""),
    provider: str = Form(""),
    label: str = Form(""),
    current_user: UserModel = Depends(get_current_user),
):
    filename = str(activity_file.filename or "").strip()
    if not filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An activity file is required")
    selected_format = detect_activity_file_format(filename, format)
    suffix = sanitize_activity_source_suffix(filename, selected_format)
    if not suffix:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please upload a FIT, TCX, or GPX activity file")

    content = await activity_file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The uploaded file is empty")
    if len(content) > MAX_ACTIVITY_SOURCE_UPLOAD_BYTES:
        raise HTTPException(status_code=status.HTTP_413_CONTENT_TOO_LARGE, detail="Uploaded file is too large")
    parsed_activity = parse_activity_file(content, filename, selected_format)

    db = get_db()
    try:
        row = get_session_obj(db, current_user.username, date_str)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

        payload = session_payload_from_row(row)
        activities = get_session_activities(payload)
        if activity_index < 0 or activity_index >= len(activities):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")

        safe_username = "".join(ch if ch.isalnum() or ch in {"_", "-"} else "_" for ch in current_user.username).strip("_") or "user"
        safe_date = date_str.replace("-", "")
        source_id = uuid.uuid4().hex
        target_name = f"{safe_username}_{safe_date}_activity_{activity_index + 1}_{source_id[:12]}{suffix}"
        target_path = ACTIVITY_SOURCE_UPLOADS_DIR / target_name
        target_path.write_bytes(content)

        activity = normalize_activity_entry(activities[activity_index])
        source_files = normalize_activity_source_files(activity.get("source_files", []))
        source_record = build_activity_source_file_record(
            source_id=source_id,
            provider=provider,
            label=label,
            filename=filename,
            file_format=selected_format,
            file_url=f"/api/uploads/activity-sources/{target_name}",
            parsed_activity=parsed_activity,
        )
        source_files.append(source_record)
        activity["source_files"] = source_files
        activity["metric_source_preferences"] = normalize_metric_source_preferences(
            activity.get("metric_source_preferences", {}),
            source_files,
        )
        activities[activity_index] = activity
        row.data = json.dumps(normalize_session_payload({
            "activities": activities,
            "draft_active_activity_index": activity_index,
        }, payload), ensure_ascii=False)
        write_audit_log(
            db,
            current_user.username,
            "upload_activity_source_file",
            "session_activity",
            f"{date_str}:{activity_index}",
            f"Linked {selected_format.upper()} source file to activity {activity_index + 1} on {date_str}",
        )
        db.commit()
        return {"ok": True, "source_file": source_record, "session": session_payload_from_row(row)}
    finally:
        activity_file.file.close()
        db.close()


@app.put("/api/session/{date_str}/activities/{activity_index}/metric-sources")
def update_activity_metric_sources(
    date_str: str,
    activity_index: int,
    payload: dict,
    current_user: UserModel = Depends(get_current_user),
):
    db = get_db()
    try:
        row = get_session_obj(db, current_user.username, date_str)
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")

        session_payload = session_payload_from_row(row)
        activities = get_session_activities(session_payload)
        if activity_index < 0 or activity_index >= len(activities):
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity not found")

        activity = normalize_activity_entry(activities[activity_index])
        source_files = normalize_activity_source_files(activity.get("source_files", []))
        source_by_id = {source["id"]: source for source in source_files if source.get("id")}
        requested = payload.get("metric_source_preferences", payload) if isinstance(payload, dict) else {}
        if not isinstance(requested, dict):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Metric source preferences must be an object")
        requested = {**activity.get("metric_source_preferences", {}), **requested}
        for metric_name, source_id in requested.items():
            metric_name = str(metric_name or "").strip()
            source_id = str(source_id or "").strip()
            if metric_name and metric_name not in ACTIVITY_SOURCE_METRICS:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unsupported metric: {metric_name}")
            if source_id and source_id not in source_by_id:
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown source file for {metric_name}")
            if source_id and metric_name not in source_by_id[source_id].get("metrics", {}):
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Selected source has no {metric_name} data")

        activity["source_files"] = source_files
        activity["metric_source_preferences"] = normalize_metric_source_preferences(requested, source_files)
        activities[activity_index] = activity
        row.data = json.dumps(normalize_session_payload({
            "activities": activities,
            "draft_active_activity_index": activity_index,
        }, session_payload), ensure_ascii=False)
        write_audit_log(
            db,
            current_user.username,
            "update_activity_metric_sources",
            "session_activity",
            f"{date_str}:{activity_index}",
            f"Updated source preferences for activity {activity_index + 1} on {date_str}",
        )
        db.commit()
        return {"ok": True, "session": session_payload_from_row(row)}
    finally:
        db.close()


@app.get("/api/uploads/activities/{filename}")
def get_uploaded_activity_image(filename: str):
    safe_filename = Path(filename).name
    target_path = ACTIVITY_UPLOADS_DIR / safe_filename
    if not target_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Image not found")
    return FileResponse(target_path)


@app.get("/api/uploads/activity-sources/{filename}")
def get_uploaded_activity_source_file(filename: str):
    safe_filename = Path(filename).name
    target_path = ACTIVITY_SOURCE_UPLOADS_DIR / safe_filename
    if not target_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Activity source file not found")
    return FileResponse(target_path)


@app.get("/api/uploads/equipment-brands/{filename}")
def get_uploaded_brand_logo(filename: str):
    safe_filename = Path(filename).name
    target_path = BRAND_LOGOS_DIR / safe_filename
    if not target_path.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Logo not found")
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
        clear_exercise_taxonomy(db, name)
        db.query(ExerciseModel).filter_by(name=name).delete()
        db.commit()
        return {"ok": True}
    finally:
        db.close()

@app.get("/api/countries")
def get_countries(current_user: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        rows = db.query(CountryModel).filter_by(is_active=True).order_by(CountryModel.name_fr).all()
        return [serialize_country(row, current_user.language) for row in rows]
    finally:
        db.close()

@app.get("/api/equipment/brands")
def get_equipment_brands(current_user: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        rows = db.query(EquipmentBrandModel).order_by(EquipmentBrandModel.name).all()
        country_map = {row.id: row for row in db.query(CountryModel).all()}
        return [serialize_brand(row, country_map.get(row.country_id), current_user.language) for row in rows]
    finally:
        db.close()

@app.post("/api/equipment/brands")
def add_equipment_brand(payload: dict, current_user: UserModel = Depends(require_admin)):
    record = normalize_brand_record(payload)
    if not record["name"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Brand name is required")
    db = get_db()
    try:
        existing = db.query(EquipmentBrandModel).filter_by(name=record["name"]).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Brand already exists")
        if record["country_id"] and not db.query(CountryModel).filter_by(id=record["country_id"], is_active=True).first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Country not found")
        row = EquipmentBrandModel(**record)
        db.add(row)
        write_audit_log(db, current_user.username, "create_equipment_brand", "equipment_brand", record["name"], f"Created equipment brand {record['name']}")
        db.commit()
        db.refresh(row)
        country = db.query(CountryModel).filter_by(id=row.country_id).first() if row.country_id else None
        return {"ok": True, "brand": serialize_brand(row, country, current_user.language)}
    finally:
        db.close()

@app.put("/api/equipment/brands/{brand_id}")
def update_equipment_brand(brand_id: int, payload: dict, current_user: UserModel = Depends(require_admin)):
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
        if record["country_id"] and not db.query(CountryModel).filter_by(id=record["country_id"], is_active=True).first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Country not found")
        row.name = record["name"]
        row.normalized_name = record["normalized_name"]
        row.country_id = record["country_id"]
        row.year_established = record["year_established"]
        row.website_url = record["website_url"]
        row.description = record["description"]
        row.logo_url = record["logo_url"]
        row.is_active = record["is_active"]
        row.created_at = record["created_at"]
        row.updated_at = record["updated_at"]
        row.history = record["history"]
        write_audit_log(db, current_user.username, "update_equipment_brand", "equipment_brand", row.name, f"Updated equipment brand {row.name}")
        db.commit()
        db.refresh(row)
        country = db.query(CountryModel).filter_by(id=row.country_id).first() if row.country_id else None
        return {"ok": True, "brand": serialize_brand(row, country, current_user.language)}
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
        category_map = {row.id: row for row in db.query(EquipmentCategoryModel).all()}
        return [serialize_equipment_model(row, brand_map.get(row.brand_id), category_map.get(row.category_id)) for row in rows]
    finally:
        db.close()

@app.post("/api/equipment/models")
def add_equipment_model(payload: dict, current_user: UserModel = Depends(require_admin)):
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
        existing = db.query(EquipmentModelRef).filter_by(brand_id=record["brand_id"], normalized_name=record["normalized_name"]).first()
        if existing:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Model already exists for this brand")
        row = EquipmentModelRef(**record)
        db.add(row)
        write_audit_log(db, current_user.username, "create_equipment_model", "equipment_model", record["name"], f"Created equipment model {record['name']} for {brand.name}")
        db.commit()
        db.refresh(row)
        category = db.query(EquipmentCategoryModel).filter_by(id=row.category_id).first() if row.category_id else None
        return {"ok": True, "model": serialize_equipment_model(row, brand, category)}
    finally:
        db.close()

@app.put("/api/equipment/models/{model_id}")
def update_equipment_model(model_id: int, payload: dict, current_user: UserModel = Depends(require_admin)):
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
            EquipmentModelRef.normalized_name == record["normalized_name"],
            EquipmentModelRef.id != model_id,
        ).first()
        if duplicate:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Model already exists for this brand")
        row.brand_id = record["brand_id"]
        row.name = record["name"]
        row.normalized_name = record["normalized_name"]
        row.category_id = record["category_id"]
        row.description = record["description"]
        row.is_active = record["is_active"]
        row.created_at = record["created_at"]
        row.updated_at = record["updated_at"]
        row.history = record["history"]
        write_audit_log(db, current_user.username, "update_equipment_model", "equipment_model", row.name, f"Updated equipment model {row.name}")
        db.commit()
        db.refresh(row)
        category = db.query(EquipmentCategoryModel).filter_by(id=row.category_id).first() if row.category_id else None
        return {"ok": True, "model": serialize_equipment_model(row, brand, category)}
    finally:
        db.close()

@app.delete("/api/equipment/models/{model_id}")
def delete_equipment_model(model_id: int, current_user: UserModel = Depends(require_admin)):
    db = get_db()
    try:
        row = db.query(EquipmentModelRef).filter_by(id=model_id).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
        if db.query(EquipmentModelVersionModel).filter_by(model_id=model_id).first():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Delete linked model versions first")
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
        rows = db.query(EquipmentModelVersionModel).order_by(EquipmentModelVersionModel.id.desc()).all()
        brand_map = {row.id: row for row in db.query(EquipmentBrandModel).all()}
        model_map = {row.id: row for row in db.query(EquipmentModelRef).all()}
        category_map = {row.id: row for row in db.query(EquipmentCategoryModel).all()}
        return [
            serialize_equipment(
                row,
                brand_map.get(model_map.get(row.model_id).brand_id) if model_map.get(row.model_id) else None,
                model_map.get(row.model_id),
                category_map.get(model_map.get(row.model_id).category_id) if model_map.get(row.model_id) else None,
            )
            for row in rows
        ]
    finally:
        db.close()

@app.post("/api/equipment")
def add_equipment(payload: dict, current_user: UserModel = Depends(require_admin)):
    record = normalize_equipment_record(payload)
    if not record["name"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Equipment name is required")
    if not record["brand_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="brand_id is required")
    if not record["model_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="model_id is required")

    db = get_db()
    try:
        brand = db.query(EquipmentBrandModel).filter_by(id=record["brand_id"]).first()
        if not brand:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")
        model = db.query(EquipmentModelRef).filter_by(id=record["model_id"]).first()
        if not model:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
        if model.brand_id != brand.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Model does not belong to selected brand")
        category = ensure_equipment_category(db, record["category"])
        if category:
            model.category_id = category.id
        if record["description"] and not model.description:
            model.description = record["description"]
        model.updated_at = date.today().isoformat()
        row = EquipmentModelVersionModel(
            model_id=record["model_id"],
            version_name=record["name"],
            description=record["description"],
            product_url=record["link"],
            image_url=record["image"],
            is_active=True,
            created_at=date.today().isoformat(),
            updated_at=date.today().isoformat(),
        )
        db.add(row)
        write_audit_log(db, current_user.username, "create_equipment", "equipment", record["name"], f"Created equipment {record['name']}")
        db.commit()
        db.refresh(row)
        return {"ok": True, "equipment": serialize_equipment(row, brand, model, category)}
    finally:
        db.close()

@app.put("/api/equipment/{equipment_id}")
def update_equipment(equipment_id: int, payload: dict, current_user: UserModel = Depends(require_admin)):
    record = normalize_equipment_record(payload)
    if not record["name"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Equipment name is required")
    if not record["brand_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="brand_id is required")
    if not record["model_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="model_id is required")

    db = get_db()
    try:
        row = db.query(EquipmentModelVersionModel).filter_by(id=equipment_id).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipment not found")
        brand = db.query(EquipmentBrandModel).filter_by(id=record["brand_id"]).first()
        if not brand:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brand not found")
        model = db.query(EquipmentModelRef).filter_by(id=record["model_id"]).first()
        if not model:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Model not found")
        if model.brand_id != brand.id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Model does not belong to selected brand")
        row.model_id = record["model_id"]
        row.version_name = record["name"]
        row.description = record["description"]
        row.image_url = record["image"]
        row.product_url = record["link"]
        row.updated_at = date.today().isoformat()
        category = ensure_equipment_category(db, record["category"])
        if category:
            model.category_id = category.id
        if record["description"] and not model.description:
            model.description = record["description"]
        model.updated_at = date.today().isoformat()
        write_audit_log(db, current_user.username, "update_equipment", "equipment", row.version_name, f"Updated equipment {row.version_name}")
        db.commit()
        return {"ok": True, "equipment": serialize_equipment(row, brand, model, category)}
    finally:
        db.close()

@app.delete("/api/equipment/{equipment_id}")
def delete_equipment(equipment_id: int, current_user: UserModel = Depends(require_admin)):
    db = get_db()
    try:
        row = db.query(EquipmentModelVersionModel).filter_by(id=equipment_id).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipment not found")
        db.query(EquipmentItemModel).filter_by(model_version_id=equipment_id).delete()
        write_audit_log(db, current_user.username, "delete_equipment", "equipment", row.version_name, f"Deleted equipment {row.version_name}")
        db.delete(row)
        db.commit()
        return {"ok": True}
    finally:
        db.close()

@app.get("/api/my-equipment")
def get_my_equipment(current_user: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        purchases = db.query(EquipmentItemModel).filter_by(username=current_user.username).order_by(EquipmentItemModel.purchase_date.desc(), EquipmentItemModel.id.desc()).all()
        equipment_map = {row.id: row for row in db.query(EquipmentModelVersionModel).all()}
        brand_map = {row.id: row for row in db.query(EquipmentBrandModel).all()}
        model_map = {row.id: row for row in db.query(EquipmentModelRef).all()}
        category_map = {row.id: row for row in db.query(EquipmentCategoryModel).all()}
        return [
            serialize_user_equipment(
                row,
                equipment_map.get(row.model_version_id),
                brand_map.get(model_map.get(equipment_map.get(row.model_version_id).model_id).brand_id) if equipment_map.get(row.model_version_id) and model_map.get(equipment_map.get(row.model_version_id).model_id) else None,
                model_map.get(equipment_map.get(row.model_version_id).model_id) if equipment_map.get(row.model_version_id) else None,
                category_map.get(model_map.get(equipment_map.get(row.model_version_id).model_id).category_id) if equipment_map.get(row.model_version_id) and model_map.get(equipment_map.get(row.model_version_id).model_id) else None,
            )
            for row in purchases
        ]
    finally:
        db.close()

@app.post("/api/my-equipment")
def add_my_equipment(payload: dict, current_user: UserModel = Depends(get_current_user)):
    record = normalize_user_equipment_record(payload)
    if not record["model_version_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="model_version_id is required")

    db = get_db()
    try:
        equipment = db.query(EquipmentModelVersionModel).filter_by(id=record["model_version_id"]).first()
        if not equipment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipment not found")
        if record["variant_id"] and not db.query(EquipmentModelVariantModel).filter_by(id=record["variant_id"], model_version_id=record["model_version_id"]).first():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found")
        row = EquipmentItemModel(
            username=current_user.username,
            model_version_id=record["model_version_id"],
            variant_id=record["variant_id"],
            purchase_date=record["purchase_date"],
            purchase_price=record["purchase_price"],
            purchase_currency=record["purchase_currency"],
            purchase_location=record["purchase_location"],
            purchase_shop_url=record["purchase_shop_url"],
            purchase_condition=record["purchase_condition"],
            serial_number=record["serial_number"],
            nickname=record["nickname"],
            status=record["status"],
            notes=record["notes"],
            created_at=date.today().isoformat(),
            updated_at=date.today().isoformat(),
        )
        db.add(row)
        db.commit()
        db.refresh(row)
        model = db.query(EquipmentModelRef).filter_by(id=equipment.model_id).first() if equipment.model_id else None
        brand = db.query(EquipmentBrandModel).filter_by(id=model.brand_id).first() if model else None
        category = db.query(EquipmentCategoryModel).filter_by(id=model.category_id).first() if model and model.category_id else None
        write_audit_log(
            db,
            current_user.username,
            "add_my_equipment",
            "equipment_item",
            str(row.id),
            f"Added owned equipment {build_equipment_display_name(equipment, brand, model)}",
        )
        db.commit()
        return {"ok": True, "purchase": serialize_user_equipment(row, equipment, brand, model, category)}
    finally:
        db.close()

@app.put("/api/my-equipment/{purchase_id}")
def update_my_equipment(purchase_id: int, payload: dict, current_user: UserModel = Depends(get_current_user)):
    record = normalize_user_equipment_record(payload)
    if not record["model_version_id"]:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="model_version_id is required")

    db = get_db()
    try:
        row = db.query(EquipmentItemModel).filter_by(id=purchase_id, username=current_user.username).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase not found")
        equipment = db.query(EquipmentModelVersionModel).filter_by(id=record["model_version_id"]).first()
        if not equipment:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Equipment not found")
        if record["variant_id"] and not db.query(EquipmentModelVariantModel).filter_by(id=record["variant_id"], model_version_id=record["model_version_id"]).first():
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Variant not found")
        row.model_version_id = record["model_version_id"]
        row.variant_id = record["variant_id"]
        row.purchase_date = record["purchase_date"]
        row.purchase_price = record["purchase_price"]
        row.purchase_currency = record["purchase_currency"]
        row.purchase_location = record["purchase_location"]
        row.purchase_shop_url = record["purchase_shop_url"]
        row.purchase_condition = record["purchase_condition"]
        row.serial_number = record["serial_number"]
        row.nickname = record["nickname"]
        row.status = record["status"]
        row.notes = record["notes"]
        row.updated_at = date.today().isoformat()
        db.commit()
        model = db.query(EquipmentModelRef).filter_by(id=equipment.model_id).first() if equipment.model_id else None
        brand = db.query(EquipmentBrandModel).filter_by(id=model.brand_id).first() if model else None
        category = db.query(EquipmentCategoryModel).filter_by(id=model.category_id).first() if model and model.category_id else None
        write_audit_log(
            db,
            current_user.username,
            "update_my_equipment",
            "equipment_item",
            str(row.id),
            f"Updated owned equipment {build_equipment_display_name(equipment, brand, model)}",
        )
        db.commit()
        return {"ok": True, "purchase": serialize_user_equipment(row, equipment, brand, model, category)}
    finally:
        db.close()

@app.delete("/api/my-equipment/{purchase_id}")
def delete_my_equipment(purchase_id: int, current_user: UserModel = Depends(get_current_user)):
    db = get_db()
    try:
        row = db.query(EquipmentItemModel).filter_by(id=purchase_id, username=current_user.username).first()
        if not row:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Purchase not found")
        equipment = db.query(EquipmentModelVersionModel).filter_by(id=row.model_version_id).first()
        model = db.query(EquipmentModelRef).filter_by(id=equipment.model_id).first() if equipment and equipment.model_id else None
        brand = db.query(EquipmentBrandModel).filter_by(id=model.brand_id).first() if model else None
        write_audit_log(
            db,
            current_user.username,
            "delete_my_equipment",
            "equipment_item",
            str(row.id),
            f"Deleted owned equipment {build_equipment_display_name(equipment, brand, model) if equipment else row.model_version_id}",
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


@app.post("/api/import/activity-file")
async def import_activity_file(
    file: UploadFile = File(...),
    format: str = Form("auto"),
    activity_type_override: str = Form(""),
    date_override: str = Form(""),
    title: str = Form(""),
    note: str = Form(""),
    current_user: UserModel = Depends(get_current_user),
):
    filename = str(file.filename or "").strip()
    if not filename:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="An activity file is required")
    selected_format = detect_activity_file_format(filename, format)
    if selected_format not in {"fit", "tcx", "gpx"}:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Please upload a FIT, TCX, or GPX activity file")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="The uploaded file is empty")

    parsed_activity = parse_activity_file(content, filename, selected_format)

    db = get_db()
    try:
        result = import_activity_file_into_db(
            db,
            current_user.username,
            parsed_activity=parsed_activity,
            activity_type_override=activity_type_override,
            date_override=date_override,
            title=title,
            note=note,
        )
        write_audit_log(
            db,
            current_user.username,
            "import_activity_file",
            "session",
            result["date"],
            f"Imported {selected_format.upper()} activity into {result['date']} ({result['activity_type']})",
        )
        db.commit()
        return {
            "ok": True,
            "imported_date": result["date"],
            "activity_index": result["activity_index"],
            "activity_count": result["activity_count"],
            "activity_type": result["activity_type"],
            "summary": result["summary"],
            "detected_format": selected_format,
            "detected_sport": parsed_activity.get("sport", ""),
            "detected_sub_sport": parsed_activity.get("sub_sport", ""),
            "distance_km": parsed_activity.get("distance_km"),
            "duration": parsed_activity.get("duration", ""),
        }
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
    data["diff"] = (
        round((data.get("load", 0) or 0) - target["target_load"], 2)
        if target["target_load"] is not None
        else None
    )
    data["activity_count"] = len(get_session_activities(data))
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
            activities = get_session_activities(payload)
            activity_entries = get_calendar_activity_entry_summaries(payload)
            activity_summaries = get_calendar_activity_summaries(payload)
            activity_types = get_calendar_activity_types(payload)
            target = get_target_for_date(date_str)
            diff = (
                round((payload.get("load", 0) or 0) - target["target_load"], 2)
                if target["target_load"] is not None
                else None
            )
            display_exercises = get_calendar_display_exercises(payload)
            planned_exercises = unique_names(
                [
                    item.get("exercise_name", "")
                    for item in payload.get("planned_items", [])
                    if item.get("exercise_name")
                ]
            )
            performed_exercises = unique_names(
                [
                    item.get("custom_name", "") or item.get("exercise_name", "")
                    for activity in (activities or [payload])
                    for item in activity.get("performed_items", [])
                ]
            )
            out.append({
                "date": date_str,
                "rehab_day": target["rehab_day"],
                "status": payload.get("status", "todo"),
                "target_load": target["target_load"],
                "target_active": target["target_active"],
                "target_pct_bw": target["target_pct_bw"],
                "actual_load": payload.get("load", 0),
                "diff": diff,
                "sport_allowed": target["sport_allowed"],
                "physio_time": payload.get("physio_time", ""),
                "activity_type": payload.get("activity_type", ""),
                "activity_types": activity_types,
                "activity_entries": activity_entries,
                "activity_summaries": activity_summaries,
                "activity_details": payload.get("activity_details", ""),
                "climbing_routes": payload.get("climbing_routes", []),
                "exercises": display_exercises,
                "planned_exercises": planned_exercises,
                "performed_exercises": performed_exercises,
                "plan_title": payload.get("plan_title", ""),
                "activity_count": len(activities),
            })
        return out
    finally:
        db.close()
