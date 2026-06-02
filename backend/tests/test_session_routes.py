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


def test_activity_cleanup_groups_duplicate_source_ids(client):
    source = {
        "id": "strava-export-123",
        "provider": "Strava Export",
        "filename": "123.fit.gz",
        "parsed": {"strava_activity_id": "123"},
        "metrics": {"duration": {"seconds": 1800}, "distance": {"km": 8.2}},
    }
    saved = client.post(
        "/api/session/2026-06-06",
        json={
            "activities": [
                {"title": "Morning run", "activity_type": "course_a_pied", "source_files": [source]},
                {"title": "Morning run duplicate", "activity_type": "course_a_pied", "source_files": [{**source, "id": "strava-export-123-copy"}]},
            ]
        },
    )
    assert saved.status_code == 200, saved.text

    cleanup = client.get("/api/activity-cleanup/duplicates")
    assert cleanup.status_code == 200, cleanup.text
    payload = cleanup.json()
    assert payload["activities_scanned"] == 2
    groups = payload["duplicate_groups"]
    strava_group = next(group for group in groups if group["reason"] == "Same Strava activity id")
    assert len(strava_group["activities"]) == 2
    assert {activity["index"] for activity in strava_group["activities"]} == {0, 1}


def test_activity_cleanup_merges_selected_duplicates(client):
    source = {
        "id": "strava-export-456",
        "provider": "Strava Export",
        "filename": "456.fit.gz",
        "parsed": {"strava_activity_id": "456"},
        "metrics": {"duration": {"seconds": 2400}, "distance": {"km": 12.4}},
    }
    saved = client.post(
        "/api/session/2026-06-07",
        json={
            "activities": [
                {
                    "title": "Morning ride",
                    "activity_type": "velo",
                    "activity_details": "Import Strava export",
                    "source_files": [source],
                },
                {
                    "title": "Morning ride copy",
                    "activity_type": "velo",
                    "note": "Keep this note",
                    "source_files": [{**source, "id": "strava-export-456-copy"}],
                },
            ]
        },
    )
    assert saved.status_code == 200, saved.text

    merged = client.post(
        "/api/activity-cleanup/merge",
        json={"keeper": {"date": "2026-06-07", "index": 0}, "sources": [{"date": "2026-06-07", "index": 1}]},
    )
    assert merged.status_code == 200, merged.text
    assert merged.json()["merged_count"] == 1

    loaded = client.get("/api/session/2026-06-07")
    assert loaded.status_code == 200, loaded.text
    activities = loaded.json()["activities"]
    assert len(activities) == 1
    activity = activities[0]
    assert activity["title"] == "Morning ride\nMorning ride copy"
    assert activity["note"] == "Keep this note"
    assert len(activity["source_files"]) == 2

    cleanup = client.get("/api/activity-cleanup/duplicates")
    assert cleanup.status_code == 200, cleanup.text
    matching_groups = [
        group
        for group in cleanup.json()["duplicate_groups"]
        if any(activity["date"] == "2026-06-07" for activity in group["activities"])
    ]
    assert matching_groups == []


def test_import_history_returns_batch_summary(client):
    db = main.SessionLocal()
    try:
        main.create_import_batch_record(
            db,
            "admin",
            "strava_export_upload",
            {
                "imported": [
                    {
                        "filename": "ride.fit.gz",
                        "date": "2026-06-08",
                        "activity_index": 0,
                        "activity_type": "velo",
                        "summary": "Velo | Distance 12 km",
                    },
                    {
                        "filename": "unknown.fit.gz",
                        "date": "2026-06-09",
                        "activity_index": 1,
                        "activity_type": "other",
                    },
                ],
                "skipped": [{"filename": "duplicate.fit.gz", "date": "2026-06-08"}],
                "errors": [{"filename": "broken.fit.gz", "detail": "Could not parse"}],
            },
        )
        db.commit()
    finally:
        db.close()

    history = client.get("/api/import/history")
    assert history.status_code == 200, history.text
    batches = history.json()["batches"]
    assert len(batches) == 1
    batch = batches[0]
    assert batch["source"] == "strava_export_upload"
    assert batch["status"] == "needs_review"
    assert batch["summary"] == {"imported": 2, "skipped": 1, "errors": 1, "other": 1}
    assert [item["status"] for item in batch["items"]] == ["imported", "imported", "skipped", "error"]


def test_session_preserves_indoor_climbing_route_attempt_details(client):
    saved = client.post(
        "/api/session/2026-06-05",
        json={
            "activities": [
                {
                    "title": "Gym routes",
                    "activity_type": "indoor_climbing",
                    "climbing_routes": [
                        {
                            "name": "Blue slab",
                            "difficulty": "6a+",
                            "rope_style": "auto belay",
                            "ascent_style": "with rests",
                            "rest_count": "2",
                            "notes": "Fell low, finished clean",
                        },
                        {
                            "name": "Orange overhang",
                            "topo_grade": "6c",
                            "rope_style": "lead",
                            "ascent_style": "a_vue",
                        },
                    ],
                }
            ]
        },
    )
    assert saved.status_code == 200, saved.text

    loaded = client.get("/api/session/2026-06-05")
    assert loaded.status_code == 200, loaded.text
    activity = loaded.json()["activities"][0]
    assert activity["activity_type"] == "indoor_climbing"
    assert activity["climbing_routes"] == [
        {
            "name": "Blue slab",
            "topo_grade": "6a+",
            "rope_style": "auto_belay",
            "ascent_style": "with_rests",
            "notes": "Fell low, finished clean",
            "rest_count": 2,
        },
        {
            "name": "Orange overhang",
            "topo_grade": "6c",
            "rope_style": "lead",
            "ascent_style": "onsight",
        },
    ]
