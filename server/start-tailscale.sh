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

echo "Starting socat proxy for MySQL..."
socat TCP-LISTEN:3306,fork,reuseaddr SOCKS5:localhost:100.66.175.61:3306,socksport=1055 &

echo "Waiting for socat to be ready..."
sleep 3

echo "Testing local MySQL connection through socat..."
nc -zv localhost 3306 || echo "⚠ socat proxy not responding yet"

echo "Starting application..."
exec node dist/index.js
