import json

from app import main
from scripts.import_outdoor_route_details import build_preview, import_details


def seed_route_and_locations():
    db = main.SessionLocal()
    try:
        route = main.OutdoorRouteModel(
            username="admin",
            name="Mont Blanc via Gouter Route",
            activity_type="alpinism",
            route_category="normal_route",
            visibility="private",
            status="draft",
            created_at="2026-05-24T00:00:00",
            updated_at="2026-05-24T00:00:00",
        )
        summit = main.OutdoorSummitModel(
            username="admin",
            name="Mont Blanc",
            coordinate_status="approximate",
            created_at="2026-05-24T00:00:00",
            updated_at="2026-05-24T00:00:00",
        )
        hut = main.OutdoorHutModel(
            username="admin",
            name="Gouter Hut",
            coordinate_status="unknown",
            created_at="2026-05-24T00:00:00",
            updated_at="2026-05-24T00:00:00",
        )
        db.add_all([route, summit, hut])
        db.commit()
    finally:
        db.close()


def write_details(path):
    path.write_text(
        json.dumps(
            {
                "route": {"name": "Mont Blanc via Gouter Route"},
                "route_variants": [
                    {
                        "name": "Standard Gouter Route",
                        "variant_type": "standard",
                        "difficulty_label": "PD",
                        "estimated_duration_hours": 2.5,
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [[6.829, 45.852], [6.8652, 45.8326]],
                        },
                        "source_references": [],
                    }
                ],
                "route_segments": [
                    {
                        "variant_name": "Standard Gouter Route",
                        "order_index": 1,
                        "segment_type": "hazard_crossing",
                        "name": "Grand Couloir",
                        "typical_duration_hours": 0.5,
                        "source_references": [],
                    }
                ],
                "route_location_roles_suggestions": [
                    {
                        "location_name": "Gouter Hut",
                        "location_entity_type": "hut",
                        "role": "passes_through",
                        "order_index": 1,
                        "notes": "High hut.",
                    }
                ],
            }
        ),
        encoding="utf-8",
    )


def test_build_preview_accepts_variant_and_segment_vocab():
    preview, variants, segments, roles, issues, warnings = build_preview(
        {
            "route": {"name": "Mont Blanc via Gouter Route"},
            "route_variants": [{"name": "Standard", "variant_type": "standard"}],
            "route_segments": [
                {
                    "variant_name": "Standard",
                    "order_index": 1,
                    "segment_type": "hazard_crossing",
                    "name": "Grand Couloir",
                }
            ],
            "route_location_roles_suggestions": [
                {"location_name": "Mont Blanc", "location_entity_type": "summit", "role": "end"}
            ],
        }
    )

    assert preview["name"] == "Mont Blanc via Gouter Route"
    assert variants[0]["variant_type"] == "standard"
    assert segments[0]["segment_type"] == "hazard_crossing"
    assert roles[0]["role"] == "end"
    assert issues == []
    assert warnings == []


def test_import_details_preview_does_not_write(tmp_path, client):
    seed_route_and_locations()
    path = tmp_path / "details.json"
    write_details(path)

    assert import_details(path, "admin", apply=False) == 0

    db = main.SessionLocal()
    try:
        assert db.query(main.OutdoorRouteVariantModel).count() == 0
    finally:
        db.close()


def test_import_details_apply_upserts_variants_segments_and_roles(tmp_path, client):
    seed_route_and_locations()
    path = tmp_path / "details.json"
    write_details(path)

    assert import_details(path, "admin", apply=True) == 0
    assert import_details(path, "admin", apply=True) == 0

    db = main.SessionLocal()
    try:
        route = db.query(main.OutdoorRouteModel).filter_by(name="Mont Blanc via Gouter Route").one()
        variants = db.query(main.OutdoorRouteVariantModel).filter_by(route_id=route.id).all()
        assert len(variants) == 1
        assert variants[0].variant_type == "standard"
        assert variants[0].estimated_duration_minutes == 150
        assert json.loads(variants[0].geometry_json)["coordinates"] == [[6.829, 45.852], [6.8652, 45.8326]]
        segments = db.query(main.OutdoorRouteSegmentModel).filter_by(route_variant_id=variants[0].id).all()
        assert len(segments) == 1
        assert segments[0].segment_type == "hazard_crossing"
        roles = db.query(main.OutdoorRouteLocationRoleModel).filter_by(entity_type="route", entity_id=route.id).all()
        assert len(roles) == 1
        assert roles[0].role == "passes_through"
    finally:
        db.close()
