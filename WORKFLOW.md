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

The previous static app is still available at:

- legacy tracker: `http://localhost/legacy.html`

If you change frontend dependencies or Docker settings, rebuild the frontend container:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up --build frontend
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
