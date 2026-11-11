#!/bin/sh
# ==============================================================================
# Restaurant POS - Termux & Android Environment Diagnostic Tool
# Self-contained: runs with ONLY 'sh' and standard system utilities.
# Writes final report to pos_termux_check_report.txt AND prints to stdout.
# ==============================================================================

set -u

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

PASS_COUNT=0
WARN_COUNT=0
FAIL_COUNT=0

log_pass() {
    printf "%b[PASS]%b %s\n" "${GREEN}" "${NC}" "$1"
    PASS_COUNT=$((PASS_COUNT + 1))
}

log_warn() {
    printf "%b[WARN]%b %s\n" "${YELLOW}" "${NC}" "$1"
    WARN_COUNT=$((WARN_COUNT + 1))
}

log_fail() {
    printf "%b[FAIL]%b %s\n" "${RED}" "${NC}" "$1"
    FAIL_COUNT=$((FAIL_COUNT + 1))
}

log_info() {
    printf "%b[INFO]%b %s\n" "${BLUE}" "${NC}" "$1"
}

printf "============================================================\n"
printf "    Restaurant POS - Termux Diagnostic & Readiness Check    \n"
printf "============================================================\n\n"

# 1. Android OS & Kernel
log_info "Probing Android OS and Kernel..."
ARCH=$(uname -m 2>/dev/null || echo "unknown")
log_info "CPU Architecture: $ARCH"

ANDROID_VER="unknown"
ANDROID_SDK="0"
if command -v getprop >/dev/null 2>&1; then
    ANDROID_VER=$(getprop ro.build.version.release 2>/dev/null || echo "unknown")
    ANDROID_SDK=$(getprop ro.build.version.sdk 2>/dev/null || echo "0")
    log_info "Android Version: $ANDROID_VER (SDK $ANDROID_SDK)"

    if [ "$ANDROID_SDK" -ge 31 ]; then
        log_warn "Android 12+ detected (SDK $ANDROID_SDK). Android Phantom Process Killer may kill background servers."
        printf "       RECOMMENDATION: On Android 14+, enable 'Disable child process restrictions' in Developer Options.\n"
        printf "       On Android 12-13, run via adb: adb shell 'settings put global settings_enable_monitor_phantom_procs false'\n"
    else
        log_pass "Android version ($ANDROID_VER) has no phantom process killer restrictions."
    fi
else
    log_info "Non-Android environment or getprop not accessible (testing mode)."
fi

# 2. Termux Package Source & Version
TERMUX_SOURCE="unknown"
if [ -d "/data/data/com.termux" ]; then
    log_pass "Running inside native Termux environment (/data/data/com.termux detected)."
    
    # Check if installed from deprecated Play Store
    if command -v pm >/dev/null 2>&1; then
        INSTALLER=$(pm get-install-source com.termux 2>/dev/null || echo "unknown")
        TERMUX_SOURCE="$INSTALLER"
        if echo "$INSTALLER" | grep -qi "vending"; then
            log_fail "Termux appears to be installed from Google Play Store (DEPRECATED & BROKEN)."
            printf "       ACTION REQUIRED: Uninstall and reinstall Termux from F-Droid or GitHub Releases.\n"
        else
            log_pass "Termux installed from valid source ($INSTALLER)."
        fi
    fi
else
    log_warn "Not running directly in /data/data/com.termux (simulated Linux / proot environment)."
fi

# 3. Storage Availability
log_info "Checking storage capacity..."
FREE_SPACE_KB=$(df -k "${HOME:-.}" 2>/dev/null | awk 'NR==2 {print $4}' || echo "0")
FREE_MB=0
if [ "$FREE_SPACE_KB" -gt 2097152 ]; then
    FREE_GB=$((FREE_SPACE_KB / 1048576))
    FREE_MB=$((FREE_SPACE_KB / 1024))
    log_pass "Storage capacity is healthy: ${FREE_GB} GB available."
elif [ "$FREE_SPACE_KB" -gt 524288 ]; then
    FREE_MB=$((FREE_SPACE_KB / 1024))
    log_warn "Storage is low: less than 2 GB remaining (${FREE_MB} MB)."
else
    log_fail "Storage critically low: less than 500 MB remaining. Backups and logs may fail."
fi

# 4. Python & Pip
log_info "Checking Python & Pip runtime..."
PY_VER="Not installed"
if command -v python3 >/dev/null 2>&1; then
    PY_VER=$(python3 --version 2>&1)
    log_pass "Python available: $PY_VER"
elif command -v python >/dev/null 2>&1; then
    PY_VER=$(python --version 2>&1)
    log_pass "Python available: $PY_VER"
else
    log_fail "Python runtime not found. Run: pkg install python"
fi

if command -v pip3 >/dev/null 2>&1 || command -v pip >/dev/null 2>&1; then
    log_pass "Pip package manager available."
else
    log_warn "Pip package manager not found. Run: pkg install python"
fi

# 5. OpenSSL Tooling
log_info "Checking OpenSSL..."
SSL_VER="Not installed"
if command -v openssl >/dev/null 2>&1; then
    SSL_VER=$(openssl version 2>&1)
    log_pass "OpenSSL CLI available: $SSL_VER"
else
    log_fail "OpenSSL CLI missing. Required for LAN TLS certificate generation. Run: pkg install openssl"
fi

# 6. Termux Wake-Lock (Power Management)
log_info "Checking wake-lock & background execution support..."
if command -v termux-wake-lock >/dev/null 2>&1; then
    log_pass "termux-wake-lock utility found."
else
    log_warn "termux-wake-lock not found. Screen sleep may suspend POS server. Run: pkg install termux-api"
fi

# 7. Termux:Boot (Auto-start on Tablet Reboot)
log_info "Checking Termux:Boot configuration..."
BOOT_DIR="${HOME:-.}/.termux/boot"
if [ -d "$BOOT_DIR" ]; then
    log_pass "Termux:Boot directory exists: $BOOT_DIR"
    if [ -f "$BOOT_DIR/10-pos-start.sh" ]; then
        if [ -x "$BOOT_DIR/10-pos-start.sh" ]; then
            log_pass "Auto-start script $BOOT_DIR/10-pos-start.sh exists and is executable."
        else
            log_warn "$BOOT_DIR/10-pos-start.sh exists but is NOT executable. Run: chmod +x $BOOT_DIR/10-pos-start.sh"
        fi
    else
        log_warn "No auto-start script found at $BOOT_DIR/10-pos-start.sh. Server will not auto-start on tablet reboot."
    fi
else
    log_warn "Termux:Boot directory ($BOOT_DIR) not found. Install Termux:Boot from F-Droid to enable auto-start."
fi

# 8. PRoot-Distro (Plan B Fallback)
log_info "Checking PRoot-Distro availability..."
PROOT_AVAILABLE="no"
if command -v proot-distro >/dev/null 2>&1; then
    PROOT_AVAILABLE="yes"
    log_pass "proot-distro is installed (Plan B ready)."
else
    log_info "proot-distro is not installed. To install Plan B: pkg install proot-distro"
fi

printf "\n============================================================\n"
printf "Diagnostic Summary: PASS=%d, WARN=%d, FAIL=%d\n" "$PASS_COUNT" "$WARN_COUNT" "$FAIL_COUNT"
printf "============================================================\n"

# Formulate overall result & plan recommendation
if [ "$FAIL_COUNT" -gt 0 ]; then
    OVERALL_RESULT="FAIL"
elif [ "$WARN_COUNT" -gt 0 ]; then
    OVERALL_RESULT="WARN"
else
    OVERALL_RESULT="PASS"
fi

if [ "$ARCH" = "aarch64" ] || [ "$ARCH" = "arm64" ]; then
    REC_PLAN="Plan A (Native Termux)"
    REC_REASON="64-bit ARM CPU with pre-built TUR packages provides maximum performance and lower RAM consumption."
else
    REC_PLAN="Plan B (PRoot Ubuntu)"
    REC_REASON="Architecture or toolchain compatibility requires standard Linux glibc environment."
fi

# Write report file pos_termux_check_report.txt in current directory
REPORT_FILE="pos_termux_check_report.txt"
cat << EOF > "$REPORT_FILE"
RESULT: ${OVERALL_RESULT}
Device Architecture: ${ARCH}
Android OS: ${ANDROID_VER} (SDK ${ANDROID_SDK})
Termux Source: ${TERMUX_SOURCE}
Storage Remaining: ~${FREE_MB} MB
Python Version: ${PY_VER}
OpenSSL Version: ${SSL_VER}
proot-distro Installed: ${PROOT_AVAILABLE}
Recommended Plan: ${REC_PLAN}
Reason: ${REC_REASON}
Checks Summary: PASS=${PASS_COUNT}, WARN=${WARN_COUNT}, FAIL=${FAIL_COUNT}
EOF

printf "\nFinal Report written to %s:\n" "$REPORT_FILE"
cat "$REPORT_FILE"
printf "\n"

if [ "$OVERALL_RESULT" = "FAIL" ]; then
    exit 1
fi
exit 0
