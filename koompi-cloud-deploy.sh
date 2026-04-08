#!/usr/bin/env bash
set -euo pipefail

# Sarawan Social — KOOMPI Cloud Deployment Script
# Usage: ./koompi-cloud-deploy.sh [domain]

DOMAIN="${1:-api.sarawan.social}"
APP_DIR="/opt/sarawan-social"
REPO="${REPO:-git@github.com:KOOMPI/sarawan-social.git}"
BRANCH="${BRANCH:-main}"

echo "🚀 Deploying Sarawan Social to KOOMPI Cloud"
echo "   Domain: $DOMAIN"
echo "   App dir: $APP_DIR"

# ---- Prerequisites ----
command -v docker >/dev/null 2>&1 || { echo "❌ Docker required"; exit 1; }
command -v docker compose >/dev/null 2>&1 || { echo "❌ Docker Compose v2 required"; exit 1; }

# ---- Clone or update ----
if [ -d "$APP_DIR" ]; then
    echo "📦 Updating existing deployment..."
    cd "$APP_DIR"
    git fetch origin "$BRANCH"
    git reset --hard "origin/$BRANCH"
else
    echo "📦 Cloning repository..."
    git clone -b "$BRANCH" "$REPO" "$APP_DIR"
    cd "$APP_DIR"
fi

# ---- Environment ----
if [ ! -f .env ]; then
    echo "⚙️  Creating .env from template..."
    cat > .env << 'EOF'
# Change this to a strong random value!
API_KEY=changeme-on-first-deploy
EOF
    echo "⚠️  IMPORTANT: Edit $APP_DIR/.env and set API_KEY before continuing."
    echo "   Then re-run this script."
    exit 1
fi

# ---- Build and deploy ----
echo "🔨 Building Docker images..."
docker compose build --no-cache api

echo "🔄 Restarting services..."
docker compose up -d

echo "⏳ Waiting for health check..."
for i in $(seq 1 30); do
    if curl -sf http://localhost:3001/health >/dev/null 2>&1; then
        echo "✅ API is healthy"
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "❌ API failed to start. Check logs:"
        docker compose logs api --tail=50
        exit 1
    fi
    sleep 2
done

# ---- Nginx (if SSL not set up yet) ----
if ! [ -f /etc/letsencrypt/live/"$DOMAIN"/fullchain.pem ]; then
    echo "🔐 Setting up SSL with certbot..."
    if command -v certbot >/dev/null 2>&1; then
        certbot certonly --nginx -d "$DOMAIN" --non-interactive --agree-tos
        echo "📋 Copy nginx.conf to /etc/nginx/sites-available/sarawan.conf"
        echo "   and reload nginx: sudo nginx -t && sudo systemctl reload nginx"
    else
        echo "⚠️  certbot not installed. Install with: pacman -S certbot-nginx"
        echo "   For now, API is available at http://localhost:3001"
    fi
fi

echo ""
echo "✅ Sarawan Social deployed successfully!"
echo "   API: http://localhost:3001"
echo "   Health: http://localhost:3001/health"
if [ -f /etc/letsencrypt/live/"$DOMAIN"/fullchain.pem ]; then
    echo "   HTTPS: https://$DOMAIN"
fi
echo ""
echo "📋 Next steps:"
echo "   1. Set API_KEY in $APP_DIR/.env"
echo "   2. Configure platform credentials"
echo "   3. Set up nginx reverse proxy (see nginx.conf)"
echo "   4. Test: curl -H 'Authorization: Bearer YOUR_KEY' http://localhost:3001/api/platforms"
