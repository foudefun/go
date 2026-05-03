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
docker compose -f docker-compose.prod.yml up -d --build
```

The production compose file binds:

- frontend to `127.0.0.1:8080`
- backend to `127.0.0.1:8000`

That keeps the containers private behind host Nginx.

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

```bash
cd /home/user/rehab
docker compose -f docker-compose.prod.yml up -d --build
```

If the project is checked out from git, you can use:

```bash
./deploy.sh
```

## Notes

- The frontend now calls `/api`, so it works behind a reverse proxy.
- The frontend container itself also proxies `/api` to the backend, so local Docker usage still works.
- Persistent SQLite data lives in `backend/data/db.sqlite`.
- Back up the whole `backend/data/` directory.
- For faster local iteration, use `docker-compose.dev.yml` together with `docker-compose.yml`.
