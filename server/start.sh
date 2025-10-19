#!/bin/sh
set -e

echo "Starting Tailscale daemon..."
mkdir -p /tmp/tailscale
tailscaled --state=/tmp/tailscale/tailscaled.state --socket=/tmp/tailscale/tailscaled.sock --tun=userspace-networking &

sleep 3

echo "Connecting to Tailscale (ephemeral)..."
tailscale up --authkey=${TAILSCALE_AUTHKEY} --hostname=railway-app-${RAILWAY_DEPLOYMENT_ID:-unknown} --accept-routes

# Wait for connection
echo "Waiting for Tailscale connection..."
for i in $(seq 1 10); do
    if tailscale status --json 2>/dev/null | grep -q '"Online":true'; then
        echo "✓ Tailscale connected!"
        tailscale status
        break
    fi
    echo "Waiting... ($i/10)"
    sleep 2
done

echo "Starting application..."
exec node dist/index.js
