# Outdoor Route / Climbing Topo Bridge

## Decision

Keep the existing climbing topo tables separate from the new outdoor route planner tables.

The current climbing tables model crags, sectors, topo images, route overlays, and calibration data. They answer: where is this climbing line on a topo image?

The outdoor route planner model will answer: what is this outdoor route or objective, how is it planned, what activity is it for, where does it start/end/pass through, and what GPX or condition data belongs to it?

## Existing Climbing Tables

- `climbing_areas`
- `climbing_crags`
- `climbing_sectors`
- `climbing_topo_images`
- `climbing_routes`
- `climbing_calibration_sessions`
- `climbing_calibration_points`

These remain the topo subsystem. Do not migrate them into generic outdoor route tables during the first outdoor-route schema phase.

## Future Bridge Table

After `outdoor_routes` exists, link outdoor climbing planner routes to topo routes with a bridge table:

```text
outdoor_route_climbing_links
- id
- outdoor_route_id
- climbing_route_id
- link_type
- notes
- created_at
- updated_at
```

Use the existing `users.username` key for ownership and audit fields in outdoor route tables. Do not introduce a separate numeric `user_id` for this feature unless the app auth model is redesigned first.

Supported `link_type` values:

- `primary_topo`: the topo route is the main topo representation of the outdoor route
- `related_topo`: the topo route is related but not the primary representation
- `approach_topo`: the topo route is relevant to an approach
- `descent_topo`: the topo route is relevant to a descent

## Rules

- Do not require every outdoor climbing route to have a topo link.
- Do not require every topo route to have an outdoor route.
- A future outdoor route may link to multiple topo routes, especially for multi-pitch, linkups, approaches, or descent lines.
- Keep topo image polylines in `climbing_routes.polyline_json`.
- Keep GPX route tracks in the future outdoor route track tables, not in the climbing topo tables.
- Existing GPX/FIT/TCX activity tracks currently live inside session activity `source_files`. Before adding a normalized `activity_tracks` table, build a compatibility bridge that can read existing `source_files` and expose the track metadata needed by route-track workflows.
- Keep Phase 1 frontend work in JavaScript. This app currently uses JSX/JS, so implement route-domain constants and shape documentation in JS instead of introducing TypeScript interfaces.
- Follow the existing backend `EXPECTED_TABLES` startup migration style for new tables. Do not introduce Alembic or a separate migration system as part of the first outdoor-route schema pass.
