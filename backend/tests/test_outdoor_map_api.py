from app import main


def seed_map_data():
    db = main.SessionLocal()
    try:
        now = "2026-05-25T00:00:00"
        route = main.OutdoorRouteModel(
            username="admin",
            name="Mont Blanc via Gouter Route",
            activity_type="alpinism",
            route_category="normal_route",
            difficulty_label="PD",
            visibility="private",
            status="draft",
            created_at=now,
            updated_at=now,
        )
        summit = main.OutdoorSummitModel(
            username="admin",
            name="Mont Blanc",
            latitude=45.8326,
            longitude=6.8652,
            elevation_meters=4809,
            coordinate_status="approximate",
            created_at=now,
            updated_at=now,
        )
        hut = main.OutdoorHutModel(
            username="admin",
            name="Gouter Hut",
            latitude=45.852,
            longitude=6.829,
            elevation_meters=3835,
            coordinate_status="approximate",
            created_at=now,
            updated_at=now,
        )
        hidden_waypoint = main.OutdoorWaypointModel(
            username="admin",
            name="Unmapped waypoint",
            coordinate_status="unknown",
            created_at=now,
            updated_at=now,
        )
        db.add_all([route, summit, hut, hidden_waypoint])
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


def test_get_outdoor_map_returns_locations_and_route_points(client):
    route_id = seed_map_data()

    response = client.get("/api/outdoor-map")

    assert response.status_code == 200
    payload = response.json()
    location_names = {item["location"]["name"] for item in payload["locations"]}
    assert location_names == {"Mont Blanc", "Gouter Hut"}
    assert payload["totals"]["locations"] == 2
    assert payload["totals"]["routes"] == 1
    assert payload["routes"][0]["route"]["id"] == route_id
    assert payload["routes"][0]["main_objective"]["name"] == "Mont Blanc"
    assert payload["bounds"]["min_latitude"] == 45.8326
