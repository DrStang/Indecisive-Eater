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
cd /app
node socks-proxy.js &

PROXY_PID=$!
echo "Proxy started with PID: $PROXY_PID"

sleep 3

echo "Testing proxy..."
if nc -zv localhost 3306 2>&1 | grep -q "open\|succeeded"; then
    echo "✓ Proxy is working!"
else
    echo "⚠ Proxy test inconclusive, continuing anyway..."
fi

echo "Starting application..."
exec node dist/index.js
