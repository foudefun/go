from app import main
from app.hangboard import BEASTMAKER_1000_HOLDS
from app.hangboard_prescriptions import BEASTMAKER_1000_EXERCISE_PRESCRIPTIONS


VALID_HOLD_SLUGS = {hold["slug"] for hold in BEASTMAKER_1000_HOLDS}


def test_hangboard_generate_reduces_to_maintenance_when_pain_is_high(client):
    response = client.post(
        "/api/hangboard/generate",
        json={
            "level": "7A",
            "focus": "max_strength",
            "sessionLength": "hard",
            "loadMode": "added_weight",
            "calibration": {"previousPainScore": 3, "recentFailureRate": 0},
        },
    )

    assert response.status_code == 200, response.text
    workout = response.json()["workout"]
    assert workout["focus"] == "maintenance"
    assert any("recovery maintenance" in warning for warning in workout["warnings"])
    assert workout["difficultyNote"].startswith("Selected level controls workout difficulty")
    assert "holdId" not in workout["steps"][0]
    assert all(slug in VALID_HOLD_SLUGS for step in workout["steps"] for slug in step.get("holdSlugs", []))
    assert all(exercise["cardImageUrl"].startswith("/assets/hangboard/beastmaker1000/cards/") for exercise in workout["exercises"])
    assert all(exercise["prescriptionId"] for exercise in workout["exercises"])
    assert all(exercise["coachingCue"] for exercise in workout["exercises"])


def test_hangboard_complete_is_user_owned_and_adds_activity_history(client):
    created = client.post(
        "/api/hangboard/sessions",
        json={"date": "2026-06-08", "level": "6A", "focus": "strength_endurance"},
    )
    assert created.status_code == 200, created.text
    session = created.json()["session"]

    db = main.SessionLocal()
    try:
        if not db.query(main.UserModel).filter_by(username="member").first():
            salt, password_hash = main.build_password_record("correct-password")
            db.add(main.UserModel(username="member", password_hash=password_hash, password_salt=salt, is_admin=False, language="en"))
            db.commit()
    finally:
        db.close()

    main.app.dependency_overrides[main.get_current_user] = lambda: main.UserModel(
        username="member",
        password_hash="",
        password_salt="",
        is_admin=False,
        language="en",
    )
    denied = client.post(
        f"/api/hangboard/sessions/{session['id']}/complete",
        json={"completedReps": 1, "failedReps": 0, "averageRpe": 7, "painScore": 0},
    )
    assert denied.status_code == 404, denied.text

    main.app.dependency_overrides[main.get_current_user] = lambda: main.UserModel(
        username="admin",
        password_hash="",
        password_salt="",
        is_admin=True,
        language="en",
    )
    completed = client.post(
        f"/api/hangboard/sessions/{session['id']}/complete",
        json={"completedReps": 24, "failedReps": 0, "averageRpe": 7, "painScore": 0},
    )
    assert completed.status_code == 200, completed.text
    assert completed.json()["recommendation"]["direction"] == "hold"

    calendar = client.get("/api/calendar?start_date=2026-06-08&end_date=2026-06-08")
    assert calendar.status_code == 200, calendar.text
    row = calendar.json()[0]
    assert row["activity_count"] == 1
    assert row["activity_entries"][0]["activity_type"] == "hangboard"
    assert row["activity_entries"][0]["hangboard_session_id"] == session["id"]

    db = main.SessionLocal()
    try:
        assert db.query(main.HangboardSessionModel).filter_by(username="admin").count() == 1
        assert db.query(main.HangboardSessionModel).filter_by(username="member").count() == 0
    finally:
        db.close()


def test_hangboard_recommends_advancing_after_two_clean_sessions(client):
    first = client.post(
        "/api/hangboard/sessions",
        json={"date": "2026-06-09", "level": "6A", "focus": "strength_endurance", "sessionLength": "short"},
    ).json()["session"]
    total_hangs = len([step for step in first["workout"]["steps"] if step["type"] == "hang"])
    first_done = client.post(
        f"/api/hangboard/sessions/{first['id']}/complete",
        json={"completedReps": total_hangs, "failedReps": 0, "averageRpe": 7, "painScore": 0},
    )
    assert first_done.status_code == 200, first_done.text

    second = client.post(
        "/api/hangboard/sessions",
        json={"date": "2026-06-12", "level": "6A", "focus": "strength_endurance", "sessionLength": "short"},
    ).json()["session"]
    total_hangs = len([step for step in second["workout"]["steps"] if step["type"] == "hang"])
    second_done = client.post(
        f"/api/hangboard/sessions/{second['id']}/complete",
        json={"completedReps": total_hangs, "failedReps": 0, "averageRpe": 7, "painScore": 0},
    )
    assert second_done.status_code == 200, second_done.text
    assert second_done.json()["recommendation"]["direction"] == "advance"
    assert "short to normal" in second_done.json()["recommendation"]["action"]


def test_beastmaker_1000_hold_slugs_are_unique_and_center_hold_is_single():
    slugs = [hold["slug"] for hold in BEASTMAKER_1000_HOLDS]
    assert len(slugs) == len(set(slugs))
    center = [hold for hold in BEASTMAKER_1000_HOLDS if hold["slug"] == "very_deep_4_finger_center"]
    assert len(center) == 1
    assert center[0]["side"] == "center"
    assert center[0]["supportsBothHands"] is True
    assert "very_deep_4_finger_left" not in slugs
    assert "very_deep_4_finger_right" not in slugs


def test_generated_hangboard_exercises_reference_only_beastmaker_slugs(client):
    response = client.post(
        "/api/hangboard/generate",
        json={"level": "7A", "focus": "power_endurance", "sessionLength": "normal"},
    )
    assert response.status_code == 200, response.text
    workout = response.json()["workout"]
    assert workout["exercises"]
    assert all(slug in VALID_HOLD_SLUGS for exercise in workout["exercises"] for slug in exercise["holdSlugs"])
    assert all(exercise["cardImage"].endswith(".png") for exercise in workout["exercises"])
    assert not any(slug in {"jug", "deep_4f", "medium_4f", "sloper_easy"} for exercise in workout["exercises"] for slug in exercise["holdSlugs"])


def test_prescription_catalog_references_only_known_hold_slugs():
    assert len(BEASTMAKER_1000_EXERCISE_PRESCRIPTIONS) >= 30
    for prescription in BEASTMAKER_1000_EXERCISE_PRESCRIPTIONS:
        assert prescription["cardImage"].endswith(".png")
        assert prescription["coachingCue"]
        assert all(slug in VALID_HOLD_SLUGS for slug in prescription["holdSlugs"])
