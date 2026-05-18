# Backlog

## High priority

- Expand automated backend coverage around sessions, equipment foreign keys, and import workflows.
- Finish translating remaining older admin/import/outdoor-climbing labels that are still hardcoded in React.

## Product

- Redesign the activity creation workflow end to end: clearer entry point, less confusing fields, better defaults, explicit activity type/source handling, and a cleaner path for uploads/images/linked external files.
- Add deletion/replacement controls for attached activity source files and show raw time-series overlays, not only summary metric comparisons.
- Add imported activity file stats: per file/source provider, parsed metrics, ignored/missing fields, duplicate detection, and import history visible from the activity.
- Improve the exercise cleanup workflow with clearer duplicate detection, family grouping, and image coverage status.
- Build out the equipment UI for model versions, variants, ownership status, maintenance events, and item history now that the normalized tables exist.
- Discuss and design mountain/outdoor route tables before implementation: summits, places/trailheads, routes by activity type such as ski, climbing, and alpinism, start/end/pass-through points, and GPX trace storage.
- Add language-aware labels for normalized exercise categories and movement families.
- Improve mobile layouts for dense editors, especially exercise editing and day/session activity editing.

## Technical

- Automate offsite backup sync beyond the manual `scripts/download_latest_backup.ps1` helper.
- Clean duplicate UFW SSH allow rules on the VPS during a maintenance pass.
- Remove VPS backup `/home/ubuntu/rehab.backup.20260517-213317` after the `/opt/rehab` deployment path has stayed stable for a few days.
- Move the backend out of the single large `main.py` into modules for auth, sessions, exercises, equipment, climbing, and admin.
- Replace lightweight SQLite startup migrations with a real migration tool before the next large schema change.
- Add CI steps for `python -m pytest backend/tests`, frontend tests, and frontend build.
