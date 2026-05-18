# Security Review

Last reviewed: 2026-05-18

## Scope

This review covers application authentication, sessions, uploads, secrets, dependency exposure, CI checks, deployment settings, VPS permissions, backup handling, and restoration.

## Current Controls

- Authentication uses server-side sessions with HttpOnly cookies. Secure cookies are expected in production HTTPS, and mutating requests are protected with CSRF checks.
- Temporary login lockout is enabled after 6 failed attempts.
- Legacy bearer-token authentication is disabled in production with `REHAB_ALLOW_BEARER_AUTH=false`.
- Security-relevant events are recorded in the application audit log, including failed login and legacy bearer-auth usage.
- Secrets are not committed to git. Local production secrets remain in ignored `.env` files.
- `scripts/security_audit.py` runs a tracked-file secret scan, Python dependency audit, and frontend `npm audit`.
- GitHub Actions runs the security audit workflow and deploys with minimal repository permissions.
- Production deploy uses a dedicated `deploy` user under `/opt/rehab`.
- Production containers bind backend and frontend services to `127.0.0.1`; only nginx exposes public HTTP/HTTPS.
- VPS firewall is active with public access limited to SSH, HTTP, and HTTPS.
- SSH password authentication and root login are disabled.
- Production secret files are owned by `deploy` and restricted to mode `600`.
- Production database/uploads and backup directories are restricted to mode `700`.
- Uploaded images and activity source files have server-side validation for type, size, and expected format.
- Production backups run daily and a real restore test has passed.
- A local off-VPS backup download helper exists at `scripts/download_latest_backup.ps1`.

## Production Checks

Verified on 2026-05-18:

- `ufw` active with default incoming deny.
- Public listeners are SSH, HTTP, and HTTPS.
- Backend and frontend Docker ports are bound to localhost only.
- `.env.production` and `.env.telegram-bot` are mode `600`.
- `/opt/rehab/backend/data` and `/opt/rehab/backups` are mode `700`.
- No world-writable files were found under `/opt/rehab`.
- SSH reports `PermitRootLogin no` and `PasswordAuthentication no`.
- Telegram issue service is active.
- Latest production backup archive is readable and restoration integrity check succeeded.

## Residual Risks

- Backups still primarily live on the VPS unless the manual off-VPS download script is run. A scheduled offsite backup sync would reduce recovery risk.
- UFW has duplicate SSH allow rules. This is not an exposure increase, but it should be cleaned during a maintenance pass.
- Full backend/frontend test jobs are not yet part of CI, outside the security audit workflow.
- Backend startup migrations are still lightweight SQLite migrations. A real migration tool is safer before the next large schema change.
- The old VPS deployment backup should be removed after the `/opt/rehab` deployment path has stayed stable.
