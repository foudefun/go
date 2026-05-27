from scripts import import_wikidata_jura_summits as importer
from app import main


def wikidata_row(
    qid="Q1142554",
    name="Cret de la Neige",
    coord="Point(5.943611111 46.2725)",
    elevation="1718",
    country="France",
):
    row = {
        "item": {"value": f"http://www.wikidata.org/entity/{qid}"},
        "itemLabel": {"value": name},
        "coord": {"value": coord},
    }
    if elevation is not None:
        row["elevation"] = {"value": elevation}
    if country:
        row["countryLabel"] = {"value": country}
    return row


def test_build_summit_previews_deduplicates_wikidata_items():
    previews = importer.build_summit_previews(
        [
            wikidata_row(elevation="1718"),
            wikidata_row(coord="Point(5.943 46.272)", elevation="1700"),
            wikidata_row(qid="Q2", name="La Dole", coord="Point(6.099444444 46.425)", elevation="1677", country="Switzerland"),
        ]
    )

    assert [preview["name"] for preview in previews] == ["Cret de la Neige", "La Dole"]
    assert previews[0]["latitude"] == 46.2725
    assert previews[0]["longitude"] == 5.943611
    assert previews[0]["elevation_meters"] == 1718
    assert previews[0]["coordinate_status"] == "approximate"
    assert "Jura Mountains" in previews[0]["description"]


def test_import_jura_summits_preview_does_not_write(monkeypatch, client):
    monkeypatch.setattr(importer, "fetch_wikidata_rows", lambda limit: [wikidata_row()])

    assert importer.import_jura_summits(username="admin", limit=10, apply=False) == 0

    db = main.SessionLocal()
    try:
        assert db.query(main.OutdoorSummitModel).filter_by(name="Cret de la Neige").first() is None
    finally:
        db.close()


def test_import_jura_summits_apply_upserts_summit_and_source(monkeypatch, client):
    monkeypatch.setattr(importer, "fetch_wikidata_rows", lambda limit: [wikidata_row()])

    assert importer.import_jura_summits(username="admin", limit=10, apply=True) == 0
    assert importer.import_jura_summits(username="admin", limit=10, apply=True) == 0

    db = main.SessionLocal()
    try:
        rows = db.query(main.OutdoorSummitModel).filter_by(name="Cret de la Neige").all()
        assert len(rows) == 1
        assert rows[0].username == "admin"
        assert rows[0].access_notes == ""
        assert "imported" not in rows[0].description.lower()
        references = db.query(main.OutdoorSourceReferenceModel).filter_by(entity_type="summit", entity_id=rows[0].id).all()
        assert len(references) == 1
        assert references[0].url == "https://www.wikidata.org/wiki/Q1142554"
    finally:
        db.close()


def test_import_jura_summits_disambiguates_conflicting_same_name(monkeypatch, client):
    monkeypatch.setattr(importer, "fetch_wikidata_rows", lambda limit: [wikidata_row()])
    assert importer.import_jura_summits(username="admin", limit=10, apply=True) == 0

    monkeypatch.setattr(importer, "fetch_wikidata_rows", lambda limit: [wikidata_row(coord="Point(7.0 47.0)")])
    assert importer.import_jura_summits(username="admin", limit=10, apply=True) == 0

    db = main.SessionLocal()
    try:
        disambiguated = db.query(main.OutdoorSummitModel).filter_by(name="Cret de la Neige (Jura, 1718 m)").one()
        assert disambiguated.latitude == 47.0
    finally:
        db.close()
