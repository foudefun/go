from app import main


def seed_route_details():
    db = main.SessionLocal()
    try:
        now = "2026-05-24T00:00:00"
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
            aliases_json='["Monte Bianco"]',
            latitude=45.8326,
            longitude=6.8652,
            elevation_meters=4809,
            coordinate_status="approximate",
            created_at=now,
            updated_at=now,
        )
        db.add_all([route, summit])
        db.flush()
        db.add(
            main.OutdoorRouteLocationRoleModel(
                entity_type="route",
                entity_id=route.id,
                location_entity_type="summit",
                location_entity_id=summit.id,
                role="main_objective",
                order_index=1,
                created_at=now,
                updated_at=now,
            )
        )
        variant = main.OutdoorRouteVariantModel(
            route_id=route.id,
            name="Standard Gouter Route",
            variant_type="standard",
            route_shape="other",
            geometry_json='{"type":"LineString","coordinates":[[6.829,45.852],[6.84,45.86],[6.8652,45.8326]]}',
            difficulty_label="PD",
            created_at=now,
            updated_at=now,
        )
        db.add(variant)
        db.flush()
        segment = main.OutdoorRouteSegmentModel(
            route_variant_id=variant.id,
            order_index=1,
            segment_type="hazard_crossing",
            name="Grand Couloir",
            difficulty_label="PD",
            created_at=now,
            updated_at=now,
        )
        db.add(segment)
        db.flush()
        db.add(
            main.OutdoorSourceReferenceModel(
                entity_type="route_segment",
                entity_id=segment.id,
                source_type="website",
                title="Test source",
                url="https://example.com/route",
                created_at=now,
                updated_at=now,
            )
        )
        db.commit()
        return route.id
    finally:
        db.close()


def test_list_outdoor_routes_returns_summary_rows(client):
    route_id = seed_route_details()

    response = client.get("/api/outdoor-routes")

    assert response.status_code == 200
    payload = response.json()
    assert payload["total"] == 1
    item = payload["routes"][0]
    assert item["route"]["id"] == route_id
    assert item["route"]["name"] == "Mont Blanc via Gouter Route"
    assert item["main_objective"]["name"] == "Mont Blanc"
    assert item["map_line"]["type"] == "geometry"
    assert item["map_line"]["coordinates"] == [[6.829, 45.852], [6.84, 45.86], [6.8652, 45.8326]]
    assert item["variant_count"] == 1
    assert item["segment_count"] == 1
    assert item["location_role_count"] == 1


def test_list_outdoor_routes_filters_by_search_and_activity(client):
    seed_route_details()

    matched = client.get("/api/outdoor-routes", params={"search": "Blanc", "activity_type": "alpinism"})
    matched_alias = client.get("/api/outdoor-routes", params={"search": "Monte Bianco"})
    missed = client.get("/api/outdoor-routes", params={"search": "Matterhorn"})

    assert matched.status_code == 200
    assert matched.json()["total"] == 1
    assert matched_alias.status_code == 200
    assert matched_alias.json()["total"] == 1
    assert missed.status_code == 200
    assert missed.json()["total"] == 0


def test_get_outdoor_route_details_returns_nested_structure(client):
    route_id = seed_route_details()

    response = client.get(f"/api/outdoor-routes/{route_id}/details")

    assert response.status_code == 200
    payload = response.json()
    assert payload["route"]["id"] == route_id
    assert payload["route"]["name"] == "Mont Blanc via Gouter Route"
    assert payload["main_objective"]["name"] == "Mont Blanc"
    assert payload["main_objective"]["aliases"] == ["Monte Bianco"]
    assert payload["location_roles"][0]["role"] == "main_objective"
    assert payload["location_roles"][0]["location"]["name"] == "Mont Blanc"
    assert payload["variants"][0]["variant"]["name"] == "Standard Gouter Route"
    assert payload["variants"][0]["variant"]["geometry"]["type"] == "LineString"
    assert payload["variants"][0]["segments"][0]["segment"]["name"] == "Grand Couloir"
    assert payload["variants"][0]["segments"][0]["source_references"][0]["url"] == "https://example.com/route"


def test_get_outdoor_route_details_scopes_to_current_user(client):
    db = main.SessionLocal()
    try:
        if not db.query(main.UserModel).filter_by(username="other").first():
            db.add(
                main.UserModel(
                    username="other",
                    password_hash="",
                    password_salt="",
                    is_admin=False,
                    language="en",
                )
            )
        db.flush()
        route = main.OutdoorRouteModel(
            username="other",
            name="Other route",
            activity_type="alpinism",
            route_category="normal_route",
            visibility="private",
            status="draft",
            created_at="2026-05-24T00:00:00",
            updated_at="2026-05-24T00:00:00",
        )
        db.add(route)
        db.commit()
        route_id = route.id
    finally:
        db.close()

    response = client.get(f"/api/outdoor-routes/{route_id}/details")

    assert response.status_code == 404
