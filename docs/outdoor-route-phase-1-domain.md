# Outdoor Route Phase 1 Domain Vocabulary

Phase 1 defines constants and JS shape documentation only. It does not add database tables, API endpoints, migrations, or UI screens.

## Activity Types

Active route activity types:

- `ski_touring`
- `hiking`
- `alpinism`
- `outdoor_climbing`

Future/inactive route activity types:

- `trail_running`
- `cycling`

These are mapped to existing session activity types in `frontend/src/domain/activityTypes.js` and mirrored in `backend/app/main.py`.

## Route Vocabulary

Phase 1 defines constants for:

- route categories
- route visibility/status values
- route relationship types
- route variant types
- route shapes
- route segment types
- location entity types
- location roles
- coordinate statuses
- track quality statuses
- candidate route track statuses
- route track types
- source reference entity/source types
- climbing topo bridge link types

## Shape Documentation

Frontend shape documentation lives in `frontend/src/domain/outdoorRouteDomain.js` as plain JavaScript docs. This is intentional because the app is currently JSX/JS, not TypeScript.

Backend constants live in `backend/app/main.py` for future validation by API endpoints and startup migration logic.

## Next Phase

Phase 2 can create the minimal core tables using the existing `EXPECTED_TABLES` startup migration style:

- `outdoor_routes`
- `outdoor_route_relationships`
- `outdoor_route_variants`
- `outdoor_route_segments`
- `outdoor_route_location_roles`
- `outdoor_source_references`

Do not add activity tracks, GPX candidate tracks, heatmaps, climbing extras, or calendar integration in Phase 2.
