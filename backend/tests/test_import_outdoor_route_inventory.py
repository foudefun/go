import json

from app import main
from scripts.import_outdoor_route_inventory import build_preview, import_inventory


def seed_summit(name="Mont Blanc"):
    db = main.SessionLocal()
    try:
        summit = main.OutdoorSummitModel(
            username="admin",
            name=name,
            coordinate_status="approximate",
            created_at="2026-05-24T00:00:00",
            updated_at="2026-05-24T00:00:00",
        )
        db.add(summit)
        db.commit()
    finally:
        db.close()


def write_route_inventory(path, primary_location_name="Mont Blanc"):
    path.write_text(
        json.dumps(
            {
                "routes": [
                    {
                        "name": "Mont Blanc via Gouter Route",
                        "activity_type": "alpinism",
                        "primary_location_name": primary_location_name,
                        "route_category": "normal_route",
                        "description": "Classic normal route.",
                        "difficulty_grade": "PD",
                        "elevation_gain_meters": None,
                        "distance_km": None,
                        "source_references": [],
                    }
                ]
            }
        ),
        encoding="utf-8",
    )


def test_build_preview_accepts_normal_route_category():
    route_previews, issues, warnings = build_preview(
        {
            "routes": [
                {
                    "name": "Mont Blanc via Gouter Route",
                    "activity_type": "alpinism",
                    "primary_location_name": "Mont Blanc",
                    "route_category": "normal_route",
                    "difficulty_grade": "PD",
                    "source_references": [],
                }
            ]
        }
    )

    assert len(route_previews) == 1
    assert route_previews[0]["activity_type"] == "alpinism"
    assert route_previews[0]["difficulty_label"] == "PD"
    assert issues == []
    assert warnings == []


def test_import_route_inventory_preview_does_not_write(tmp_path, client):
    seed_summit()
    path = tmp_path / "routes.json"
    write_route_inventory(path)

    assert import_inventory(path, "admin", apply=False) == 0

    db = main.SessionLocal()
    try:
        assert db.query(main.OutdoorRouteModel).filter_by(name="Mont Blanc via Gouter Route").first() is None
    finally:
        db.close()


def test_import_route_inventory_apply_upserts_routes_and_links_summit(tmp_path, client):
    seed_summit()
    path = tmp_path / "routes.json"
    write_route_inventory(path)

    assert import_inventory(path, "admin", apply=True) == 0
    assert import_inventory(path, "admin", apply=True) == 0

    db = main.SessionLocal()
    try:
        route_rows = db.query(main.OutdoorRouteModel).filter_by(name="Mont Blanc via Gouter Route").all()
        assert len(route_rows) == 1
        route = route_rows[0]
        assert route.activity_type == "alpinism"
        assert route.route_category == "normal_route"
        assert route.difficulty_label == "PD"
        role = db.query(main.OutdoorRouteLocationRoleModel).filter_by(entity_type="route", entity_id=route.id).one()
        assert role.location_entity_type == "summit"
        assert role.role == "main_objective"
    finally:
        db.close()


def test_import_route_inventory_rejects_missing_summit(tmp_path, client):
    path = tmp_path / "routes.json"
    write_route_inventory(path, primary_location_name="Missing Summit")

    assert import_inventory(path, "admin", apply=False) == 1
