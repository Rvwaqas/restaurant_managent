#!/bin/sh
# ==============================================================================
# Restaurant POS - Termux:Boot Auto-Start Script
# Place or symlink in ~/.termux/boot/10-pos-start.sh
# ==============================================================================

if command -v termux-wake-lock >/dev/null 2>&1; then
    termux-wake-lock
fi

export HOME="${HOME:-/data/data/com.termux/files/home}"
POS_DIR="${HOME}/pos"

if [ -f "${POS_DIR}/bin/pos" ]; then
    sh "${POS_DIR}/bin/pos" start
elif [ -f "${POS_DIR}/scripts/run_server.sh" ]; then
    sh "${POS_DIR}/scripts/run_server.sh" start
fi
