#!/bin/sh
set -e

echo "Starting Tailscale daemon..."
mkdir -p /var/run/tailscale /var/lib/tailscale

# Start tailscaled with verbose logging
tailscaled --state=/var/lib/tailscale/tailscaled.state \
           --socket=/var/run/tailscale/tailscaled.sock \
           --tun=userspace-networking \
           --verbose=1 2>&1 &

TAILSCALED_PID=$!
echo "Tailscaled started with PID: $TAILSCALED_PID"

# Wait for socket
echo "Waiting for tailscaled socket..."
for i in $(seq 1 30); do
    if [ -S /var/run/tailscale/tailscaled.sock ]; then
        echo "✓ Socket exists"
        break
    fi
    sleep 1
done

# Give it extra time to initialize
echo "Waiting for daemon to fully initialize..."
sleep 10

# Try a different approach - use timeout and see what error we get
echo "Attempting to authenticate with Tailscale..."
if ! timeout 30 tailscale up --authkey=${TAILSCALE_AUTHKEY} --hostname=railway-app --accept-routes 2>&1; then
    echo "✗ tailscale up command failed or timed out"
    echo "Checking tailscaled logs..."
    sleep 2
    echo "Process status:"
    ps aux | grep tailscaled
    echo "Socket status:"
    ls -la /var/run/tailscale/
    echo "Attempting status check with longer timeout..."
    timeout 10 tailscale status || echo "Status check also failed"
    exit 1
fi

# If we get here, connection worked
echo "✓ Tailscale up command completed"

# Wait and verify connection
echo "Verifying connection..."
sleep 5

for i in $(seq 1 30); do
    if timeout 5 tailscale status 2>&1 | grep -q "100\."; then
        echo "✓ Tailscale connected!"
        timeout 5 tailscale status
        break
    fi
    
    if [ $i -eq 30 ]; then
        echo "✗ Never got connected status"
        exit 1
    fi
    sleep 2
done

echo "Testing VPS connectivity..."
timeout 10 tailscale ping 100.66.175.61 -c 2 || echo "⚠ Ping failed (may be normal if ICMP blocked)"

echo "=== Final Status ==="
timeout 5 tailscale status
echo "===================="

echo "Starting application..."
exec node dist/index.js
