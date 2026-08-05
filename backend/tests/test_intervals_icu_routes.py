import base64

from app import main


def sample_activity():
    return {
        "id": "i12345",
        "name": "Morning Ride",
        "type": "Ride",
        "start_date_local": "2026-07-21T07:30:00",
        "moving_time": 3600,
        "distance": 30000,
        "icu_elevation_gain": 420,
        "icu_average_watts": 180,
        "average_hr": 138,
    }


def test_intervals_icu_basic_auth_uses_literal_api_key_username(monkeypatch):
    monkeypatch.setattr(main, "INTERVALS_ICU_API_KEY", "secret-value")
    captured = {}

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def read(self):
            return b"[]"

    def fake_urlopen(request, timeout):
        captured["authorization"] = request.headers["Authorization"]
        captured["user_agent"] = request.headers["User-agent"]
        captured["url"] = request.full_url
        captured["timeout"] = timeout
        return Response()

    monkeypatch.setattr(main, "urlopen", fake_urlopen)
    assert main.intervals_icu_api_get("/athlete/0/activities", {"oldest": "2026-07-01", "newest": "2026-07-31"}) == []
    encoded = captured["authorization"].removeprefix("Basic ")
    assert base64.b64decode(encoded).decode() == "API_KEY:secret-value"
    assert captured["user_agent"] == "RehabTracker/1.0 (+https://go.foudefun.ch)"
    assert "oldest=2026-07-01" in captured["url"]
    assert captured["timeout"] == 30


def test_intervals_icu_preview_and_import_deduplicates(monkeypatch, client):
    monkeypatch.setattr(main, "INTERVALS_ICU_API_KEY", "secret-value")
    monkeypatch.setattr(main, "INTERVALS_ICU_ATHLETE_ID", "0")
    activity = sample_activity()

    def fake_get(path, query=None, username=""):
        assert username == "admin"
        if path == "/athlete/0/activities":
            assert query == {"oldest": "2026-07-01", "newest": "2026-07-31"}
            return [activity]
        if path == "/athlete/0/activities/i12345":
            return [activity]
        if path == "/activity/i12345/streams.json":
            assert query["types"].startswith("time,distance,heartrate")
            return [
                {"type": "time", "data": [0, 5, 10]},
                {"type": "distance", "data": [0, 25, 55]},
                {"type": "heartrate", "data": [120, 125, 130]},
                {"type": "watts", "data": [150, 180, 200]},
                {"type": "velocity_smooth", "data": [5, 5.2, 5.4]},
            ]
        raise AssertionError(path)

    monkeypatch.setattr(main, "intervals_icu_api_get", fake_get)

    status = client.get("/api/intervals-icu/status")
    assert status.status_code == 200
    assert status.json()["configured"] is True
    assert status.json()["connected"] is True
    assert status.json()["athlete_id"] == "0"
    assert status.json()["managed_by_environment"] is True
    assert status.json()["auto_sync_enabled"] is True

    preview = client.get("/api/intervals-icu/activities?oldest=2026-07-01&newest=2026-07-31")
    assert preview.status_code == 200, preview.text
    assert preview.json()["activities"][0]["activity_type"] == "velo"
    assert preview.json()["activities"][0]["distance_km"] == 30.0

    imported = client.post("/api/intervals-icu/import", json={"activity_ids": ["i12345"]})
    assert imported.status_code == 200, imported.text
    assert len(imported.json()["imported"]) == 1

    loaded = client.get("/api/session/2026-07-21")
    saved = loaded.json()["activities"][0]
    assert saved["title"] == "Morning Ride"
    assert saved["source_files"][0]["provider"] == "Intervals.icu"
    assert saved["source_files"][0]["parsed"]["intervals_icu_activity_id"] == "i12345"
    assert saved["source_files"][0]["series"]["points"][1] == {
        "t": 5,
        "power": 180.0,
        "hr": 125.0,
        "distance_m": 25.0,
        "speed_mps": 5.2,
    }

    duplicate = client.post("/api/intervals-icu/import", json={"activity_ids": ["i12345"]})
    assert duplicate.status_code == 200
    assert duplicate.json()["imported"] == []
    assert len(duplicate.json()["skipped"]) == 1


def test_intervals_icu_streams_to_series_ignores_unknown_streams():
    series = main.intervals_icu_streams_to_series([
        {"type": "time", "data": [0, 2]},
        {"type": "altitude", "data": [400.5, 401.5]},
        {"type": "latlng", "data": [[46.2, 6.1], [46.21, 6.11]]},
        {"type": "unknown", "data": [99, 100]},
    ])
    assert series["sample_interval_seconds"] == 2
    assert series["points"][1] == {"t": 2, "altitude_m": 401.5, "lat": 46.21, "lon": 6.11}


def test_user_can_save_encrypted_connection_without_key_disclosure(monkeypatch, client):
    monkeypatch.setattr(main, "INTERVALS_ICU_API_KEY", "")
    cipher = main.Fernet(main.Fernet.generate_key())
    monkeypatch.setattr(main, "get_intervals_icu_cipher", lambda: cipher)

    saved = client.put("/api/intervals-icu/connection", json={"api_key": "personal-secret-key", "athlete_id": "0"})
    assert saved.status_code == 200, saved.text
    assert "api_key" not in saved.json()

    db = main.SessionLocal()
    try:
        row = db.query(main.IntervalsIcuConnectionModel).filter_by(username="admin").one()
        assert row.encrypted_api_key != "personal-secret-key"
        assert main.decrypt_intervals_icu_api_key(row.encrypted_api_key) == "personal-secret-key"
    finally:
        db.close()

    status = client.get("/api/intervals-icu/status")
    assert status.status_code == 200
    assert status.json()["connected"] is True
    assert "api_key" not in status.json()
