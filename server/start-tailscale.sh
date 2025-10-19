#!/bin/sh
set -e

echo "Starting Tailscale..."
tailscaled --tun=userspace-networking --state=/var/lib/tailscale/state --socket=/var/run/tailscale/tailscaled.sock &

sleep 5

echo "Connecting to tailnet..."
tailscale up --authkey=${TAILSCALE_AUTHKEY} --hostname=railway-app --accept-routes

echo "Waiting for connection..."
sleep 10

echo "=== Tailscale Status ==="
tailscale status
echo "========================"

echo "=== Checking route to VPS ==="
tailscale status | grep "100.66.175.61" || echo "❌ VPS (100.66.175.61) not in peer list!"
echo "=============================="

echo "=== All Tailscale Peers ==="
tailscale status
echo "============================"

echo "=== Testing ping to VPS ==="
tailscale ping 100.66.175.61 -c 3 --timeout=10s || echo "⚠ Ping failed"
echo "============================"

echo "=== Testing TCP connection to MySQL port ==="
if command -v nc >/dev/null 2>&1; then
    timeout 5 nc -zv 100.66.175.61 3306 || echo "❌ Cannot connect to port 3306"
else
    echo "nc not available, installing..."
    apk add --no-cache netcat-openbsd
    timeout 5 nc -zv 100.66.175.61 3306 || echo "❌ Cannot connect to port 3306"
fi
echo "============================================="

echo "=== Route table ==="
ip route
echo "==================="

echo "Starting application..."
exec node dist/index.js
