# Backlog

## High priority

- Run a project security review covering auth/session handling, permissions, uploads, secrets, headers, dependency exposure, and VPS deployment settings.
- Expand automated backend coverage around sessions, equipment foreign keys, and import workflows.
- Finish translating remaining older admin/import/outdoor-climbing labels that are still hardcoded in React.

## Product

- Add deletion/replacement controls for attached activity source files and show raw time-series overlays, not only summary metric comparisons.
- Improve the exercise cleanup workflow with clearer duplicate detection, family grouping, and image coverage status.
- Build out the equipment UI for model versions, variants, ownership status, maintenance events, and item history now that the normalized tables exist.
- Discuss and design mountain/outdoor route tables before implementation: summits, places/trailheads, routes by activity type such as ski, climbing, and alpinism, start/end/pass-through points, and GPX trace storage.
- Add language-aware labels for normalized exercise categories and movement families.
- Improve mobile layouts for dense editors, especially exercise editing and day/session activity editing.

## Technical

- Move the backend out of the single large `main.py` into modules for auth, sessions, exercises, equipment, climbing, and admin.
- Replace lightweight SQLite startup migrations with a real migration tool before the next large schema change.
- Decide whether production deploy should stay manual-only or restore GitHub Actions with fixed VPS secrets.
- Add CI steps for `python -m pytest backend/tests`, frontend tests, and frontend build.
