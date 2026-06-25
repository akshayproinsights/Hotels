#!/bin/bash
# =============================================================================
# deploy.sh — Santosh Palace one-command deploy
# Run after every `git push` to the server
#
# Usage:
#   cd /var/www/santosh-palace && ./deploy.sh
# =============================================================================
set -euo pipefail

DEPLOY_DIR="/var/www/santosh-palace"
LOG_DIR="/var/log/santosh-palace"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

echo "🚀 [$TIMESTAMP] Starting Santosh Palace deploy..."

# ── Ensure log directory exists ────────────────────────────────────────────────
mkdir -p "$LOG_DIR"

# ── Pull latest code ───────────────────────────────────────────────────────────
cd "$DEPLOY_DIR"
echo "📥 Pulling latest changes from origin/main..."
git pull origin main

# ── Backend: install Python deps + restart ─────────────────────────────────────
echo "🐍 Updating backend dependencies..."
cd "$DEPLOY_DIR/backend"
source venv/bin/activate
pip install -r requirements.txt -q --no-warn-script-location
deactivate

echo "♻️  Restarting API process via PM2..."
pm2 restart santosh-palace-api

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
echo "✅ Deployed successfully at $(date '+%Y-%m-%d %H:%M:%S')"
echo "   API:     https://santosh.snapkhata.com/api/health"
echo "   App:     https://santosh.snapkhata.com"
