from app import main


def seed_importable_route(username="admin"):
    db = main.SessionLocal()
    try:
        now = "2026-05-28T00:00:00"
        route = main.OutdoorRouteModel(
            username=username,
            name="Weissmies via North-West Flank",
            activity_type="alpinism",
            route_category="normal_route",
            difficulty_label="PD",
            visibility="private",
            status="draft",
            created_at=now,
            updated_at=now,
        )
        summit = main.OutdoorSummitModel(
            username=username,
            name="Weissmies",
            latitude=46.1278,
            longitude=8.0125,
            elevation_meters=4013,
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
                created_at=now,
                updated_at=now,
            )
        )
        db.commit()
        return route.id
    finally:
        db.close()


def test_import_route_geometry_from_gpx_creates_gps_variant(client):
    route_id = seed_importable_route()
    gpx = b"""<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="test">
  <trk><name>Weissmies test track</name><trkseg>
    <trkpt lat="46.1400" lon="8.0050"><ele>3100</ele></trkpt>
    <trkpt lat="46.1340" lon="8.0090"><ele>3600</ele></trkpt>
    <trkpt lat="46.1278" lon="8.0125"><ele>4013</ele></trkpt>
  </trkseg></trk>
</gpx>"""

    response = client.post(
        f"/api/outdoor-routes/{route_id}/geometry-import",
        data={"variant_name": "Uploaded GPX track"},
        files={"file": ("weissmies.gpx", gpx, "application/gpx+xml")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["point_count"] == 3
    assert payload["distance_km"] > 0
    assert payload["variant"]["name"] == "Uploaded GPX track"
    assert payload["variant"]["variant_type"] == "imported_track"
    assert payload["variant"]["route_shape"] == "gps_track"
    assert payload["variant"]["min_elevation_meters"] == 3100
    assert payload["variant"]["max_elevation_meters"] == 4013
    assert payload["variant"]["geometry"]["coordinates"] == [[8.005, 46.14], [8.009, 46.134], [8.0125, 46.1278]]

    map_response = client.get("/api/outdoor-map")
    assert map_response.status_code == 200
    map_route = map_response.json()["routes"][0]
    assert map_route["map_line"]["type"] == "geometry"
    assert map_route["map_line"]["coordinates"] == [[8.005, 46.14], [8.009, 46.134], [8.0125, 46.1278]]


def test_import_route_geometry_from_geojson(client):
    route_id = seed_importable_route()
    geojson = b"""{
  "type": "Feature",
  "geometry": {
    "type": "LineString",
    "coordinates": [[8.005, 46.14, 3100], [8.0125, 46.1278, 4013]]
  }
}"""

    response = client.post(
        f"/api/outdoor-routes/{route_id}/geometry-import",
        files={"file": ("weissmies.geojson", geojson, "application/geo+json")},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["variant"]["name"] == "weissmies"
    assert payload["variant"]["geometry"]["coordinates"] == [[8.005, 46.14], [8.0125, 46.1278]]


def test_import_route_geometry_rejects_invalid_file(client):
    route_id = seed_importable_route()

    response = client.post(
        f"/api/outdoor-routes/{route_id}/geometry-import",
        files={"file": ("bad.txt", b"not a route", "text/plain")},
    )

    assert response.status_code == 400
    assert "GPX, GeoJSON, or KML" in response.json()["detail"]
