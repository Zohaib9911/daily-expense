#!/usr/bin/env bash
# Update the live site after you push new code to GitHub. Run on the server as the app user:
#   cd /var/www/shop-portal && bash deploy/deploy.sh
set -euo pipefail
cd "$(dirname "$0")/.."

echo "1/4 Getting the latest code..."
git pull --ff-only

echo "2/4 Installing packages..."
npm ci

echo "3/4 Building (takes a minute or two)..."
npm run build

echo "4/4 Restarting the app..."
if pm2 describe shop-portal >/dev/null 2>&1; then
  pm2 reload shop-portal --update-env
else
  pm2 start ecosystem.config.cjs
fi
pm2 save
echo "Done. Check: pm2 status   and   pm2 logs shop-portal --lines 30"
