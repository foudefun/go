from app import main


PHASE_2_TABLES = {
    "outdoor_routes",
    "outdoor_route_relationships",
    "outdoor_route_variants",
    "outdoor_route_segments",
    "outdoor_route_location_roles",
    "outdoor_source_references",
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


def test_phase_2_outdoor_route_tables_exist():
    with main.engine.connect() as conn:
        table_names = {
            row[0]
            for row in conn.exec_driver_sql("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
        }
    assert PHASE_2_TABLES.issubset(table_names)


def test_phase_2_outdoor_route_table_columns():
    assert {
        "id",
        "username",
        "name",
        "activity_type",
        "route_category",
        "visibility",
        "status",
        "difficulty_label",
        "created_at",
        "updated_at",
    }.issubset(sqlite_columns("outdoor_routes"))
    assert {"route_id", "variant_type", "route_shape", "geometry_json"}.issubset(sqlite_columns("outdoor_route_variants"))
    assert {"route_variant_id", "order_index", "segment_type"}.issubset(sqlite_columns("outdoor_route_segments"))
    assert {"entity_type", "location_entity_type", "role"}.issubset(sqlite_columns("outdoor_route_location_roles"))
    assert {"entity_type", "source_type", "url"}.issubset(sqlite_columns("outdoor_source_references"))


def test_phase_2_outdoor_route_foreign_keys():
    assert ("username", "users", "username", "CASCADE") in sqlite_foreign_keys("outdoor_routes")
    assert ("route_id", "outdoor_routes", "id", "CASCADE") in sqlite_foreign_keys("outdoor_route_variants")
    assert ("route_variant_id", "outdoor_route_variants", "id", "CASCADE") in sqlite_foreign_keys("outdoor_route_segments")
    assert ("from_route_id", "outdoor_routes", "id", "CASCADE") in sqlite_foreign_keys("outdoor_route_relationships")
    assert ("to_route_id", "outdoor_routes", "id", "CASCADE") in sqlite_foreign_keys("outdoor_route_relationships")
    assert sqlite_foreign_keys("outdoor_route_location_roles") == set()
    assert sqlite_foreign_keys("outdoor_source_references") == set()


def test_outdoor_route_cascade_chain(client):
    db = main.SessionLocal()
    try:
        now = "2026-05-24T00:00:00"
        route_a = main.OutdoorRouteModel(
            username="admin",
            name="Mont Test ski tour",
            activity_type="ski_touring",
            route_category="ski_tour",
            visibility="private",
            status="draft",
            created_at=now,
            updated_at=now,
        )
        route_b = main.OutdoorRouteModel(
            username="admin",
            name="Mont Test hiking route",
            activity_type="hiking",
            route_category="summit",
            visibility="private",
            status="draft",
            created_at=now,
            updated_at=now,
        )
        db.add_all([route_a, route_b])
        db.flush()
        variant = main.OutdoorRouteVariantModel(
            route_id=route_a.id,
            name="Normal route",
            variant_type="normal",
            route_shape="out_and_back",
            created_at=now,
            updated_at=now,
        )
        relationship = main.OutdoorRouteRelationshipModel(
            from_route_id=route_a.id,
            to_route_id=route_b.id,
            relationship_type="same_objective",
            created_at=now,
            updated_at=now,
        )
        db.add_all([variant, relationship])
        db.flush()
        db.add(
            main.OutdoorRouteSegmentModel(
                route_variant_id=variant.id,
                order_index=1,
                segment_type="skin_track",
                created_at=now,
                updated_at=now,
            )
        )
        db.commit()

        route_b_id = route_b.id
        variant_id = variant.id
        relationship_id = relationship.id
        db.delete(route_a)
        db.commit()

        assert db.query(main.OutdoorRouteVariantModel).filter_by(id=variant_id).first() is None
        assert db.query(main.OutdoorRouteSegmentModel).filter_by(route_variant_id=variant_id).first() is None
        assert db.query(main.OutdoorRouteRelationshipModel).filter_by(id=relationship_id).first() is None
        assert db.query(main.OutdoorRouteModel).filter_by(id=route_b_id).first() is not None
    finally:
        db.close()
