# Faster Local Development And Deployment

## Local development

Use the base compose file together with the dev override:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build
```

What this gives you:

- backend runs `uvicorn --reload`
- backend code is mounted from `backend/app`
- frontend files are mounted directly from `frontend`
- most frontend edits only need a browser refresh
- most backend Python edits auto-reload without rebuilding

Open:

- frontend: `http://localhost`
- backend: `http://localhost:8000`

If you change `frontend/nginx.conf`, restart the frontend container:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart frontend
```

To stop local development:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

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
