# Faster Local Development And Deployment

## Local development

Use the base compose file together with the dev override:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

What this gives you:

- backend runs `uvicorn --reload`
- backend code is mounted from `backend/app`
- frontend runs the Vite React dev server
- React edits hot-reload in the browser
- most backend Python edits auto-reload without rebuilding

Open:

- frontend: `http://localhost`
- backend: `http://localhost:8000`

If you change frontend dependencies or Docker settings, rebuild the frontend container:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build frontend
```

To stop local development:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

## Automated checks

Backend route tests live in `backend/tests` and use a temporary SQLite database:

```bash
python -m pip install -r backend/requirements.txt
python -m pytest backend/tests
```

Frontend checks:

```bash
cd frontend
npm test
npm run build
```

Security audit:

```bash
python -m pip install pip-audit
python scripts/security_audit.py
```

This runs a tracked-file secret scan plus Python and npm dependency audits. For a full local scan that also checks ignored `.env` files, run:

```bash
python scripts/secret_scan.py
```

GitHub also runs the `Security Audit` workflow on pull requests, on manual dispatch, and weekly.

## Exercise taxonomy

Exercise categories and movement families are now normalized in real tables with foreign keys:

- `exercise_categories`
- `exercise_category_links`
- `exercise_movement_families`
- `exercise_movement_family_links`

The API still accepts and returns the legacy `category` and `movement_family` fields for compatibility. Backend writes synchronize those fields into the normalized tables, and responses also include a `categories` array.

## Equipment catalog

Equipment brands, models, versions, variants, and owned items are normalized in real tables:

- `equipment_categories`
- `equipment_models`
- `equipment_model_versions`
- `equipment_model_colors`
- `equipment_model_sizes`
- `equipment_model_variants`
- `equipment_items`
- `equipment_item_events`

The `/api/equipment` and `/api/my-equipment` endpoints keep their existing frontend-facing shape where practical, but they now persist to model versions and owned items. Purchase price and currency belong to `equipment_items` or `equipment_item_events`, not to generic models or model versions.

Production deploy imports both `imports/equipment_brands_enriched.csv` and `imports/equipment_models_seed.csv`. The models seed favors broad model-line coverage over invented year data; add verified year/generation rows to the CSV when available.

## Fast deployment on the VPS

From the project directory on the VPS:

```bash
./deploy.sh
```

What `deploy.sh` does:

- enters the project directory
- runs `git pull --ff-only` if the project is a git checkout
- rebuilds and restarts the production containers
- shows the running container status

If Docker still requires `sudo` on the VPS, run:

```bash
sudo ./deploy.sh
```

## Recommended long-term setup

For the smoothest workflow:

1. keep this project in git
2. push local changes to your remote repository
3. on the VPS, keep one checkout of the repo
4. deploy with `./deploy.sh`

That way your normal cycle becomes:

1. edit locally
2. test locally with the dev compose override
3. commit and push
4. SSH to the VPS
5. run `./deploy.sh`

## Telegram issue automation

This project also supports a Telegram-driven planning flow:

1. Telegram message
2. GitHub issue created by the VPS bot
3. issue labeled `from-telegram` and `codex-ready`
4. GitHub Action adds a deterministic Codex handoff comment

This flow is intentionally simple and reliable:

- Telegram is the quick mobile inbox
- GitHub is the real backlog
- Codex picks up the GitHub issue when implementation starts

Useful Telegram bot commands:

- `/backlog` to list open Telegram-created issues
- `/show 12` to show issue `#12`
- `/codex 12` to get a ready-to-paste Codex prompt for issue `#12`
- `/done 12` to close issue `#12`
- `/open 12` to reopen issue `#12`

The workflow does not try to auto-start Codex or auto-create PRs. Instead, it
keeps the handoff explicit and predictable for mobile use.
