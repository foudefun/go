from app import main
from scripts import import_camptocamp_routes


def c2c_row(route_id=1855327):
    return {
        "document_id": route_id,
        "locales": [{"lang": "fr", "title": "Diane Kruger", "summary": None, "title_prefix": "Dalle a Besson"}],
        "geometry": {"geom": '{"type": "Point", "coordinates": [777024.183312, 5829885.495919]}'},
        "activities": ["rock_climbing"],
        "elevation_min": 600,
        "elevation_max": 612,
        "height_diff_difficulties": 12,
        "orientations": ["S"],
        "equipment_rating": "P1",
        "rock_free_rating": "5c",
        "climbing_outdoor_type": "single",
    }


def c2c_detail(route_id=1855327):
    row = c2c_row(route_id)
    row["locales"][0]["description"] = "Jolie voie."
    row["main_waypoint_id"] = 433546
    row["associations"] = {
        "waypoints": [
            {
                "document_id": 433546,
                "locales": [{"lang": "fr", "title": "Verchiez"}],
                "geometry": {"geom": '{"type": "Point", "coordinates": [777024.1833123793, 5829885.495919446]}'},
                "elevation": 600,
            }
        ]
    }
    return row


def test_normalize_camptocamp_route_metadata():
    preview = import_camptocamp_routes.normalize_route(c2c_row(), c2c_detail(), "2026-05-29T00:00:00+00:00")

    assert preview["slug"] == "c2c-1855327-dalle-a-besson-diane-kruger"
    assert preview["activity_type"] == "outdoor_climbing"
    assert preview["route_category"] == "climb"
    assert preview["difficulty_label"] == "5c"
    assert preview["min_elevation_meters"] == 600
    assert preview["max_elevation_meters"] == 612
    assert preview["waypoint"]["name"] == "Verchiez"
    assert preview["waypoint"]["latitude"] == 46.308254
    assert preview["waypoint"]["longitude"] == 6.980127
    assert preview["source_references"][0]["source_type"] == "community"


def test_import_camptocamp_routes_preview_does_not_write(monkeypatch, client):
    preview = import_camptocamp_routes.normalize_route(c2c_row(), c2c_detail(), "2026-05-29T00:00:00+00:00")
    monkeypatch.setattr(
        import_camptocamp_routes,
        "fetch_camptocamp_route_previews",
        lambda area_id, activity, limit, include_details=True: (321, [preview], []),
    )

    assert import_camptocamp_routes.import_camptocamp_routes("admin", False, 14397, "rock_climbing", 1) == 0

    db = main.SessionLocal()
    try:
        assert db.query(main.OutdoorRouteModel).filter_by(slug="c2c-1855327-dalle-a-besson-diane-kruger").first() is None
    finally:
        db.close()


def test_import_camptocamp_routes_apply_upserts_route_and_location(monkeypatch, client):
    preview = import_camptocamp_routes.normalize_route(c2c_row(), c2c_detail(), "2026-05-29T00:00:00+00:00")
    monkeypatch.setattr(
        import_camptocamp_routes,
        "fetch_camptocamp_route_previews",
        lambda area_id, activity, limit, include_details=True: (321, [preview], []),
    )

    assert import_camptocamp_routes.import_camptocamp_routes("admin", True, 14397, "rock_climbing", 1) == 0
    assert import_camptocamp_routes.import_camptocamp_routes("admin", True, 14397, "rock_climbing", 1) == 0

    db = main.SessionLocal()
    try:
        routes = db.query(main.OutdoorRouteModel).filter_by(slug="c2c-1855327-dalle-a-besson-diane-kruger").all()
        assert len(routes) == 1
        route = routes[0]
        assert route.activity_type == "outdoor_climbing"
        assert route.difficulty_label == "5c"
        location = db.query(main.OutdoorOtherLocationModel).filter_by(name="Verchiez").one()
        assert location.coordinate_status == "approximate"
        role = db.query(main.OutdoorRouteLocationRoleModel).filter_by(entity_type="route", entity_id=route.id).one()
        assert role.location_entity_type == "other_location"
        assert role.location_entity_id == location.id
        references = db.query(main.OutdoorSourceReferenceModel).filter_by(entity_type="route", entity_id=route.id).all()
        assert len(references) == 1
    finally:
        db.close()
