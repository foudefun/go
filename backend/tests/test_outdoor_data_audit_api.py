from app import main


def seed_audit_data():
    db = main.SessionLocal()
    try:
        now = "2026-05-26T00:00:00"
        first_summit = main.OutdoorSummitModel(
            username="admin",
            name="Duplicate Peak",
            latitude=46.1,
            longitude=7.1,
            elevation_meters=4100,
            coordinate_status="approximate",
            created_at=now,
            updated_at=now,
        )
        second_summit = main.OutdoorSummitModel(
            username="admin",
            name="Duplicate Peak",
            latitude=46.2,
            longitude=7.2,
            elevation_meters=4200,
            coordinate_status="approximate",
            created_at=now,
            updated_at=now,
        )
        missing_coordinate_hut = main.OutdoorHutModel(
            username="admin",
            name="Unmapped Hut",
            elevation_meters=2500,
            coordinate_status="unknown",
            created_at=now,
            updated_at=now,
        )
        suspicious_pass = main.OutdoorPassModel(
            username="admin",
            name="Bad Elevation Pass",
            latitude=46.3,
            longitude=7.3,
            elevation_meters=5200,
            coordinate_status="exact",
            created_at=now,
            updated_at=now,
        )
        db.add_all([first_summit, second_summit, missing_coordinate_hut, suspicious_pass])
        db.flush()
        db.add(
            main.OutdoorSourceReferenceModel(
                entity_type="summit",
                entity_id=first_summit.id,
                source_type="map",
                title="Source",
                url="https://example.com/source",
                created_at=now,
                updated_at=now,
            )
        )
        db.commit()
    finally:
        db.close()


def test_get_outdoor_data_audit_returns_quality_sections(client):
    seed_audit_data()

    response = client.get("/api/outdoor-data-audit")

    assert response.status_code == 200
    payload = response.json()
    assert payload["summary"]["total_locations"] == 4
    assert payload["summary"]["total_summits"] == 2
    assert payload["summary"]["summits_4000"] == 2
    assert payload["summary"]["duplicate_name_groups"] == 1
    assert payload["summary"]["missing_sources"] == 3
    assert payload["summary"]["missing_coordinates"] == 1
    assert payload["summary"]["approximate_coordinates"] == 2
    assert payload["summary"]["unknown_coordinates"] == 1
    assert payload["summary"]["suspicious_elevations"] == 1

    duplicate = payload["sections"]["duplicate_names"][0]
    assert duplicate["name"] == "Duplicate Peak"
    assert duplicate["location_entity_type"] == "summit"
    assert len(duplicate["records"]) == 2

