#!/bin/sh
set -e

echo "Starting Tailscale daemon..."
mkdir -p /var/run/tailscale /var/lib/tailscale
tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock --tun=userspace-networking &

# Wait for tailscaled socket to be ready
echo "Waiting for tailscaled to be ready..."
for i in $(seq 1 30); do
    if tailscale status >/dev/null 2>&1; then
        echo "✓ Tailscaled is ready"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "✗ Tailscaled failed to start"
        exit 1
    fi
    sleep 1
done

echo "Connecting to Tailscale (ephemeral)..."
tailscale up --authkey=${TAILSCALE_AUTHKEY} --hostname=railway-app-${RAILWAY_DEPLOYMENT_ID:-unknown} --accept-routes

# Wait for FULL connection with better checks
echo "Waiting for Tailscale connection..."
for i in $(seq 1 60); do
    STATUS=$(tailscale status 2>&1 || echo "error")
    
    # Check if we have a valid status output with an IP
    if echo "$STATUS" | grep -q "100\."; then
        echo "✓ Tailscale connected!"
        echo "$STATUS"
        
        # Extra wait to ensure network is fully ready
        echo "Allowing network to stabilize..."
        sleep 5
        
        # Test connectivity to your VPS
        echo "Testing connection to VPS (100.66.175.61)..."
        if tailscale ping 100.66.175.61 -c 1 --timeout=5s; then
            echo "✓ Can reach VPS!"
        else
            echo "⚠ Warning: Cannot ping VPS, but will try to continue..."
        fi
        
        break
    fi
    
    if [ $i -eq 60 ]; then
        echo "✗ Failed to connect to Tailscale after 60 seconds"
        echo "Last status: $STATUS"
        exit 1
    fi
    
    echo "Waiting... ($i/60)"
    sleep 1
done

# Show final network info
echo "=== Tailscale Network Info ==="
tailscale status
echo "=============================="

echo "Starting application..."
exec node dist/index.js
