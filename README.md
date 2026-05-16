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

## Deployment

See [DEPLOY.md](DEPLOY.md) for VPS setup and [WORKFLOW.md](WORKFLOW.md) for local development and deployment workflow.

