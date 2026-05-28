from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlparse

from app import main


def test_strava_connect_callback_links_account_to_current_user(monkeypatch, client):
    monkeypatch.setattr(main, "STRAVA_CLIENT_ID", "client-id")
    monkeypatch.setattr(main, "STRAVA_CLIENT_SECRET", "client-secret")
    monkeypatch.setattr(main, "STRAVA_REDIRECT_URI", "http://testserver/api/strava/callback")

    created = client.post("/api/strava/connect")
    assert created.status_code == 200, created.text
    query = parse_qs(urlparse(created.json()["authorization_url"]).query)
    state = query["state"][0]

    monkeypatch.setattr(
        main,
        "exchange_strava_code",
        lambda code: {
            "access_token": "access",
            "refresh_token": "refresh",
            "expires_at": int((datetime.now(timezone.utc) + timedelta(hours=5)).timestamp()),
            "scope": "activity:read",
            "athlete": {"id": 12345, "firstname": "Ada", "lastname": "Runner"},
        },
    )

    callback = client.get(f"/api/strava/callback?code=oauth-code&state={state}", follow_redirects=False)
    assert callback.status_code == 307

    status_response = client.get("/api/strava/status")
    assert status_response.status_code == 200
    assert status_response.json()["connected"] is True
    assert status_response.json()["athlete_id"] == "12345"
    assert status_response.json()["athlete_name"] == "Ada Runner"


def test_strava_preview_and_import_deduplicates_activities(monkeypatch, client):
    db = main.SessionLocal()
    try:
        db.add(
            main.StravaConnectionModel(
                username="admin",
                strava_athlete_id="12345",
                athlete_name="Ada Runner",
                access_token="access",
                refresh_token="refresh",
                expires_at=int((datetime.now(timezone.utc) + timedelta(hours=5)).timestamp()),
                scopes="activity:read",
                created_at=datetime.now(timezone.utc).isoformat(),
                updated_at=datetime.now(timezone.utc).isoformat(),
            )
        )
        db.commit()
    finally:
        db.close()

    summary_activity = {
        "id": 999,
        "name": "Lunch Run",
        "sport_type": "Run",
        "start_date_local": "2026-05-27T12:00:00",
        "elapsed_time": 1800,
        "distance": 5000,
        "total_elevation_gain": 120,
    }
    detailed_activity = {
        **summary_activity,
        "average_heartrate": 145,
        "max_heartrate": 170,
        "calories": 420,
    }

    def fake_strava_api_get(_db, _connection, path, query=None):
        if path == "/athlete/activities":
            return [summary_activity]
        if path == "/activities/999":
            return detailed_activity
        raise AssertionError(path)

    monkeypatch.setattr(main, "strava_api_get", fake_strava_api_get)

    preview = client.get("/api/strava/activities?after=2026-05-01&before=2026-05-28")
    assert preview.status_code == 200, preview.text
    assert preview.json()["activities"][0]["activity_type"] == "course_a_pied"
    assert preview.json()["activities"][0]["existing"] is None

    imported = client.post("/api/strava/import", json={"activity_ids": ["999"]})
    assert imported.status_code == 200, imported.text
    assert len(imported.json()["imported"]) == 1

    loaded = client.get("/api/session/2026-05-27")
    activity = loaded.json()["activities"][0]
    assert activity["title"] == "Lunch Run"
    assert activity["activity_type"] == "course_a_pied"
    assert activity["source_files"][0]["provider"] == "Strava"
    assert activity["source_files"][0]["parsed"]["strava_activity_id"] == "999"

    duplicate = client.post("/api/strava/import", json={"activity_ids": ["999"]})
    assert duplicate.status_code == 200, duplicate.text
    assert duplicate.json()["imported"] == []
    assert duplicate.json()["skipped"] == ["999"]
