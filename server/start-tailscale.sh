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

echo "Starting MySQL proxy through Tailscale SOCKS5..."
# Use a different socat syntax - proxy via SOCKS4A (which Tailscale SOCKS5 supports)
socat TCP-LISTEN:3306,fork,reuseaddr SOCKS4A:localhost:100.66.175.61:3306,socksport=1055 &

SOCAT_PID=$!
echo "Socat proxy started with PID: $SOCAT_PID"

echo "Waiting for socat to be ready..."
sleep 3

echo "Testing local MySQL connection through socat..."
if nc -zv localhost 3306 2>&1; then
    echo "✓ Proxy is listening on localhost:3306"
else
    echo "⚠ Proxy not responding"
fi

echo "Starting application..."
exec node dist/index.js
