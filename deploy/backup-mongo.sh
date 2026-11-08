#!/usr/bin/env bash
# Nightly database backup: one compressed file per day in /var/backups/shop-portal, the last 14 days are kept.
# Run by cron (see docs/DEPLOY.md). Photos are not in here: they live in Cloudflare R2.
set -euo pipefail
cd "$(dirname "$0")/.."

uri=$(grep -E '^MONGODB_URI=' .env | head -n1 | cut -d= -f2-)
[ -n "$uri" ] || { echo "MONGODB_URI not found in .env" >&2; exit 1; }

dir=/var/backups/shop-portal
mkdir -p "$dir"
mongodump --uri="$uri" --archive="$dir/shop-$(date +%F).gz" --gzip --quiet
find "$dir" -name 'shop-*.gz' -mtime +14 -delete
echo "Backup saved: $dir/shop-$(date +%F).gz"
