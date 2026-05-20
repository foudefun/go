from io import BytesIO

from app import main

PNG_BYTES = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR"
JPEG_BYTES = b"\xff\xd8\xff\xe0\x00\x10JFIF\x00"


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


def test_exercise_muscle_links_are_saved_updated_and_serialized(client):
    exercise = create_exercise(
        client,
        "bench_press",
        primary_muscles=["pectoralis_major", "triceps brachii"],
        secondary_muscles="anterior deltoid",
        stabilizers=["rotator_cuff"],
        muscle_notes_fr="Pectoraux dominants, triceps en fin de poussee.",
        muscle_notes_en="Chest dominant, triceps finish the press.",
    )

    assert exercise["primary_muscles"] == ["pectoralis_major", "triceps_brachii"]
    assert exercise["secondary_muscles"] == ["anterior_deltoid"]
    assert exercise["stabilizers"] == ["rotator_cuff"]
    assert {item["role"] for item in exercise["muscles"]} == {"primary", "secondary", "stabilizer"}
    assert exercise["muscle_notes_fr"] == "Pectoraux dominants, triceps en fin de poussee."
    assert exercise["muscle_notes_en"] == "Chest dominant, triceps finish the press."

    updated = client.put(
        "/api/exercises/bench_press",
        json={
            **exercise,
            "primary_muscles": ["pectoralis_major"],
            "secondary_muscles": [],
            "stabilizers": "serratus anterior",
            "muscle_notes_en": "Updated note.",
        },
    )
    assert updated.status_code == 200, updated.text
    updated_exercise = updated.json()["exercise"]
    assert updated_exercise["primary_muscles"] == ["pectoralis_major"]
    assert updated_exercise["secondary_muscles"] == []
    assert updated_exercise["stabilizers"] == ["serratus_anterior"]
    assert updated_exercise["muscle_notes_en"] == "Updated note."

    db = main.SessionLocal()
    try:
        assert db.query(main.MuscleModel).filter_by(name="serratus_anterior").first() is not None
        assert db.query(main.ExerciseMuscleLinkModel).filter_by(exercise_name="bench_press").count() == 2
    finally:
        db.close()


def test_exercise_muscle_profile_seed_fills_common_existing_exercises(client):
    create_exercise(client, "seated_row", category="back", display_name_en="Seated Rows")

    main.seed_exercise_muscle_profiles()

    response = client.get("/api/exercises")
    assert response.status_code == 200, response.text
    exercise = next(item for item in response.json() if item["name"] == "seated_row")
    assert set(exercise["primary_muscles"]) == {"latissimus_dorsi", "rhomboids"}
    assert "posterior_deltoid" in exercise["secondary_muscles"]
    assert exercise["muscle_notes_en"].startswith("Horizontal pull")

    updated = client.put(
        "/api/exercises/seated_row",
        json={
            **exercise,
            "primary_muscles": ["biceps_brachii"],
            "muscle_notes_en": "Manual override.",
        },
    )
    assert updated.status_code == 200, updated.text

    main.seed_exercise_muscle_profiles()
    exercise = next(item for item in client.get("/api/exercises").json() if item["name"] == "seated_row")
    assert exercise["primary_muscles"] == ["biceps_brachii"]
    assert exercise["muscle_notes_en"] == "Manual override."


def test_upload_set_primary_and_delete_exercise_image(client):
    create_exercise(client, "bench_press")

    first = client.post(
        "/api/exercises/bench_press/upload-image",
        files={"image_file": ("first.png", BytesIO(PNG_BYTES), "image/png")},
    )
    assert first.status_code == 200, first.text
    first_url = first.json()["image_url"]

    second = client.post(
        "/api/exercises/bench_press/upload-image",
        files={"image_file": ("second.jpg", BytesIO(JPEG_BYTES), "image/jpeg")},
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
    create_exercise(client, "back_squat", category="legs", image="/external/back.png", primary_muscles=["quadriceps"])
    create_exercise(client, "squat", category="strength", image="/external/squat.png", primary_muscles=["gluteus_maximus"])

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
    assert set(exercise["primary_muscles"]) == {"gluteus_maximus", "quadriceps"}

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
    create_exercise(client, "deadlift", category="hinge, strength", movement_family="deadlift", primary_muscles=["hamstrings"])

    response = client.delete("/api/exercises/deadlift")
    assert response.status_code == 200, response.text

    db = main.SessionLocal()
    try:
        assert db.query(main.ExerciseModel).filter_by(name="deadlift").first() is None
        assert db.query(main.ExerciseCategoryLinkModel).filter_by(exercise_name="deadlift").count() == 0
        assert db.query(main.ExerciseMovementFamilyLinkModel).filter_by(exercise_name="deadlift").count() == 0
        assert db.query(main.ExerciseMuscleLinkModel).filter_by(exercise_name="deadlift").count() == 0
    finally:
        db.close()
