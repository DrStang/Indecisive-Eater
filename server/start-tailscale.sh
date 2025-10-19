#!/bin/sh
set -e

echo "Starting Tailscale..."
tailscaled --tun=userspace-networking --state=/var/lib/tailscale/state --socket=/var/run/tailscale/tailscaled.sock &

sleep 5

echo "Connecting to tailnet..."
tailscale up --authkey=${TAILSCALE_AUTHKEY} --hostname=railway-app

echo "Waiting for connection..."
sleep 10

echo "Tailscale status:"
tailscale status

echo "Starting application..."
exec node dist/index.js
