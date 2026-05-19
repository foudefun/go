# Backlog

## Product

- Add deletion/replacement controls for attached activity source files and show raw time-series overlays, not only summary metric comparisons.
- Add imported activity file stats: per file/source provider, parsed metrics, ignored/missing fields, duplicate detection, and import history visible from the activity.
- Add a plyometric exercise type, seed split stance box jump, lateral plate hops, depth drop jumps, and broad jumps, and create muscle-impact images for those exercises.
- Add richer muscle-impact details per exercise, beyond the current high-level category/description.
- Improve time entry/display for exercise sets so time-based work is not entered or shown as raw seconds only.
- Collapse or compact previous/performed exercise cards in the activity editor so past activities are easier to scan.
- Rename save actions in the activity flow so it is clear whether the user is saving an exercise item, an activity, or the whole day.
- Clarify what happens after creating a new activity, including whether a later "Save day" action is still needed.
- Reduce spacing and improve small-screen layout for the activity and exercise editors on mobile/laptop screens.
- Improve the exercise cleanup workflow with clearer duplicate detection, family grouping, and image coverage status.
- Build out the equipment UI for model versions, variants, ownership status, maintenance events, and item history now that the normalized tables exist.
- Discuss and design mountain/outdoor route tables before implementation: summits, places/trailheads, routes by activity type such as ski, climbing, and alpinism, start/end/pass-through points, and GPX trace storage.
- Add language-aware labels for normalized exercise categories and movement families.
- Improve mobile layouts for dense editors, especially exercise editing and day/session activity editing.

## Technical

- Add a recurring backup plan covering VPS snapshots and SwissBackup/offsite backups.
- Automate offsite backup sync beyond the manual `scripts/download_latest_backup.ps1` helper.
- Keep Telegram backlog bot diagnostics visible: respond to unauthorized chats with the expected `TELEGRAM_ALLOWED_CHAT_ID`, and verify `/todo` command handling after config changes.
- Clean duplicate UFW SSH allow rules on the VPS during a maintenance pass.
- Remove VPS backup `/home/ubuntu/rehab.backup.20260517-213317` after the `/opt/rehab` deployment path has stayed stable for a few days.
- Move the backend out of the single large `main.py` into modules for auth, sessions, exercises, equipment, climbing, and admin.
- Replace lightweight SQLite startup migrations with a real migration tool before the next large schema change.
