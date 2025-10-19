#!/bin/sh
set -e

echo "Starting Tailscale daemon..."
mkdir -p /var/run/tailscale /var/lib/tailscale
tailscaled --state=/var/lib/tailscale/tailscaled.state --socket=/var/run/tailscale/tailscaled.sock --tun=userspace-networking 2>&1 &

TAILSCALED_PID=$!
echo "Tailscaled started with PID: $TAILSCALED_PID"

# Wait for tailscaled socket to be ready
echo "Waiting for tailscaled socket..."
for i in $(seq 1 30); do
    if [ -S /var/run/tailscale/tailscaled.sock ]; then
        echo "✓ Socket exists"
        break
    fi
    if [ $i -eq 30 ]; then
        echo "✗ Tailscaled socket never appeared"
        exit 1
    fi
    sleep 1
done

# Now verify we can communicate with it - wait MUCH longer
echo "Verifying tailscaled is responsive..."
for i in $(seq 1 60); do
    if tailscale status >/dev/null 2>&1; then
        echo "✓ Tailscaled is responsive after ${i} seconds"
        break
    fi
    if [ $i -eq 60 ]; then
        echo "✗ Tailscaled not responding after 60 seconds"
        echo "Checking if process is still running..."
        ps aux | grep tailscaled || true
        exit 1
    fi
    echo "Attempt $i/60..."
    sleep 1
done

echo "Connecting to Tailscale (ephemeral)..."
tailscale up --authkey=${TAILSCALE_AUTHKEY} --hostname=railway-app --accept-routes

# Wait for FULL connection
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
        if tailscale ping 100.66.175.61 -c 2 --timeout=10s 2>&1; then
            echo "✓ Can reach VPS!"
        else
            echo "⚠ Warning: Cannot ping VPS"
            echo "This might be OK if ICMP is blocked. Attempting MySQL connection test..."
            # Check if we can at least see the IP in routing
            tailscale status | grep "100.66.175.61" || echo "VPS not in peer list"
        fi
        
        break
    fi
    
    if [ $i -eq 60 ]; then
        echo "✗ Failed to connect to Tailscale after 60 seconds"
        echo "Last status: $STATUS"
        tailscale status || true
        exit 1
    fi
    
    if [ $((i % 5)) -eq 0 ]; then
        echo "Still waiting... ($i/60)"
    fi
    sleep 1
done

# Show final network info
echo "=== Tailscale Network Info ==="
tailscale status
echo "=============================="

echo "Starting application..."
exec node dist/index.js
