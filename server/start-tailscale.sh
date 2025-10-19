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
node socks-proxy.cjs > /tmp/proxy.log 2>&1 &

PROXY_PID=$!
echo "Proxy started with PID: $PROXY_PID"

# Wait and check if it's actually running
sleep 3

if ! kill -0 $PROXY_PID 2>/dev/null; then
    echo "❌ Proxy process died! Checking logs:"
    cat /tmp/proxy.log
    exit 1
fi

echo "Proxy process is running. Checking logs:"
cat /tmp/proxy.log

echo "Testing proxy with timeout..."
timeout 5 nc -zv localhost 3306 2>&1 && echo "✓ Proxy is responding!" || echo "⚠ Proxy test timed out or failed"

echo "Starting application..."
exec node dist/index.js
