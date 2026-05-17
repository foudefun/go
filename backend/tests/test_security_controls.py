from app import main


def test_equipment_catalog_writes_require_admin(non_admin_client):
    response = non_admin_client.post("/api/equipment/brands", json={"name": "Test Brand"})
    assert response.status_code == 403

    response = non_admin_client.post("/api/equipment/models", json={"brand_id": 1, "name": "Test Model"})
    assert response.status_code == 403

    response = non_admin_client.post("/api/equipment", json={"brand_id": 1, "model_id": 1, "name": "test"})
    assert response.status_code == 403


def test_image_upload_size_limit_is_enforced(client):
    db = main.SessionLocal()
    try:
        row = main.ExerciseModel(
            name="upload_limit_test",
            display_name="Upload limit test",
            display_name_fr="Upload limit test",
            display_name_en="Upload limit test",
            category="test",
            movement_family="",
            tracking_mode="reps_weight",
            weight_unit="kg",
            description="",
            link="",
            image="",
            images_json="[]",
            document="",
        )
        db.add(row)
        db.commit()
    finally:
        db.close()

    original_limit = main.MAX_IMAGE_UPLOAD_BYTES
    main.MAX_IMAGE_UPLOAD_BYTES = 4
    try:
        response = client.post(
            "/api/exercises/upload_limit_test/upload-image",
            files={"image_file": ("too-large.png", b"12345", "image/png")},
        )
        assert response.status_code == 413
    finally:
        main.MAX_IMAGE_UPLOAD_BYTES = original_limit
