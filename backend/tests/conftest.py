import os
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient


TEST_DATA_DIR = Path(__file__).resolve().parent / ".test-data"
TEST_DATA_DIR.mkdir(parents=True, exist_ok=True)
os.environ["REHAB_DB_PATH"] = str(TEST_DATA_DIR / "test.sqlite")

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app import main  # noqa: E402


@pytest.fixture()
def client():
    user = main.UserModel(
        username="admin",
        password_hash="",
        password_salt="",
        is_admin=True,
        language="en",
    )
    main.app.dependency_overrides[main.get_current_user] = lambda: user
    try:
        with TestClient(main.app) as test_client:
            yield test_client
    finally:
        main.app.dependency_overrides.clear()


@pytest.fixture(autouse=True)
def clean_exercise_rows():
    db = main.SessionLocal()
    try:
        db.query(main.ExerciseCategoryLinkModel).delete()
        db.query(main.ExerciseMovementFamilyLinkModel).delete()
        db.query(main.ExerciseCategoryModel).delete()
        db.query(main.ExerciseMovementFamilyModel).delete()
        db.query(main.ExerciseModel).delete()
        db.query(main.EquipmentItemEventModel).delete()
        db.query(main.EquipmentItemModel).delete()
        db.query(main.EquipmentModelVariantModel).delete()
        db.query(main.EquipmentModelSizeModel).delete()
        db.query(main.EquipmentModelColorModel).delete()
        db.query(main.EquipmentModelVersionModel).delete()
        db.query(main.EquipmentModelRef).delete()
        db.query(main.EquipmentCategoryModel).delete()
        db.query(main.EquipmentBrandModel).delete()
        db.query(main.SessionModel).delete()
        db.query(main.AuditLogModel).delete()
        db.commit()
    finally:
        db.close()
    yield
