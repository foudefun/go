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
