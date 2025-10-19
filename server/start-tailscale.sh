#!/bin/sh
set -e

echo "Starting Tailscale..."
tailscaled --tun=userspace-networking \
           --socks5-server=localhost:1055 \
           --state=/var/lib/tailscale/state \
           --socket=/var/run/tailscale/tailscaled.sock &

sleep 5

echo "Connecting to tailnet..."
tailscale up --authkey=${TAILSCALE_AUTHKEY} --hostname=railway-app --accept-routes --accept-dns=false

echo "Waiting for connection..."
sleep 10

echo "=== Tailscale Status ==="
tailscale status | grep "tower2"
echo "========================"

echo "Starting Node.js SOCKS proxy for MySQL..."
node /socks-proxy.js &

sleep 3

echo "Testing proxy..."
nc -zv localhost 3306 || echo "⚠ Proxy not ready yet"

echo "Starting application..."
exec node dist/index.js
