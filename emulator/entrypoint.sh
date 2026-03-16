#!/bin/bash
set -e

# Start virtual display for headless rendering
Xvfb :99 -screen 0 1280x720x24 +extension GLX &
export DISPLAY=:99
export LIBGL_ALWAYS_SOFTWARE=1
export GALLIUM_DRIVER=llvmpipe

# Wait for Xvfb to be ready
sleep 1

echo "Xvfb started on :99"
echo "Starting emulator service..."

exec python3 -m emulator.main
