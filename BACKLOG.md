# Backlog

## Product

- Add deletion/replacement controls for attached activity source files and show raw time-series overlays, not only summary metric comparisons.
- Add imported activity file stats: per file/source provider, parsed metrics, ignored/missing fields, duplicate detection, and import history visible from the activity.
- Improve exercise search entry in the activity editor, especially when typing quickly into the exercise selector. Telegram/GitHub: #24.
- Seed split stance box jump, lateral plate hops, depth drop jumps, and broad jumps, and create muscle-impact images for those exercises.
- Continue expanding muscle-impact coverage for exercises not caught by the current automatic rules.
- Improve time entry/display for exercise sets so time-based work is not entered or shown as raw seconds only. Telegram/GitHub: #23.
- Collapse or compact previous/performed exercise cards in the activity editor so past activities are easier to scan. Telegram/GitHub: #27.
- Clarify or remove confusing draft-exercise states in the activity editor. Telegram/GitHub: #25.
- Review navigation and dense editor layouts to make the app more compact, reduce useless fields/spacing, improve button hierarchy, and clean up mobile/laptop display. Telegram/GitHub: #15.
- Improve the exercise cleanup workflow with clearer duplicate detection, family grouping, and image coverage status.
- Synchronize external calendars from ICS URLs/files first, then Google/Outlook OAuth free-busy, to show occupied/free time blocks without exposing private event details. Telegram/GitHub: #22.
- Extend the outdoor map beyond the shipped summit/place/route-objective browser: add recorded tracks, completed activities, route overlays, route category/completeness filters, season/doability filters, and variant/segment-aware overlays. Telegram/GitHub: #20.
- Build out the equipment UI for model versions, variants, ownership status, maintenance events, and item history now that the normalized tables exist.
- Discuss and design mountain/outdoor route tables before implementation: summits, places/trailheads, routes by activity type such as ski, climbing, and alpinism, start/end/pass-through points, and GPX trace storage.
- Resolve outdoor route planner schema and climbing topo bridge: keep existing `climbing_*` topo tables separate, add generic `outdoor_routes`, then link them later with an `outdoor_route_climbing_links` bridge.
- Add a compatibility layer from existing session activity `source_files` before introducing normalized `activity_tracks`, and keep outdoor-route Phase 1 frontend work in JS constants/shape docs while using the existing `EXPECTED_TABLES` startup migration style for backend tables.
- Add language-aware labels for normalized exercise categories and movement families.

## Technical

- Add a recurring backup plan covering VPS snapshots and SwissBackup/offsite backups.
- Automate offsite backup sync beyond the manual `scripts/download_latest_backup.ps1` helper.
- Clean duplicate UFW SSH allow rules on the VPS during a maintenance pass.
- Remove VPS backup `/home/ubuntu/rehab.backup.20260517-213317` after the `/opt/rehab` deployment path has stayed stable for a few days.
- Move the backend out of the single large `main.py` into modules for auth, sessions, exercises, equipment, climbing, and admin.
- Replace lightweight SQLite startup migrations with a real migration tool before the next large schema change.
