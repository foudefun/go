from app import main
from scripts import import_sac_routes


def sac_row(route_id=2672):
    return {
        "id": route_id,
        "title": "Abstieg durch die Gummichälen",
        "main_difficulty": "WS-",
        "ascent_altitude": 15,
        "descent_altitude": 2070,
        "ascent_time_max": 60,
        "descent_time_max": 180,
        "availability": "limited",
        "destination_poi": {
            "display_name": "Steinhüshoren / Steinhüshorn",
            "geographical_name": "Steinhüshoren / Steinhüshorn",
            "type": "summit",
        },
        "photos": [
            {
                "caption": "Route photo",
                "photo": {
                    "copyright": "SAC photographer",
                    "thumbnails": {"500x313": "https://static.www.suissealpine.sac-cas.ch/photo.jpg"},
                },
            }
        ],
    }


def seed_destination_summit():
    db = main.SessionLocal()
    try:
        db.add(
            main.OutdoorSummitModel(
                username="admin",
                name="Steinhüshoren / Steinhüshorn",
                coordinate_status="unknown",
                created_at="2026-05-27T00:00:00",
                updated_at="2026-05-27T00:00:00",
            )
        )
        db.commit()
    finally:
        db.close()


def test_normalize_sac_route_metadata():
    preview = import_sac_routes.normalize_route(sac_row(), {}, "alpine_tour", "2026-05-27T00:00:00+00:00")

    assert preview["slug"] == "sac-alpine-tour-2672"
    assert preview["activity_type"] == "alpinism"
    assert preview["route_category"] == "normal_route"
    assert preview["difficulty_label"] == "WS-"
    assert preview["estimated_duration_minutes"] == 240
    assert preview["destination_type"] == "summit"
    assert preview["source_references"][0]["source_type"] == "official_agency"
    assert preview["source_references"][1]["source_type"] == "photo"


def test_import_sac_routes_preview_does_not_write(monkeypatch, client):
    preview = import_sac_routes.normalize_route(sac_row(), {}, "alpine_tour", "2026-05-27T00:00:00+00:00")
    monkeypatch.setattr(
        import_sac_routes,
        "fetch_sac_route_previews",
        lambda discipline, limit, include_details=True: (837, [preview], []),
    )

    assert import_sac_routes.import_sac_routes("admin", False, "alpine_tour", 1) == 0

    db = main.SessionLocal()
    try:
        assert db.query(main.OutdoorRouteModel).filter_by(slug="sac-alpine-tour-2672").first() is None
    finally:
        db.close()


def test_import_sac_routes_apply_upserts_and_links_existing_destination(monkeypatch, client):
    seed_destination_summit()
    preview = import_sac_routes.normalize_route(sac_row(), {}, "alpine_tour", "2026-05-27T00:00:00+00:00")
    monkeypatch.setattr(
        import_sac_routes,
        "fetch_sac_route_previews",
        lambda discipline, limit, include_details=True: (837, [preview], []),
    )

    assert import_sac_routes.import_sac_routes("admin", True, "alpine_tour", 1) == 0
    assert import_sac_routes.import_sac_routes("admin", True, "alpine_tour", 1) == 0

    db = main.SessionLocal()
    try:
        routes = db.query(main.OutdoorRouteModel).filter_by(slug="sac-alpine-tour-2672").all()
        assert len(routes) == 1
        route = routes[0]
        assert route.name == "Abstieg durch die Gummichälen"
        assert route.visibility == "private"
        assert route.status == "draft"
        assert route.summary.startswith("Destination: Steinhüshoren / Steinhüshorn.")
        references = db.query(main.OutdoorSourceReferenceModel).filter_by(entity_type="route", entity_id=route.id).all()
        assert {reference.source_type for reference in references} == {"official_agency", "photo"}
        role = db.query(main.OutdoorRouteLocationRoleModel).filter_by(entity_type="route", entity_id=route.id).one()
        assert role.location_entity_type == "summit"
        assert role.role == "main_objective"
    finally:
        db.close()
