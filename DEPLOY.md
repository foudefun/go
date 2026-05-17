# Deploying On An Infomaniak VPS

## 1. Provision the VPS

Use an Ubuntu/Debian VPS with a public IP. Point your domain or subdomain DNS to that IP before enabling HTTPS.

## 2. Install Docker and Nginx

```bash
sudo apt update
sudo apt install -y ca-certificates curl gnupg nginx certbot python3-certbot-nginx ufw
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker
```

Open the firewall:

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
```

## 3. Copy the project to the VPS

Example:

```bash
scp -r ./rehab user@your-vps-ip:/home/user/rehab
```

## 4. Start the app in production mode

```bash
cd /home/user/rehab
cp .env.production.example .env.production
chmod 600 .env.production
docker compose -f docker-compose.prod.yml up -d --build
```

The production compose file binds:

- frontend to `127.0.0.1:8080`
- backend to `127.0.0.1:8000`

That keeps the containers private behind host Nginx.

Production environment notes:

- Keep real secrets only in `.env.production`; it is ignored by git.
- `REHAB_DEFAULT_PASSWORD` is needed only when creating the very first admin in an empty database. Remove it from `.env.production` after the admin account exists.
- `REHAB_ALLOW_BEARER_AUTH=true` keeps temporary compatibility for old clients that still send `Authorization: Bearer ...`. Once the admin security events show no legitimate `bearer_auth_used` entries, switch it to `false` and redeploy.
- Do not put API tokens, private keys, or real passwords in compose files or committed docs.
- Confirm `.env.production` is not served by Nginx; the production Nginx config blocks `.env*` probes.

GitHub Actions deploy secrets:

- `VPS_HOST`: production host name or IP only.
- `VPS_USER`: the SSH user used for deployment. Prefer a dedicated deploy user with Docker access and no broad sudo access.
- `VPS_SSH_KEY`: private key for that deploy user only. Do not reuse a personal SSH key.

The deploy workflow only needs repository read access, SSH to the VPS, and permission to run `/home/ubuntu/rehab/deploy.sh`. It does not need GitHub write permissions, repository administration permissions, or access to production application secrets.

## 5. Configure host Nginx

Use `deploy/nginx/rehab.conf` as a template. It is currently set up for `go.foudefun.ch`:

```bash
sudo cp deploy/nginx/rehab.conf /etc/nginx/sites-available/rehab
sudo ln -s /etc/nginx/sites-available/rehab /etc/nginx/sites-enabled/rehab
sudo nginx -t
sudo systemctl reload nginx
```

Replace `yourdomain.com` and `www.yourdomain.com` with your real domain names first.

## 6. Enable HTTPS

```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```

## 7. Updating later

Run the local checks before deploying larger changes:

```bash
python -m pytest backend/tests
cd frontend
npm test
npm run build
```

```bash
cd /home/user/rehab
docker compose -f docker-compose.prod.yml up -d --build
```

If the project is checked out from git, you can use:

```bash
./deploy.sh
```

## 8. Optional: Telegram -> GitHub issue bot

This project includes a small Telegram bot that can turn a message into a GitHub issue.

1. Copy the environment example:

```bash
cd /home/user/rehab
cp .env.telegram-bot.example .env.telegram-bot
chmod 600 .env.telegram-bot
```

2. Fill in:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_ALLOWED_CHAT_ID`
- `GITHUB_TOKEN`

3. Install the systemd unit:

```bash
sudo cp deploy/systemd/go-telegram-issues.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now go-telegram-issues.service
```

4. Check logs:

```bash
sudo journalctl -u go-telegram-issues.service -f
```

## Notes

- The frontend now calls `/api`, so it works behind a reverse proxy.
- The frontend container itself also proxies `/api` to the backend, so local Docker usage still works.
- Persistent SQLite data lives in `backend/data/db.sqlite`.
- Back up the whole `backend/data/` directory.
- For faster local iteration, use `docker-compose.dev.yml` together with `docker-compose.yml`.
