#!/bin/bash
# setup.sh — One-time setup for desktop-automator Wayland support
# Run: sudo bash setup.sh
#
# No python3-dev needed — we use pure Python ctypes/struct to read /dev/input/eventX.
# Only needs udev rule for device read access.

set -e

echo "=== Desktop Automator Setup ==="

# 1. Install Python dependencies (no python3-dev needed)
echo "[1/2] Installing Python packages..."
pip install pynput mss Pillow pytesseract opencv-python numpy psutil || true

# 2. Set up udev rule for /dev/input readability
echo "[2/2] Setting up udev rule for input device access..."
cat > /etc/udev/rules.d/99-input-readable.rules << 'EOF'
# Allow desktop-automator to read input devices for recording on Wayland
KERNEL=="event[0-9]*", MODE="0666"
EOF
udevadm control --reload-rules
udevadm trigger

echo ""
echo "=== Setup Complete ==="
echo ""
echo "What was configured:"
echo "  - Python packages: pynput, mss, Pillow, etc."
echo "  - udev rule: /dev/input/eventX readable by all users (MODE=0666)"
echo ""
echo "No re-login needed! The udev rule takes effect immediately for new device access."
echo ""
echo "Test input listener with:"
echo "  python3 -c 'from lib.input_listener import EvdevInputListener; print(\"OK\")'"
