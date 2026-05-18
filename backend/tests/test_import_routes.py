import json
from io import BytesIO

from app import main


def gpx_payload():
    return b"""<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="pytest">
  <trk>
    <name>Morning ride</name>
    <trkseg>
      <trkpt lat="46.0000" lon="6.0000">
        <time>2026-06-05T08:00:00Z</time>
        <extensions><hr>120</hr><power>180</power><cad>82</cad></extensions>
      </trkpt>
      <trkpt lat="46.0010" lon="6.0010">
        <time>2026-06-05T08:20:00Z</time>
        <extensions><hr>140</hr><power>220</power><cad>88</cad></extensions>
      </trkpt>
    </trkseg>
  </trk>
</gpx>"""


def test_json_program_import_creates_and_updates_exercises_and_sessions(client):
    first_payload = {
        "exercises": [
            {
                "name": "step_up",
                "display_name_fr": "Montee sur banc",
                "display_name_en": "Step-up",
                "category": "strength",
                "tracking_mode": "reps_weight",
            }
        ],
        "planned_sessions": [
            {
                "date": "2026-06-03",
                "title": "Strength plan",
                "items": [{"exercise_name": "step_up", "sets": 3, "reps": 8}],
            }
        ],
    }

    first = client.post("/api/import/program", json={"format": "json", "content": json.dumps(first_payload)})
    assert first.status_code == 200, first.text
    assert first.json()["created_exercises"] == 1
    assert first.json()["updated_exercises"] == 0
    assert first.json()["imported_sessions"] == 1

    second_payload = dict(first_payload)
    second_payload["exercises"] = [{**first_payload["exercises"][0], "display_name_en": "Bench step-up"}]
    second = client.post("/api/import/program", json={"format": "json", "content": json.dumps(second_payload)})
    assert second.status_code == 200, second.text
    assert second.json()["created_exercises"] == 0
    assert second.json()["updated_exercises"] == 1
    assert second.json()["imported_sessions"] == 1

    db = main.SessionLocal()
    try:
        exercise = db.query(main.ExerciseModel).filter_by(name="step_up").one()
        assert exercise.display_name_en == "Bench step-up"
        session = db.query(main.SessionModel).filter_by(username="admin", date="2026-06-03").one()
        session_data = json.loads(session.data)
        assert session_data["plan_title"] == "Strength plan"
        assert session_data["planned_items"][0]["exercise_name"] == "step_up"
        assert db.query(main.AuditLogModel).filter_by(action="import_program", username="admin").count() == 2
    finally:
        db.close()


def test_schedule_csv_import_groups_rows_into_one_session(client):
    csv_content = "\n".join(
        [
            "date,title,exercise_name,sets,reps,item_notes",
            "2026-06-04,Strength day,squat,3,5,Main work",
            "2026-06-04,Strength day,lunge,2,10,Accessory",
        ]
    )

    response = client.post("/api/import/program", json={"format": "schedule_csv", "content": csv_content})
    assert response.status_code == 200, response.text
    assert response.json()["imported_sessions"] == 1

    loaded = client.get("/api/session/2026-06-04")
    assert loaded.status_code == 200, loaded.text
    assert loaded.json()["plan_title"] == "Strength day"
    assert [item["exercise_name"] for item in loaded.json()["planned_items"]] == ["squat", "lunge"]


def test_activity_file_import_appends_activity_and_audits_import(client):
    response = client.post(
        "/api/import/activity-file",
        data={"format": "gpx", "date_override": "2026-06-06", "title": "Imported MyWhoosh ride"},
        files={"file": ("mywhoosh.gpx", BytesIO(gpx_payload()), "application/gpx+xml")},
    )
    assert response.status_code == 200, response.text
    assert response.json()["imported_date"] == "2026-06-06"
    assert response.json()["activity_index"] == 0
    assert response.json()["detected_format"] == "gpx"

    loaded = client.get("/api/session/2026-06-06")
    assert loaded.status_code == 200, loaded.text
    activity = loaded.json()["activities"][0]
    assert activity["title"] == "Imported MyWhoosh ride"
    assert activity["activity_type"] == "velo"
    assert "00:20:00" in activity["activity_details"]

    db = main.SessionLocal()
    try:
        assert db.query(main.AuditLogModel).filter_by(action="import_activity_file", username="admin").count() == 1
    finally:
        db.close()


def test_import_program_rejects_invalid_schedule_csv_date(client):
    csv_content = "\n".join(
        [
            "date,title,exercise_name,sets,reps",
            "not-a-date,Strength day,squat,3,5",
        ]
    )

    response = client.post("/api/import/program", json={"format": "schedule_csv", "content": csv_content})

    assert response.status_code == 400
    assert "Invalid date in schedule CSV" in response.json()["detail"]
