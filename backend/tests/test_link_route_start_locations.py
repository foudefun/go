from scripts.link_route_start_locations import link_route_start_locations
from app import main


def seed_route_and_locations(route_name="Weissmies via North-West Flank from Hohsaas"):
    db = main.SessionLocal()
    try:
        now = "2026-05-27T00:00:00"
        route = main.OutdoorRouteModel(
            username="admin",
            slug="sac-alpine-tour-9999",
            name=route_name,
            activity_type="alpinism",
            route_category="normal_route",
            visibility="private",
            status="draft",
            created_at=now,
            updated_at=now,
        )
        summit = main.OutdoorSummitModel(
            username="admin",
            name="Weissmies",
            latitude=46.1278,
            longitude=8.0125,
            elevation_meters=4013,
            coordinate_status="approximate",
            created_at=now,
            updated_at=now,
        )
        station = main.OutdoorStationModel(
            username="admin",
            name="Hohsaas",
            latitude=46.1399,
            longitude=7.9901,
            elevation_meters=3142,
            coordinate_status="approximate",
            created_at=now,
            updated_at=now,
        )
        hut = main.OutdoorHutModel(
            username="admin",
            name="Saas Fee",
            latitude=46.108,
            longitude=7.927,
            elevation_meters=1800,
            coordinate_status="approximate",
            created_at=now,
            updated_at=now,
        )
        db.add_all([route, summit, station, hut])
        db.flush()
        db.add(
            main.OutdoorRouteLocationRoleModel(
                entity_type="route",
                entity_id=route.id,
                location_entity_type="summit",
                location_entity_id=summit.id,
                role="main_objective",
                created_at=now,
                updated_at=now,
            )
        )
        db.commit()
        return route.id
    finally:
        db.close()


def test_link_route_start_locations_preview_does_not_write(client):
    route_id = seed_route_and_locations()

    assert link_route_start_locations("admin", "sac-alpine-tour-", None, apply=False) == 0

    db = main.SessionLocal()
    try:
        assert (
            db.query(main.OutdoorRouteLocationRoleModel)
            .filter_by(entity_type="route", entity_id=route_id, role="start")
            .first()
            is None
        )
    finally:
        db.close()


def test_link_route_start_locations_apply_adds_start_and_map_line(client):
    route_id = seed_route_and_locations()

    assert link_route_start_locations("admin", "sac-alpine-tour-", None, apply=True) == 0

    db = main.SessionLocal()
    try:
        role = (
            db.query(main.OutdoorRouteLocationRoleModel)
            .filter_by(entity_type="route", entity_id=route_id, role="start")
            .one()
        )
        assert role.location_entity_type == "station"
        station = db.get(main.OutdoorStationModel, role.location_entity_id)
        assert station.name == "Hohsaas"
    finally:
        db.close()

    response = client.get("/api/outdoor-map")
    assert response.status_code == 200
    route_item = next(item for item in response.json()["routes"] if item["route"]["id"] == route_id)
    assert route_item["map_line"]["type"] == "straight"
    assert route_item["map_line"]["start"]["name"] == "Hohsaas"
    assert route_item["map_line"]["coordinates"] == [[7.9901, 46.1399], [8.0125, 46.1278]]


def test_link_route_start_locations_requires_start_cue(client):
    route_id = seed_route_and_locations(route_name="Weissmies via North-West Flank, Hohsaas")

    assert link_route_start_locations("admin", "sac-alpine-tour-", None, apply=True) == 0

    db = main.SessionLocal()
    try:
        assert (
            db.query(main.OutdoorRouteLocationRoleModel)
            .filter_by(entity_type="route", entity_id=route_id, role="start")
            .first()
            is None
        )
    finally:
        db.close()
