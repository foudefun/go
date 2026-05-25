from app.main import (
    OUTDOOR_ROUTE_CANDIDATE_TRACK_STATUSES,
    OUTDOOR_ROUTE_CATEGORIES,
    OUTDOOR_ROUTE_COORDINATE_STATUSES,
    OUTDOOR_ROUTE_LOCATION_ENTITY_TYPES,
    OUTDOOR_ROUTE_LOCATION_ROLES,
    OUTDOOR_ROUTE_RELATIONSHIP_TYPES,
    OUTDOOR_ROUTE_STATUSES,
    OUTDOOR_ROUTE_TRACK_QUALITY_STATUSES,
    OUTDOOR_ROUTE_VISIBILITIES,
    is_outdoor_route_domain_value,
)


def test_defines_core_outdoor_route_constants():
    assert "ski_tour" in OUTDOOR_ROUTE_CATEGORIES
    assert OUTDOOR_ROUTE_VISIBILITIES == {"private", "unlisted", "public"}
    assert OUTDOOR_ROUTE_STATUSES == {"draft", "published", "archived", "needs_review"}
    assert "same_objective" in OUTDOOR_ROUTE_RELATIONSHIP_TYPES


def test_defines_location_and_track_vocabulary():
    assert "summit" in OUTDOOR_ROUTE_LOCATION_ENTITY_TYPES
    assert "trailhead" in OUTDOOR_ROUTE_LOCATION_ENTITY_TYPES
    assert "main_objective" in OUTDOOR_ROUTE_LOCATION_ROLES
    assert OUTDOOR_ROUTE_COORDINATE_STATUSES == {"exact", "approximate", "area_only", "unknown"}
    assert OUTDOOR_ROUTE_TRACK_QUALITY_STATUSES == {"unknown", "poor", "usable", "good", "verified"}
    assert "under_review" in OUTDOOR_ROUTE_CANDIDATE_TRACK_STATUSES


def test_validates_values_against_a_domain_set():
    assert is_outdoor_route_domain_value(OUTDOOR_ROUTE_VISIBILITIES, "private") is True
    assert is_outdoor_route_domain_value(OUTDOOR_ROUTE_VISIBILITIES, "team_only") is False
