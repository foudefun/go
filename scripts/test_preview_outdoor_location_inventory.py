from scripts.preview_outdoor_location_inventory import build_preview


def test_build_preview_accepts_phase_3_location_and_skips_external_crag():
    payload = {
        "locations": [
            {
                "location_entity_type": "summit",
                "name": "Dent de Jaman",
                "aliases": [],
                "latitude": 46.44495,
                "longitude": 6.9748,
                "elevation_meters": 1874,
                "coordinate_status": "exact",
                "description": "Summit.",
                "access_notes": "Access notes.",
                "source_references": [],
                "open_questions": [],
            },
            {
                "location_entity_type": "crag",
                "name": "Candidate crag",
                "aliases": [],
                "latitude": None,
                "longitude": None,
                "elevation_meters": None,
                "coordinate_status": "unknown",
                "description": "Candidate.",
                "access_notes": "",
                "source_references": [],
                "open_questions": [],
            },
        ],
        "route_location_roles_suggestions": [
            {
                "route_or_objective_name": "Dent de Jaman",
                "location_name": "Dent de Jaman",
                "location_entity_type": "summit",
                "role": "main_objective",
                "order_index": None,
                "notes": "",
            },
            {
                "route_or_objective_name": "Dent de Jaman climbing",
                "location_name": "Candidate crag",
                "location_entity_type": "crag",
                "role": "nearby",
                "order_index": None,
                "notes": "",
            },
        ],
    }

    location_previews, role_previews, issues, warnings = build_preview(payload)

    assert len(location_previews) == 1
    assert location_previews[0]["table"] == "outdoor_summits"
    assert len(role_previews) == 1
    assert "exact coordinates should be verified" in warnings[0]
    assert any("external to Phase 3 tables" in warning for warning in warnings)
    assert any("unknown or skipped location 'Candidate crag'" in warning for warning in warnings)
    assert issues == []


def test_build_preview_rejects_markdown_source_reference_artifacts():
    payload = {
        "locations": [
            {
                "location_entity_type": "summit",
                "name": "Bad source",
                "coordinate_status": "unknown",
                "source_references": [
                    {
                        "url": "[https://example.com",
                        "notes": "Provides](https://example.com) details.",
                    }
                ],
            }
        ],
        "route_location_roles_suggestions": [],
    }

    _, _, issues, _ = build_preview(payload)

    assert any("non-plain https URL" in issue for issue in issues)
    assert any("Markdown artifacts" in issue for issue in issues)
