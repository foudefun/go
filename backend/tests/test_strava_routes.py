from datetime import datetime, timedelta, timezone
import gzip
from urllib.parse import parse_qs, urlparse

from app import main


def test_strava_activity_type_mapping_keeps_new_sports_and_falls_back_to_other():
    assert main.normalize_strava_activity_type({"sport_type": "AlpineSki"}) == "alpine_ski"
    assert main.normalize_strava_activity_type({"sport_type": "Snowboard"}) == "snowboarding"
    assert main.normalize_strava_activity_type({"sport_type": "Surfing"}) == "surfing"
    assert main.normalize_strava_activity_type({"sport_type": "BackcountrySki"}) == "ski_touring"
    assert main.normalize_strava_activity_type({"sport_type": "MysterySport"}) == "other"

    preview = main.serialize_strava_activity({"id": 1, "name": "Mystery", "sport_type": "MysterySport"})
    assert preview["activity_type"] == "other"
    assert preview["requires_review"] is False


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


def test_local_strava_export_preview_and_import(monkeypatch, tmp_path, client):
    export_dir = tmp_path / "activities"
    export_dir.mkdir()
    gpx = b"""<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
 <trk>
  <name>Powder morning</name>
  <type>AlpineSki</type>
  <trkseg>
   <trkpt lat="46.0" lon="6.0"><ele>1200</ele><time>2026-01-02T08:00:00Z</time></trkpt>
   <trkpt lat="46.001" lon="6.001"><ele>1210</ele><time>2026-01-02T08:10:00Z</time></trkpt>
  </trkseg>
 </trk>
</gpx>"""
    unknown = gpx.replace(b"AlpineSki", b"MysterySport").replace(b"Powder morning", b"Mystery")
    (export_dir / "123456.gpx.gz").write_bytes(gzip.compress(gpx))
    (export_dir / "999999.gpx.gz").write_bytes(gzip.compress(unknown))
    monkeypatch.setattr(main, "STRAVA_EXPORT_DIR", str(export_dir))

    preview = client.get("/api/strava/export/preview?limit=10")
    assert preview.status_code == 200, preview.text
    activities = {activity["filename"]: activity for activity in preview.json()["activities"]}
    assert activities["123456.gpx.gz"]["activity_type"] == "alpine_ski"
    assert activities["123456.gpx.gz"]["requires_review"] is False
    assert activities["999999.gpx.gz"]["activity_type"] == "other"
    assert activities["999999.gpx.gz"]["requires_review"] is False

    imported = client.post("/api/strava/export/import", json={"filenames": ["123456.gpx.gz", "999999.gpx.gz"]})
    assert imported.status_code == 200, imported.text
    payload = imported.json()
    assert len(payload["imported"]) == 2
    assert payload["errors"] == []

    loaded = client.get("/api/session/2026-01-02")
    activities = loaded.json()["activities"]
    by_title = {activity["title"]: activity for activity in activities}
    assert by_title["Powder morning"]["activity_type"] == "alpine_ski"
    assert by_title["Powder morning"]["source_files"][0]["provider"] == "Strava Export"
    assert by_title["Powder morning"]["source_files"][0]["parsed"]["strava_activity_id"] == "123456"
    assert by_title["Mystery"]["activity_type"] == "other"

    duplicate = client.post("/api/strava/export/import", json={"filenames": ["123456.gpx.gz", "999999.gpx.gz"]})
    assert duplicate.status_code == 200, duplicate.text
    assert duplicate.json()["imported"] == []
    assert {item["strava_activity_id"] for item in duplicate.json()["skipped"]} == {"123456", "999999"}


def test_uploaded_strava_export_preview_and_import(client):
    gpx = b"""<?xml version="1.0" encoding="UTF-8"?>
<gpx creator="StravaGPX" version="1.1" xmlns="http://www.topografix.com/GPX/1/1">
 <trk>
  <name>Uploaded surf</name>
  <type>Surfing</type>
  <trkseg>
   <trkpt lat="46.0" lon="6.0"><ele>400</ele><time>2026-07-02T08:00:00Z</time></trkpt>
   <trkpt lat="46.001" lon="6.001"><ele>401</ele><time>2026-07-02T08:05:00Z</time></trkpt>
  </trkseg>
 </trk>
</gpx>"""
    gzipped = gzip.compress(gpx)

    preview = client.post(
        "/api/strava/export/upload-preview",
        files={"files": ("777777.gpx.gz", gzipped, "application/gzip")},
    )
    assert preview.status_code == 200, preview.text
    assert preview.json()["activities"][0]["activity_type"] == "surfing"
    assert preview.json()["activities"][0]["requires_review"] is False

    imported = client.post(
        "/api/strava/export/upload-import",
        files={"files": ("777777.gpx.gz", gzipped, "application/gzip")},
    )
    assert imported.status_code == 200, imported.text
    assert len(imported.json()["imported"]) == 1

    loaded = client.get("/api/session/2026-07-02")
    activity = loaded.json()["activities"][0]
    assert activity["title"] == "Uploaded surf"
    assert activity["activity_type"] == "surfing"
    assert activity["source_files"][0]["parsed"]["strava_activity_id"] == "777777"

    duplicate = client.post(
        "/api/strava/export/upload-import",
        files={"files": ("777777.gpx.gz", gzipped, "application/gzip")},
    )
    assert duplicate.status_code == 200, duplicate.text
    assert duplicate.json()["imported"] == []
    assert duplicate.json()["skipped"][0]["strava_activity_id"] == "777777"
