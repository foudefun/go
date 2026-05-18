import pytest
from sqlalchemy.exc import IntegrityError

from app import main


def test_equipment_catalog_and_owned_item_use_model_versions(client):
    brand_response = client.post(
        "/api/equipment/brands",
        json={"name": "Petzl", "country_id": "", "year_established": 1975},
    )
    assert brand_response.status_code == 200
    brand = brand_response.json()["brand"]

    model_response = client.post(
        "/api/equipment/models",
        json={"brand_id": brand["id"], "name": "GriGri"},
    )
    assert model_response.status_code == 200
    model = model_response.json()["model"]
    assert model["normalized_name"] == "grigri"

    equipment_response = client.post(
        "/api/equipment",
        json={
            "brand_id": brand["id"],
            "model_id": model["id"],
            "name": "GriGri 2025",
            "category": "Belay device",
            "description": "Assisted braking belay device.",
            "image": "/uploads/grigri.jpg",
            "link": "https://example.test/grigri",
        },
    )
    assert equipment_response.status_code == 200
    equipment = equipment_response.json()["equipment"]
    assert equipment["model_id"] == model["id"]
    assert equipment["brand_id"] == brand["id"]
    assert equipment["category"] == "Belay device"

    owned_response = client.post(
        "/api/my-equipment",
        json={
            "equipment_id": equipment["id"],
            "purchase_date": "2026-01-10",
            "purchase_price": 89.9,
            "purchase_currency": "CHF",
            "purchase_condition": "new",
            "note": "Bought for gym climbing.",
        },
    )
    assert owned_response.status_code == 200
    purchase = owned_response.json()["purchase"]
    assert purchase["model_version_id"] == equipment["id"]
    assert purchase["equipment_id"] == equipment["id"]
    assert purchase["purchase_currency"] == "CHF"
    assert purchase["status"] == "owned"
    assert purchase["note"] == "Bought for gym climbing."


def test_equipment_model_rejects_missing_brand_foreign_key():
    db = main.SessionLocal()
    try:
        db.add(
            main.EquipmentModelRef(
                brand_id=999999,
                name="Orphan model",
                normalized_name="orphan model",
                created_at="2026-05-18",
            )
        )
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
    finally:
        db.close()


def test_equipment_version_rejects_missing_model_foreign_key():
    db = main.SessionLocal()
    try:
        db.add(
            main.EquipmentModelVersionModel(
                model_id=999999,
                version_name="Orphan version",
                created_at="2026-05-18",
                updated_at="2026-05-18",
            )
        )
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()
    finally:
        db.close()


def test_equipment_creation_rejects_model_from_another_brand(client):
    petzl = client.post("/api/equipment/brands", json={"name": "Petzl"}).json()["brand"]
    garmin = client.post("/api/equipment/brands", json={"name": "Garmin"}).json()["brand"]
    model = client.post("/api/equipment/models", json={"brand_id": petzl["id"], "name": "GriGri"}).json()["model"]

    response = client.post(
        "/api/equipment",
        json={
            "brand_id": garmin["id"],
            "model_id": model["id"],
            "name": "GriGri Plus",
            "category": "Belay device",
        },
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Model does not belong to selected brand"


def test_owned_equipment_rejects_variant_from_another_model_version(client):
    brand = client.post("/api/equipment/brands", json={"name": "Salomon"}).json()["brand"]
    model = client.post("/api/equipment/models", json={"brand_id": brand["id"], "name": "S/Lab Ultra"}).json()["model"]
    first_version = client.post(
        "/api/equipment",
        json={"brand_id": brand["id"], "model_id": model["id"], "name": "S/Lab Ultra 2"},
    ).json()["equipment"]
    second_version = client.post(
        "/api/equipment",
        json={"brand_id": brand["id"], "model_id": model["id"], "name": "S/Lab Ultra 3"},
    ).json()["equipment"]

    db = main.SessionLocal()
    try:
        color = main.EquipmentModelColorModel(
            model_version_id=first_version["id"],
            color_name="Black",
            created_at="2026-05-18",
            updated_at="2026-05-18",
        )
        size = main.EquipmentModelSizeModel(
            model_version_id=first_version["id"],
            size_label="42",
            size_system="EU",
            size_type="shoe_size",
            created_at="2026-05-18",
            updated_at="2026-05-18",
        )
        db.add_all([color, size])
        db.flush()
        variant = main.EquipmentModelVariantModel(
            model_version_id=first_version["id"],
            color_id=color.id,
            size_id=size.id,
            sku="SLAB-42-BLK",
            created_at="2026-05-18",
            updated_at="2026-05-18",
        )
        db.add(variant)
        db.commit()
        variant_id = variant.id
    finally:
        db.close()

    response = client.post(
        "/api/my-equipment",
        json={"equipment_id": second_version["id"], "variant_id": variant_id},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "Variant not found"


def test_equipment_schema_uses_target_tables():
    connection = main.engine.raw_connection()
    cursor = connection.cursor()
    try:
        tables = {
            row[0]
            for row in cursor.execute(
                "SELECT name FROM sqlite_master WHERE type='table'"
            ).fetchall()
        }
        assert "equipment_model_versions" in tables
        assert "equipment_model_variants" in tables
        assert "equipment_items" in tables
        assert "equipment_item_events" in tables
        assert "equipment" not in tables
        assert "user_equipment" not in tables
    finally:
        cursor.close()
        connection.close()
