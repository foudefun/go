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
            source_catalog="sac_route_portal",
            is_cas_owned=True,
            is_private=False,
            opening_json='{"month_01": 1, "month_02": 0, "month_06": 1, "month_07": 2, "month_12": 1}',
            catering_json='{"month_01": 1, "month_06": 1, "month_07": 2, "month_12": 1}',
            services_json='{"half_board": true, "internet": false, "drinks": true}',
            suitable_json='{"mountain_hiking": true, "ski_snowboard_tour": true}',
            raw_payload_json='{"sleeps": 120, "tel": "+33 1 23 45", "email": "hut@example.com", "url": "https://example.com/hut", "owner": "SAC Test"}',
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
        db.add_all([
            main.OutdoorSourceReferenceModel(
                entity_type="summit",
                entity_id=summit.id,
                source_type="map",
                title="Topo reference",
                url="https://example.com/mont-blanc",
                created_at=now,
                updated_at=now,
            ),
            main.OutdoorRouteLocationRoleModel(
                entity_type="route",
                entity_id=route.id,
                location_entity_type="summit",
                location_entity_id=summit.id,
                role="main_objective",
                created_at=now,
                updated_at=now,
            ),
            main.OutdoorRouteLocationRoleModel(
                entity_type="route",
                entity_id=route.id,
                location_entity_type="hut",
                location_entity_id=hut.id,
                role="start",
                created_at=now,
                updated_at=now,
            ),
        ])
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
    assert payload["routes"][0]["map_line"]["type"] == "straight"
    assert payload["routes"][0]["map_line"]["start"]["name"] == "Gouter Hut"
    assert payload["routes"][0]["map_line"]["coordinates"] == [[6.829, 45.852], [6.8652, 45.8326]]
    assert payload["bounds"]["min_latitude"] == 45.8326
    summit_item = next(item for item in payload["locations"] if item["location"]["name"] == "Mont Blanc")
    assert summit_item["route_role_count"] == 1
    assert summit_item["source_reference_count"] == 1
    assert summit_item["linked_routes"][0]["route"]["id"] == route_id
    assert summit_item["linked_routes"][0]["role"] == "main_objective"
    hut_item = next(item for item in payload["locations"] if item["location"]["name"] == "Gouter Hut")
    assert hut_item["source_reference_count"] == 0
    hut_details = hut_item["location"]["hut_details"]
    assert hut_details["owner"] == "SAC Test"
    assert hut_details["places"] == 120
    assert hut_details["phone"] == "+33 1 23 45"
    assert hut_details["website"] == "https://example.com/hut"
    assert hut_details["summer_open_months"] == ["Jun", "Jul"]
    assert hut_details["winter_open_months"] == ["Jan", "Dec"]
    assert hut_details["guarded_months"] == ["Jan", "Jun", "Jul", "Dec"]
    assert hut_details["services"] == ["drinks", "half board"]


def test_get_outdoor_map_includes_admin_library_for_members(non_admin_client):
    route_id = seed_map_data()

    response = non_admin_client.get("/api/outdoor-map")

    assert response.status_code == 200
    payload = response.json()
    assert payload["totals"]["locations"] == 2
    assert payload["totals"]["routes"] == 1
    assert payload["routes"][0]["route"]["id"] == route_id


def test_map_tile_proxy_rejects_invalid_tile(client):
    response = client.get("/api/map-tiles/cartovoyager/19/0/0.png")

    assert response.status_code == 404


def test_swisstopo_trail_tile_proxy_rejects_unknown_layer(client):
    response = client.get("/api/map-tiles/swisstopo-trails/unknown/10/536/363.png")

    assert response.status_code == 404
