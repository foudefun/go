import json

from app import main


PHASE_3_LOCATION_TABLES = {
    "outdoor_summits": main.OutdoorSummitModel,
    "outdoor_trailheads": main.OutdoorTrailheadModel,
    "outdoor_parkings": main.OutdoorParkingModel,
    "outdoor_huts": main.OutdoorHutModel,
    "outdoor_stations": main.OutdoorStationModel,
    "outdoor_passes": main.OutdoorPassModel,
    "outdoor_waypoints": main.OutdoorWaypointModel,
    "outdoor_other_locations": main.OutdoorOtherLocationModel,
}


def sqlite_columns(table_name):
    with main.engine.connect() as conn:
        return {row[1] for row in conn.exec_driver_sql(f"PRAGMA table_info({table_name})").fetchall()}


def sqlite_foreign_keys(table_name):
    with main.engine.connect() as conn:
        return {
            (row[3], row[2], row[4], row[6])
            for row in conn.exec_driver_sql(f"PRAGMA foreign_key_list({table_name})").fetchall()
        }


def test_phase_3_location_tables_exist():
    with main.engine.connect() as conn:
        table_names = {
            row[0]
            for row in conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }
    assert set(PHASE_3_LOCATION_TABLES).issubset(table_names)


def test_phase_3_location_tables_share_common_columns_and_user_foreign_key():
    expected_columns = {
        "id",
        "username",
        "name",
        "aliases_json",
        "latitude",
        "longitude",
        "elevation_meters",
        "coordinate_status",
        "description",
        "access_notes",
        "created_at",
        "updated_at",
    }
    for table_name in PHASE_3_LOCATION_TABLES:
        assert expected_columns.issubset(sqlite_columns(table_name))
        assert ("username", "users", "username", "CASCADE") in sqlite_foreign_keys(table_name)


def test_hut_table_has_sac_metadata_columns():
    assert {
        "external_source_id",
        "source_catalog",
        "association_id",
        "is_private",
        "is_cas_owned",
        "services_json",
        "opening_json",
        "catering_json",
        "suitable_json",
        "photos_json",
        "raw_payload_json",
    }.issubset(sqlite_columns("outdoor_huts"))


def test_locations_allow_missing_coordinates(client):
    db = main.SessionLocal()
    try:
        now = "2026-05-24T00:00:00"
        summit = main.OutdoorSummitModel(
            username="admin",
            name="Point without exact coordinates",
            aliases_json=json.dumps(["Approx summit"]),
            coordinate_status="unknown",
            created_at=now,
            updated_at=now,
        )
        db.add(summit)
        db.commit()

        row = db.query(main.OutdoorSummitModel).filter_by(name="Point without exact coordinates").first()
        assert row is not None
        assert row.latitude is None
        assert row.longitude is None
        assert row.coordinate_status == "unknown"
    finally:
        db.close()


def test_route_location_role_can_target_phase_3_locations(client):
    db = main.SessionLocal()
    try:
        now = "2026-05-24T00:00:00"
        route = main.OutdoorRouteModel(
            username="admin",
            name="Route with objective",
            activity_type="hiking",
            route_category="summit",
            visibility="private",
            status="draft",
            created_at=now,
            updated_at=now,
        )
        summit = main.OutdoorSummitModel(
            username="admin",
            name="Objective summit",
            coordinate_status="approximate",
            latitude=46.0,
            longitude=7.0,
            created_at=now,
            updated_at=now,
        )
        db.add_all([route, summit])
        db.flush()
        role = main.OutdoorRouteLocationRoleModel(
            entity_type="route",
            entity_id=route.id,
            location_entity_type="summit",
            location_entity_id=summit.id,
            role="main_objective",
            order_index=1,
            created_at=now,
            updated_at=now,
        )
        db.add(role)
        db.commit()

        stored = db.query(main.OutdoorRouteLocationRoleModel).filter_by(id=role.id).first()
        assert stored is not None
        assert stored.location_entity_type == "summit"
        assert stored.location_entity_id == summit.id
    finally:
        db.close()
