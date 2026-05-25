# Outdoor Route Phase 3 Locations

Phase 3 adds location entity tables for the outdoor route planner.

## Added Tables

- `outdoor_summits`
- `outdoor_trailheads`
- `outdoor_parkings`
- `outdoor_huts`
- `outdoor_stations`
- `outdoor_passes`
- `outdoor_waypoints`
- `outdoor_other_locations`

All tables use `users.username` for ownership, allow missing coordinates, and include:

- `name`
- `aliases_json`
- `latitude`
- `longitude`
- `elevation_meters`
- `coordinate_status`
- `description`
- `access_notes`
- `created_at`
- `updated_at`

`coordinate_status` values are:

- `exact`
- `approximate`
- `area_only`
- `unknown`

## Existing Climbing Locations

Existing `climbing_crags` and `climbing_sectors` remain in the climbing topo subsystem. They can be referenced by `outdoor_route_location_roles` using `location_entity_type` values `crag` and `sector`.

Do not duplicate current topo crags/sectors into outdoor location tables unless a later import/cleanup phase needs a specific bridge.

## Data Collection

Use `docs/outdoor-route-location-inventory-prompt.md` to ask ChatGPT for structured candidate location data. Review coordinates and sources manually before importing.
