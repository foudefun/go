from app.main import (
    OUTDOOR_ROUTE_CLIMBING_LINK_TYPES,
    get_route_activity_types_for_session_activity,
    get_session_activity_types_for_route_activity,
    normalize_activity_type,
    normalize_outdoor_route_activity_type,
)


def test_normalizes_outdoor_route_activity_aliases():
    assert normalize_outdoor_route_activity_type("ski touring") == "ski_touring"
    assert normalize_outdoor_route_activity_type("ski-de-randonnee") == "ski_touring"
    assert normalize_outdoor_route_activity_type("hike") == "hiking"
    assert normalize_outdoor_route_activity_type("mountaineering") == "alpinism"
    assert normalize_outdoor_route_activity_type("MTB") == "cycling"


def test_maps_route_activities_to_existing_session_activity_types():
    assert get_session_activity_types_for_route_activity("outdoor_climbing") == ["outdoor_climbing", "escalade"]
    assert get_session_activity_types_for_route_activity("hiking") == ["hiking"]
    assert get_session_activity_types_for_route_activity("ski_touring") == ["ski_touring"]


def test_maps_existing_session_activity_types_back_to_possible_route_activity_types():
    assert get_route_activity_types_for_session_activity("vtt") == ["cycling"]
    assert get_route_activity_types_for_session_activity("alpinism") == ["alpinism"]
    assert get_route_activity_types_for_session_activity("outdoor_climbing") == ["outdoor_climbing"]
    assert get_route_activity_types_for_session_activity("hangboard") == []


def test_outdoor_route_activity_types_are_valid_session_activity_types():
    assert normalize_activity_type("ski_touring") == "ski_touring"
    assert normalize_activity_type("alpine_ski") == "alpine_ski"
    assert normalize_activity_type("snowboarding") == "snowboarding"
    assert normalize_activity_type("hiking") == "hiking"
    assert normalize_activity_type("alpinism") == "alpinism"
    assert normalize_activity_type("surfing") == "surfing"
    assert normalize_activity_type("yoga") == "yoga"


def test_defines_climbing_topo_bridge_link_types():
    assert OUTDOOR_ROUTE_CLIMBING_LINK_TYPES == {
        "primary_topo",
        "related_topo",
        "approach_topo",
        "descent_topo",
    }
