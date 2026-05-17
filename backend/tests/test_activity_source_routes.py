from io import BytesIO

from app import main


def gpx_payload(power_a=190, power_b=230, hr_a=120, hr_b=140):
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="pytest">
  <trk>
    <name>Indoor ride</name>
    <trkseg>
      <trkpt lat="46.0000" lon="6.0000">
        <time>2026-05-17T08:00:00Z</time>
        <extensions><hr>{hr_a}</hr><power>{power_a}</power><cad>82</cad></extensions>
      </trkpt>
      <trkpt lat="46.0010" lon="6.0010">
        <time>2026-05-17T08:10:00Z</time>
        <extensions><hr>{hr_b}</hr><power>{power_b}</power><cad>88</cad></extensions>
      </trkpt>
    </trkseg>
  </trk>
</gpx>""".encode()


def test_activity_can_keep_multiple_source_files_and_metric_preferences(client):
    saved = client.post(
        "/api/session/2026-05-17",
        json={
            "activities": [
                {
                    "title": "Trainer ride",
                    "activity_type": "velo",
                    "activity_details": "Same activity from multiple platforms",
                }
            ],
            "draft_active_activity_index": 0,
        },
    )
    assert saved.status_code == 200, saved.text

    garmin = client.post(
        "/api/session/2026-05-17/activities/0/source-files",
        data={"format": "gpx", "provider": "Garmin"},
        files={"activity_file": ("garmin.gpx", BytesIO(gpx_payload()), "application/gpx+xml")},
    )
    assert garmin.status_code == 200, garmin.text
    garmin_source = garmin.json()["source_file"]

    mywhoosh = client.post(
        "/api/session/2026-05-17/activities/0/source-files",
        data={"format": "gpx", "provider": "MyWhoosh"},
        files={"activity_file": ("mywhoosh.gpx", BytesIO(gpx_payload(250, 290, 118, 138)), "application/gpx+xml")},
    )
    assert mywhoosh.status_code == 200, mywhoosh.text
    mywhoosh_source = mywhoosh.json()["source_file"]

    activity = mywhoosh.json()["session"]["activities"][0]
    assert len(activity["source_files"]) == 2
    assert activity["metric_source_preferences"]["heart_rate"] == garmin_source["id"]
    assert activity["metric_source_preferences"]["power"] == garmin_source["id"]
    assert mywhoosh_source["metrics"]["power"]["avg"] == 270

    updated = client.put(
        "/api/session/2026-05-17/activities/0/metric-sources",
        json={"metric_source_preferences": {"power": mywhoosh_source["id"], "heart_rate": garmin_source["id"]}},
    )
    assert updated.status_code == 200, updated.text
    preferences = updated.json()["session"]["activities"][0]["metric_source_preferences"]
    assert preferences["power"] == mywhoosh_source["id"]
    assert preferences["heart_rate"] == garmin_source["id"]

    db = main.SessionLocal()
    try:
        assert db.query(main.AuditLogModel).filter_by(action="activity_source_upload_created").count() == 2
    finally:
        db.close()


def test_activity_source_rejects_unsupported_extension(client):
    saved = client.post(
        "/api/session/2026-05-18",
        json={"activities": [{"title": "Ride"}], "draft_active_activity_index": 0},
    )
    assert saved.status_code == 200, saved.text

    response = client.post(
        "/api/session/2026-05-18/activities/0/source-files",
        data={"format": "gpx", "provider": "Garmin"},
        files={"activity_file": ("garmin.txt", BytesIO(gpx_payload()), "text/plain")},
    )

    assert response.status_code == 400
    assert "FIT, TCX, or GPX" in response.json()["detail"]

    db = main.SessionLocal()
    try:
        assert db.query(main.AuditLogModel).filter_by(action="activity_source_upload_rejected").count() == 1
    finally:
        db.close()


def test_activity_source_rejects_format_mismatch(client):
    saved = client.post(
        "/api/session/2026-05-19",
        json={"activities": [{"title": "Ride"}], "draft_active_activity_index": 0},
    )
    assert saved.status_code == 200, saved.text

    response = client.post(
        "/api/session/2026-05-19/activities/0/source-files",
        data={"format": "tcx", "provider": "Garmin"},
        files={"activity_file": ("garmin.gpx", BytesIO(gpx_payload()), "application/gpx+xml")},
    )

    assert response.status_code == 400
    assert "does not match" in response.json()["detail"]


def test_activity_source_rejects_fake_activity_file(client):
    saved = client.post(
        "/api/session/2026-05-20",
        json={"activities": [{"title": "Ride"}], "draft_active_activity_index": 0},
    )
    assert saved.status_code == 200, saved.text

    response = client.post(
        "/api/session/2026-05-20/activities/0/source-files",
        data={"format": "gpx", "provider": "Garmin"},
        files={"activity_file": ("fake.gpx", BytesIO(b"not really a gpx"), "application/gpx+xml")},
    )

    assert response.status_code == 400
    assert response.json()["detail"] == "Uploaded file is not a supported activity source"
