#!/bin/bash
# =============================================================================
# deploy_local.sh — Deploy current workspace files directly to the website
#                  (Skips pulling from GitHub/Git)
# =============================================================================
set -euo pipefail

DEPLOY_DIR="/root/Hotel_Santosh"
LOG_DIR="/var/log/hotel-santosh"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "🚀 [$TIMESTAMP] Starting Santosh Palace local-to-live deploy..."

# ── Ensure log directory exists ────────────────────────────────────────────────
mkdir -p "$LOG_DIR"

# ── Backend: install Python deps + restart ─────────────────────────────────────
echo "🐍 Updating backend dependencies..."
cd "$DEPLOY_DIR/backend"
source venv/bin/activate
pip install -r requirements.txt -q --no-warn-script-location
deactivate

echo "♻️  Restarting API process via PM2..."
pm2 restart hotel-santosh-api || pm2 start ecosystem.config.js

# ── Frontend: install npm deps + build ────────────────────────────────────────
echo "📦 Installing frontend dependencies..."
cd "$DEPLOY_DIR/frontend"
npm ci --silent --prefer-offline

echo "🏗️  Building React/Vite production bundle..."
npm run build

# ── Nginx: reload config (no restart needed for static asset changes) ──────────
echo "🔄 Reloading Nginx..."
sudo nginx -s reload

echo ""
echo "✅ Deployed successfully to production at $(date '+%Y-%m-%d %H:%M:%S')"
echo "   API:     https://santosh.snapkhata.com/api/health"
echo "   App:     https://santosh.snapkhata.com"
