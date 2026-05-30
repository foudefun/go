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


def c2c_pitch_detail(route_id=1855328):
    row = c2c_detail(route_id)
    row["locales"][0]["title"] = "A Toi la Gloire"
    row["locales"][0]["title_prefix"] = "Miroir d'Argentine"
    row["locales"][0]["description"] = "## Escalade L# | 6a | | Départ dans la fissure L# | 7a | | Crux technique en dalle ## Descente Rappels."
    row["rock_free_rating"] = "7a"
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
    assert preview["pitch_count"] == 0


def test_normalize_camptocamp_route_reports_pitch_count():
    preview = import_camptocamp_routes.normalize_route(c2c_row(1855328), c2c_pitch_detail(), "2026-05-29T00:00:00+00:00")

    assert preview["pitch_count"] == 2


def test_fetch_camptocamp_route_previews_paginates_to_requested_limit(monkeypatch):
    calls = []

    def fake_fetch_json(url):
        calls.append(url)
        offset = 0
        if "offset=100" in url:
            offset = 100
        rows = [c2c_row(route_id=1855000 + index) for index in range(offset, offset + 100)]
        return {"total": 321, "documents": rows}

    monkeypatch.setattr(import_camptocamp_routes, "fetch_json", fake_fetch_json)

    total, previews, detail_errors = import_camptocamp_routes.fetch_camptocamp_route_previews(14397, "rock_climbing", 150, include_details=False)

    assert total == 321
    assert len(previews) == 150
    assert detail_errors == []
    assert len(calls) == 2
    assert "limit=100" in calls[0]
    assert "offset=100" in calls[1]


def test_import_camptocamp_routes_preview_does_not_write(monkeypatch, capsys, client):
    preview = import_camptocamp_routes.normalize_route(c2c_row(1855328), c2c_pitch_detail(), "2026-05-29T00:00:00+00:00")
    monkeypatch.setattr(
        import_camptocamp_routes,
        "fetch_camptocamp_route_previews",
        lambda area_id, activity, limit, include_details=True: (321, [preview], []),
    )

    assert import_camptocamp_routes.import_camptocamp_routes("admin", False, 14397, "rock_climbing", 1, extract_pitches=True) == 0
    output = capsys.readouterr().out
    assert "pitches=2" in output
    assert "Pitch extraction preview: 1 route(s), 2 pitch segment(s) detected." in output

    db = main.SessionLocal()
    try:
        assert db.query(main.OutdoorRouteModel).filter_by(slug="c2c-1855328-miroir-d-argentine-a-toi-la-gloire").first() is None
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


def test_import_camptocamp_routes_extracts_pitches_without_duplicates(monkeypatch, client):
    preview = import_camptocamp_routes.normalize_route(c2c_row(1855328), c2c_pitch_detail(), "2026-05-29T00:00:00+00:00")
    monkeypatch.setattr(
        import_camptocamp_routes,
        "fetch_camptocamp_route_previews",
        lambda area_id, activity, limit, include_details=True: (321, [preview], []),
    )

    assert import_camptocamp_routes.import_camptocamp_routes("admin", True, 14397, "rock_climbing", 1, extract_pitches=True) == 0
    assert import_camptocamp_routes.import_camptocamp_routes("admin", True, 14397, "rock_climbing", 1, extract_pitches=True) == 0

    db = main.SessionLocal()
    try:
        route = db.query(main.OutdoorRouteModel).filter_by(slug="c2c-1855328-miroir-d-argentine-a-toi-la-gloire").one()
        variant = db.query(main.OutdoorRouteVariantModel).filter_by(route_id=route.id, variant_type="pitch_list").one()
        segments = db.query(main.OutdoorRouteSegmentModel).filter_by(route_variant_id=variant.id, segment_type="pitch").order_by(main.OutdoorRouteSegmentModel.order_index).all()
        assert len(segments) == 2
        assert [segment.difficulty_label for segment in segments] == ["6a", "7a"]
        assert segments[1].description == "Crux technique en dalle"
    finally:
        db.close()


def test_import_camptocamp_routes_preserves_existing_pitch_edits(monkeypatch, client):
    preview = import_camptocamp_routes.normalize_route(c2c_row(1855328), c2c_pitch_detail(), "2026-05-29T00:00:00+00:00")
    monkeypatch.setattr(
        import_camptocamp_routes,
        "fetch_camptocamp_route_previews",
        lambda area_id, activity, limit, include_details=True: (321, [preview], []),
    )

    assert import_camptocamp_routes.import_camptocamp_routes("admin", True, 14397, "rock_climbing", 1, extract_pitches=True) == 0
    db = main.SessionLocal()
    try:
        route = db.query(main.OutdoorRouteModel).filter_by(slug="c2c-1855328-miroir-d-argentine-a-toi-la-gloire").one()
        variant = db.query(main.OutdoorRouteVariantModel).filter_by(route_id=route.id, variant_type="pitch_list").one()
        first_segment = db.query(main.OutdoorRouteSegmentModel).filter_by(route_variant_id=variant.id, order_index=1).one()
        first_segment.description = "Edited locally"
        db.commit()
    finally:
        db.close()

    assert import_camptocamp_routes.import_camptocamp_routes("admin", True, 14397, "rock_climbing", 1, extract_pitches=True) == 0

    db = main.SessionLocal()
    try:
        route = db.query(main.OutdoorRouteModel).filter_by(slug="c2c-1855328-miroir-d-argentine-a-toi-la-gloire").one()
        variant = db.query(main.OutdoorRouteVariantModel).filter_by(route_id=route.id, variant_type="pitch_list").one()
        segments = db.query(main.OutdoorRouteSegmentModel).filter_by(route_variant_id=variant.id, segment_type="pitch").order_by(main.OutdoorRouteSegmentModel.order_index).all()
        assert len(segments) == 2
        assert segments[0].description == "Edited locally"
    finally:
        db.close()
