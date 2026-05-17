# Rehab Tracker

Rehab Tracker is a FastAPI and React application for training sessions, exercise management, equipment, and outdoor climbing notes.

## Stack

- Backend: FastAPI, SQLAlchemy, SQLite
- Frontend: React, Vite
- Production: Docker Compose behind host Nginx

## Local Checks

Backend tests:

```bash
python -m pip install -r backend/requirements.txt
python -m pytest backend/tests
```

Frontend tests and build:

```bash
cd frontend
npm test
npm run build
```

## Exercise Data Model

Exercises keep their existing compatibility fields:

- `category`: comma-separated category names for current imports and UI
- `movement_family`: family key used to group close variants

The database also maintains normalized taxonomy tables:

- `exercise_categories`
- `exercise_category_links`
- `exercise_movement_families`
- `exercise_movement_family_links`

Application writes sync the compatibility fields into the normalized tables. API responses still include `category`, `categories`, and `movement_family` so existing frontend code and imports keep working.

## Activity Source Files

Day activities can keep multiple external source files, such as Garmin, Strava, MyWhoosh, Wahoo, or TrainingPeaks exports. Supported source formats are FIT, TCX, and GPX.

Each source file is attached to one saved activity and stored under the backend upload directory. The activity JSON keeps a `source_files` list with parsed metric summaries and a `metric_source_preferences` map so heart rate, power, cadence, distance, duration, and calories can each use a different primary source while still showing comparisons.

## Equipment Data Model

Equipment now uses the normalized catalog structure:

- `equipment_brands`: manufacturer/brand metadata, optionally linked to `countries`
- `equipment_categories`: language-ready equipment category labels
- `equipment_models`: generic commercial model names linked to brands
- `equipment_model_versions`: product versions or generations, including release year, image, product URL, and flexible JSON technical specs
- `equipment_model_colors`, `equipment_model_sizes`, `equipment_model_variants`: exact commercial variants so color and size availability can be modeled accurately
- `equipment_items`: equipment owned by a user, linked to `users.username`
- `equipment_item_events`: purchase, service, repair, resale, lending, retirement, and other item history

Purchase price and currency are stored on owned items/events, not on models or model versions, because price depends on the buyer, shop, date, condition, discount, and resale context.

## Deployment

See [DEPLOY.md](DEPLOY.md) for VPS setup and [WORKFLOW.md](WORKFLOW.md) for local development and deployment workflow.
