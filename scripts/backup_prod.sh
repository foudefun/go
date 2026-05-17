#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATA_DIR="${REHAB_BACKUP_DATA_DIR:-$ROOT_DIR/backend/data}"
BACKUP_DIR="${REHAB_BACKUP_DIR:-$ROOT_DIR/backups}"
RETENTION_DAYS="${REHAB_BACKUP_RETENTION_DAYS:-14}"

DB_PATH="$DATA_DIR/db.sqlite"
UPLOADS_DIR="$DATA_DIR/uploads"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
WORK_DIR="$BACKUP_DIR/.tmp-$TIMESTAMP"
ARCHIVE_PATH="$BACKUP_DIR/rehab-backup-$TIMESTAMP.tar.gz"

if [ ! -f "$DB_PATH" ]; then
  echo "Database not found: $DB_PATH" >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
rm -rf "$WORK_DIR"
mkdir -p "$WORK_DIR"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

sqlite3 "$DB_PATH" ".backup '$WORK_DIR/db.sqlite'"

if [ -d "$UPLOADS_DIR" ]; then
  tar -C "$DATA_DIR" -cf "$WORK_DIR/uploads.tar" uploads
else
  tar -C "$WORK_DIR" -cf "$WORK_DIR/uploads.tar" --files-from /dev/null
fi

cat > "$WORK_DIR/manifest.txt" <<EOF
created_at_utc=$TIMESTAMP
source_root=$ROOT_DIR
source_database=$DB_PATH
source_uploads=$UPLOADS_DIR
hostname=$(hostname)
EOF

tar -C "$WORK_DIR" -czf "$ARCHIVE_PATH" db.sqlite uploads.tar manifest.txt
chmod 600 "$ARCHIVE_PATH"

find "$BACKUP_DIR" -maxdepth 1 -name "rehab-backup-*.tar.gz" -type f -mtime +"$RETENTION_DAYS" -delete

echo "$ARCHIVE_PATH"
