from scripts.import_outdoor_location_inventory import import_inventory
from app import main


def write_inventory(path, name="Dent de Jaman"):
    path.write_text(
        f"""
{{
  "locations": [
    {{
      "location_entity_type": "summit",
      "name": "{name}",
      "aliases": ["Test alias"],
      "latitude": 46.44495,
      "longitude": 6.9748,
      "elevation_meters": 1874,
      "coordinate_status": "approximate",
      "description": "Summit in the Vaud Prealps.",
      "access_notes": "Access from Gare de Jaman.",
      "source_references": [],
      "open_questions": []
    }},
    {{
      "location_entity_type": "crag",
      "name": "Skipped candidate crag",
      "aliases": [],
      "latitude": null,
      "longitude": null,
      "elevation_meters": null,
      "coordinate_status": "unknown",
      "description": "Candidate crag.",
      "access_notes": "",
      "source_references": [],
      "open_questions": []
    }}
  ],
  "route_location_roles_suggestions": [
    {{
      "route_or_objective_name": "Dent de Jaman climbing",
      "location_name": "Skipped candidate crag",
      "location_entity_type": "crag",
      "role": "nearby",
      "order_index": null,
      "notes": ""
    }}
  ],
  "missing_information": []
}}
""".strip(),
        encoding="utf-8",
    )


def test_import_inventory_preview_does_not_write(tmp_path, client):
    path = tmp_path / "inventory.json"
    write_inventory(path)

    assert import_inventory(path, "admin", apply=False) == 0

    db = main.SessionLocal()
    try:
        assert db.query(main.OutdoorSummitModel).filter_by(name="Dent de Jaman").first() is None
    finally:
        db.close()


def test_import_inventory_apply_upserts_locations(tmp_path, client):
    path = tmp_path / "inventory.json"
    write_inventory(path)

    assert import_inventory(path, "admin", apply=True) == 0
    assert import_inventory(path, "admin", apply=True) == 0

    db = main.SessionLocal()
    try:
        rows = db.query(main.OutdoorSummitModel).filter_by(name="Dent de Jaman").all()
        assert len(rows) == 1
        assert rows[0].username == "admin"
        assert rows[0].coordinate_status == "approximate"
        assert rows[0].aliases_json == '["Test alias"]'
    finally:
        db.close()


def test_import_inventory_rejects_conflicting_same_name_location(tmp_path, client):
    path = tmp_path / "inventory.json"
    write_inventory(path)

    assert import_inventory(path, "admin", apply=True) == 0

    conflicting_path = tmp_path / "conflicting_inventory.json"
    write_inventory(conflicting_path)
    content = conflicting_path.read_text(encoding="utf-8")
    content = content.replace('"latitude": 46.44495', '"latitude": 47.44495')
    content = content.replace('"elevation_meters": 1874', '"elevation_meters": 2874')
    conflicting_path.write_text(content, encoding="utf-8")

    assert import_inventory(conflicting_path, "admin", apply=True) == 1

    db = main.SessionLocal()
    try:
        row = db.query(main.OutdoorSummitModel).filter_by(name="Dent de Jaman").one()
        assert row.latitude == 46.44495
        assert row.elevation_meters == 1874
    finally:
        db.close()


def test_import_inventory_rejects_unknown_user(tmp_path, client):
    path = tmp_path / "inventory.json"
    write_inventory(path)

    try:
        import_inventory(path, "missing-user", apply=True)
    except ValueError as exc:
        assert "does not exist" in str(exc)
    else:
        raise AssertionError("Expected missing user to be rejected")
