import json
from uuid import uuid4

from app import main


def test_saving_session_updates_existing_row_for_same_user_and_date(client):
    first = client.post(
        "/api/session/2026-06-01",
        json={"activities": [{"title": "First ride", "activity_type": "velo"}]},
    )
    assert first.status_code == 200, first.text

    second = client.post(
        "/api/session/2026-06-01",
        json={"activities": [{"title": "Second ride", "activity_type": "velo", "load": 42}]},
    )
    assert second.status_code == 200, second.text

    loaded = client.get("/api/session/2026-06-01")
    assert loaded.status_code == 200, loaded.text
    payload = loaded.json()
    assert payload["activity_count"] == 1
    assert payload["activities"][0]["title"] == "Second ride"
    assert payload["activities"][0]["load"] == 42

    db = main.SessionLocal()
    try:
        assert db.query(main.SessionModel).filter_by(username="admin", date="2026-06-01").count() == 1
    finally:
        db.close()


def test_sessions_are_isolated_by_username(client):
    other_username = f"other-session-user-{uuid4().hex[:8]}"
    db = main.SessionLocal()
    try:
        salt, password_hash = main.build_password_record("correct-password")
        db.add(
            main.UserModel(
                username=other_username,
                password_hash=password_hash,
                password_salt=salt,
                is_admin=False,
                language="en",
            )
        )
        db.flush()
        db.add(
            main.SessionModel(
                username=other_username,
                date="2026-06-02",
                data=json.dumps({"activities": [{"title": "Other user ride", "activity_type": "velo"}]}),
            )
        )
        db.commit()
    finally:
        db.close()

    saved = client.post(
        "/api/session/2026-06-02",
        json={"activities": [{"title": "Admin ride", "activity_type": "velo"}]},
    )
    assert saved.status_code == 200, saved.text

    loaded = client.get("/api/session/2026-06-02")
    assert loaded.status_code == 200, loaded.text
    assert loaded.json()["activities"][0]["title"] == "Admin ride"

    db = main.SessionLocal()
    try:
        assert db.query(main.SessionModel).filter_by(date="2026-06-02").count() == 2
        other = db.query(main.SessionModel).filter_by(username=other_username, date="2026-06-02").first()
        assert other is not None
        assert json.loads(other.data)["activities"][0]["title"] == "Other user ride"
    finally:
        db.close()


def test_calendar_activity_entries_include_performed_exercise_image(client):
    db = main.SessionLocal()
    try:
        db.add(
            main.ExerciseModel(
                name="image_test_squat",
                display_name="Image Test Squat",
                display_name_fr="Image Test Squat",
                display_name_en="Image Test Squat",
                category="strength",
                movement_family="squat",
                variant_label="",
                tracking_mode="reps_weight",
                weight_unit="kg",
                description="",
                link="",
                image="/api/uploads/exercises/image-test-squat.jpg",
                images_json=json.dumps(["/api/uploads/exercises/image-test-squat.jpg"]),
                document="",
            )
        )
        db.commit()
    finally:
        db.close()

    saved = client.post(
        "/api/session/2026-06-03",
        json={
            "activities": [
                {
                    "activity_type": "musculation",
                    "performed_items": [{"exercise_name": "image_test_squat", "sets": [{"reps": 5, "weight": 80}]}],
                }
            ]
        },
    )
    assert saved.status_code == 200, saved.text

    calendar = client.get("/api/calendar?start_date=2026-06-03&end_date=2026-06-03")
    assert calendar.status_code == 200, calendar.text
    entries = calendar.json()[0]["activity_entries"]
    assert entries[0]["exercise_image"] == "/api/uploads/exercises/image-test-squat.jpg"


def test_calendar_does_not_show_type_only_strength_activity(client):
    saved = client.post(
        "/api/session/2026-06-04",
        json={"activities": [{"activity_type": "musculation"}]},
    )
    assert saved.status_code == 200, saved.text

    calendar = client.get("/api/calendar?start_date=2026-06-04&end_date=2026-06-04")
    assert calendar.status_code == 200, calendar.text
    row = calendar.json()[0]
    assert row["activity_count"] == 0
    assert row["activity_entries"] == []
    assert row["activity_types"] == []
