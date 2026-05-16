from io import BytesIO

from app import main


def create_exercise(client, name, **overrides):
    payload = {
        "name": name,
        "display_name": name.replace("_", " ").title(),
        "category": "strength",
        "movement_family": "",
        "tracking_mode": "reps_weight",
        "weight_unit": "kg",
    }
    payload.update(overrides)
    response = client.post("/api/exercises", json=payload)
    assert response.status_code == 200, response.text
    return response.json()["exercise"]


def test_exercise_categories_and_family_are_normalized(client):
    exercise = create_exercise(
        client,
        "front_squat",
        category="strength, legs",
        movement_family="squat",
    )

    assert exercise["categories"] == ["legs", "strength"]
    assert exercise["category"] == "legs, strength"
    assert exercise["movement_family"] == "squat"

    db = main.SessionLocal()
    try:
        assert db.query(main.ExerciseCategoryModel).count() == 2
        assert db.query(main.ExerciseCategoryLinkModel).filter_by(exercise_name="front_squat").count() == 2
        assert db.query(main.ExerciseMovementFamilyModel).filter_by(name="squat").count() == 1
        assert db.query(main.ExerciseMovementFamilyLinkModel).filter_by(exercise_name="front_squat", family_name="squat").count() == 1
    finally:
        db.close()


def test_upload_set_primary_and_delete_exercise_image(client):
    create_exercise(client, "bench_press")

    first = client.post(
        "/api/exercises/bench_press/upload-image",
        files={"image_file": ("first.png", BytesIO(b"first image"), "image/png")},
    )
    assert first.status_code == 200, first.text
    first_url = first.json()["image_url"]

    second = client.post(
        "/api/exercises/bench_press/upload-image",
        files={"image_file": ("second.jpg", BytesIO(b"second image"), "image/jpeg")},
    )
    assert second.status_code == 200, second.text
    second_url = second.json()["image_url"]
    assert second.json()["exercise"]["images"][:2] == [second_url, first_url]

    primary = client.post("/api/exercises/bench_press/set-primary-image", json={"image_url": first_url})
    assert primary.status_code == 200, primary.text
    assert primary.json()["exercise"]["image"] == first_url
    assert primary.json()["exercise"]["images"][:2] == [first_url, second_url]

    deleted = client.post("/api/exercises/bench_press/delete-image", json={"image_url": first_url})
    assert deleted.status_code == 200, deleted.text
    assert deleted.json()["exercise"]["image"] == second_url
    assert first_url not in deleted.json()["exercise"]["images"]
    assert main.resolve_uploaded_exercise_path(first_url).exists() is False


def test_merge_exercise_moves_references_and_deletes_source(client):
    create_exercise(client, "back_squat", category="legs", image="/external/back.png")
    create_exercise(client, "squat", category="strength", image="/external/squat.png")

    db = main.SessionLocal()
    try:
        db.add(
            main.SessionModel(
                username="admin",
                date="2026-05-17",
                data='{"exercises":["back_squat"],"performed_items":[{"exercise_name":"back_squat"}]}',
            )
        )
        db.commit()
    finally:
        db.close()

    response = client.post("/api/exercises/back_squat/merge-into", json={"target_name": "squat"})
    assert response.status_code == 200, response.text
    exercise = response.json()["exercise"]
    assert exercise["name"] == "squat"
    assert set(exercise["categories"]) == {"legs", "strength"}
    assert exercise["images"] == ["/external/squat.png", "/external/back.png"]

    exercises = client.get("/api/exercises").json()
    assert {item["name"] for item in exercises} == {"squat"}

    db = main.SessionLocal()
    try:
        session = db.query(main.SessionModel).filter_by(date="2026-05-17").first()
        assert "back_squat" not in session.data
        assert "squat" in session.data
    finally:
        db.close()


def test_delete_exercise_requires_admin_override_and_removes_taxonomy(client):
    create_exercise(client, "deadlift", category="hinge, strength", movement_family="deadlift")

    response = client.delete("/api/exercises/deadlift")
    assert response.status_code == 200, response.text

    db = main.SessionLocal()
    try:
        assert db.query(main.ExerciseModel).filter_by(name="deadlift").first() is None
        assert db.query(main.ExerciseCategoryLinkModel).filter_by(exercise_name="deadlift").count() == 0
        assert db.query(main.ExerciseMovementFamilyLinkModel).filter_by(exercise_name="deadlift").count() == 0
    finally:
        db.close()
