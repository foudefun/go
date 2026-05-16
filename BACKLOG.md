# Backlog

## High priority

- Complete a real production pass through the migrated calendar/day editor, including activity image upload and delete.
- Remove `legacy.html` after one stable release without needing fallback links.
- Expand automated backend coverage around sessions, equipment foreign keys, and import workflows.
- Finish translating remaining older admin/import/outdoor-climbing labels that are still hardcoded in React.

## Product

- Improve the exercise cleanup workflow with clearer duplicate detection, family grouping, and image coverage status.
- Add richer equipment and "my gear" workflows: equipment images, ownership status, maintenance notes, and model-level details.
- Add language-aware labels for normalized exercise categories and movement families.
- Improve mobile layouts for dense editors, especially exercise editing and day/session activity editing.

## Technical

- Move the backend out of the single large `main.py` into modules for auth, sessions, exercises, equipment, climbing, and admin.
- Replace lightweight SQLite migrations with a real migration tool before adding larger schema changes.
- Decide whether production deploy should stay manual-only or restore GitHub Actions with fixed VPS secrets.
- Add CI steps for `python -m pytest backend/tests`, frontend tests, and frontend build.

