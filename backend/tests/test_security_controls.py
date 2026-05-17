from app import main
from datetime import datetime, timedelta, timezone
from fastapi.testclient import TestClient
from uuid import uuid4

PNG_BYTES = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"


def test_equipment_catalog_writes_require_admin(non_admin_client):
    response = non_admin_client.post("/api/equipment/brands", json={"name": "Test Brand"})
    assert response.status_code == 403

    response = non_admin_client.post("/api/equipment/models", json={"brand_id": 1, "name": "Test Model"})
    assert response.status_code == 403

    response = non_admin_client.post("/api/equipment", json={"brand_id": 1, "model_id": 1, "name": "test"})
    assert response.status_code == 403

    db = main.SessionLocal()
    try:
        denied_logs = db.query(main.AuditLogModel).filter_by(action="admin_access_denied", username="member").count()
        assert denied_logs == 3
    finally:
        db.close()


def test_failed_login_is_audited():
    username = f"audited-user-{uuid4().hex[:8]}"
    db = main.SessionLocal()
    try:
        salt, password_hash = main.build_password_record("correct-password")
        db.add(main.UserModel(username=username, password_hash=password_hash, password_salt=salt, is_admin=False))
        db.commit()
    finally:
        db.close()

    with TestClient(main.app) as test_client:
        response = test_client.post("/api/auth/login", json={"username": username, "password": "wrong-password"})
    assert response.status_code == 401

    db = main.SessionLocal()
    try:
        log = db.query(main.AuditLogModel).filter_by(action="login_failed", username=username).first()
        assert log is not None
        assert log.target_type == "auth"
    finally:
        db.close()


def test_login_locks_after_six_failures():
    username = f"locked-user-{uuid4().hex[:8]}"
    db = main.SessionLocal()
    try:
        salt, password_hash = main.build_password_record("correct-password")
        db.add(main.UserModel(username=username, password_hash=password_hash, password_salt=salt, is_admin=False))
        db.commit()
    finally:
        db.close()

    with TestClient(main.app) as test_client:
        for _ in range(6):
            response = test_client.post("/api/auth/login", json={"username": username, "password": "wrong-password"})
            assert response.status_code == 401

        locked_response = test_client.post("/api/auth/login", json={"username": username, "password": "correct-password"})
        assert locked_response.status_code == 429

    db = main.SessionLocal()
    try:
        key = main.login_lock_key(username, "testclient")
        assert db.query(main.AuditLogModel).filter_by(action="login_failed", target_key=key).count() == 6
        assert db.query(main.AuditLogModel).filter_by(action="login_locked", target_key=key).count() >= 1
    finally:
        db.close()


def test_login_lock_expires_after_duration():
    username = f"expired-lock-user-{uuid4().hex[:8]}"
    db = main.SessionLocal()
    try:
        salt, password_hash = main.build_password_record("correct-password")
        db.add(main.UserModel(username=username, password_hash=password_hash, password_salt=salt, is_admin=False))
        old_time = (datetime.now(timezone.utc) - timedelta(minutes=main.LOGIN_LOCK_DURATION_MINUTES + 1)).isoformat()
        db.add(
            main.AuditLogModel(
                username=username,
                action="login_locked",
                target_type="auth",
                target_key=main.login_lock_key(username, "testclient"),
                summary="old lock",
                created_at=old_time,
            )
        )
        db.commit()
    finally:
        db.close()

    with TestClient(main.app) as test_client:
        response = test_client.post("/api/auth/login", json={"username": username, "password": "correct-password"})
        assert response.status_code == 200


def test_mutations_require_csrf_token():
    username = f"csrf-user-{uuid4().hex[:8]}"
    password = "correct-password"
    db = main.SessionLocal()
    try:
        salt, password_hash = main.build_password_record(password)
        db.add(main.UserModel(username=username, password_hash=password_hash, password_salt=salt, is_admin=False))
        db.commit()
    finally:
        db.close()

    with TestClient(main.app) as test_client:
        login = test_client.post("/api/auth/login", json={"username": username, "password": password})
        assert login.status_code == 200, login.text
        token = login.json()["token"]

        response = test_client.put(
            "/api/auth/preferences",
            headers={"Authorization": f"Bearer {token}"},
            json={"language": "en"},
        )
        assert response.status_code == 403
        assert response.json()["detail"] == "CSRF token is required"


def test_mutations_accept_valid_csrf_token():
    username = f"csrf-ok-user-{uuid4().hex[:8]}"
    password = "correct-password"
    db = main.SessionLocal()
    try:
        salt, password_hash = main.build_password_record(password)
        db.add(main.UserModel(username=username, password_hash=password_hash, password_salt=salt, is_admin=False))
        db.commit()
    finally:
        db.close()

    with TestClient(main.app) as test_client:
        login = test_client.post("/api/auth/login", json={"username": username, "password": password})
        assert login.status_code == 200, login.text
        payload = login.json()

        response = test_client.put(
            "/api/auth/preferences",
            headers={
                "Authorization": f"Bearer {payload['token']}",
                "X-CSRF-Token": payload["csrf_token"],
            },
            json={"language": "en"},
        )
        assert response.status_code == 200
        assert response.json()["language"] == "en"


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
            files={"image_file": ("too-large.png", PNG_BYTES, "image/png")},
        )
        assert response.status_code == 413
    finally:
        main.MAX_IMAGE_UPLOAD_BYTES = original_limit


def test_fake_image_upload_is_rejected(client):
    db = main.SessionLocal()
    try:
        row = main.ExerciseModel(
            name="fake_image_test",
            display_name="Fake image test",
            display_name_fr="Fake image test",
            display_name_en="Fake image test",
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

    response = client.post(
        "/api/exercises/fake_image_test/upload-image",
        files={"image_file": ("fake.png", b"not really an image", "image/png")},
    )
    assert response.status_code == 400


def test_image_extension_must_match_content(client):
    db = main.SessionLocal()
    try:
        row = main.ExerciseModel(
            name="mismatch_image_test",
            display_name="Mismatch image test",
            display_name_fr="Mismatch image test",
            display_name_en="Mismatch image test",
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

    response = client.post(
        "/api/exercises/mismatch_image_test/upload-image",
        files={"image_file": ("mismatch.jpg", PNG_BYTES, "image/jpeg")},
    )
    assert response.status_code == 400


def test_uploaded_images_are_served_with_strict_headers(client):
    filename = f"security-image-{uuid4().hex[:8]}.png"
    target = main.EXERCISE_UPLOADS_DIR / filename
    target.write_bytes(PNG_BYTES)
    try:
        response = client.get(f"/api/uploads/exercises/{filename}")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("image/png")
        assert response.headers["x-content-type-options"] == "nosniff"
        assert "content-disposition" not in response.headers
    finally:
        target.unlink(missing_ok=True)


def test_uploaded_image_routes_reject_unexpected_extensions(client):
    filename = f"security-image-{uuid4().hex[:8]}.html"
    target = main.EXERCISE_UPLOADS_DIR / filename
    target.write_text("<script>alert(1)</script>", encoding="utf-8")
    try:
        response = client.get(f"/api/uploads/exercises/{filename}")
        assert response.status_code == 404
    finally:
        target.unlink(missing_ok=True)
