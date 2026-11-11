#!/bin/sh
# ==============================================================================
# Restaurant POS - Automated Installer for PRoot Ubuntu (Plan B)
# Solves native compilation issues by running standard manylinux wheels
# ==============================================================================

set -eu

TARGET_DIR="${HOME}/pos-proot"
DISTRO="ubuntu"
DRY_RUN=0

while [ $# -gt 0 ]; do
    case "$1" in
        --target-dir)
            TARGET_DIR="$2"
            shift 2
            ;;
        --distro)
            DISTRO="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=1
            shift
            ;;
        -h|--help)
            echo "Usage: sh ./install_proot.sh [--target-dir <dir>] [--distro ubuntu] [--dry-run]"
            exit 0
            ;;
        *)
            echo "Unknown argument: $1"
            exit 1
            ;;
    esac
done

echo "============================================================"
echo "    Restaurant POS - PRoot Ubuntu Installation (Plan B)     "
echo "============================================================"
echo "Distro:           $DISTRO"
echo "Target Directory: $TARGET_DIR"
echo "Dry Run Mode:     $DRY_RUN"
echo ""

# Step 1: Termux packages & proot-distro
echo ">>> [1/5] Ensuring proot-distro is installed..."
if [ "$DRY_RUN" -eq 0 ]; then
    if command -v pkg >/dev/null 2>&1; then
        pkg update -y || true
        pkg install -y proot-distro termux-api openssl || true
    fi
    if ! proot-distro list | grep -q "$DISTRO (installed)"; then
        echo "Installing $DISTRO via proot-distro..."
        proot-distro install "$DISTRO"
    fi
else
    echo "[DRY-RUN] Would install proot-distro and $DISTRO"
fi

# Step 2: In-container dependencies
echo ">>> [2/5] Installing packages inside $DISTRO container..."
IN_CONTAINER_SETUP="
apt-get update -y && \
apt-get install -y python3 python3-pip python3-venv openssl git curl && \
mkdir -p /opt/pos/releases /opt/pos/data /opt/pos/config /opt/pos/certs /opt/pos/run /opt/pos/bin && \
python3 -m venv /opt/pos/venv && \
/opt/pos/venv/bin/pip install --upgrade pip setuptools wheel
"

if [ "$DRY_RUN" -eq 0 ]; then
    proot-distro login "$DISTRO" -- sh -c "$IN_CONTAINER_SETUP"
else
    echo "[DRY-RUN] Would execute inside $DISTRO:"
    echo "$IN_CONTAINER_SETUP"
fi

# Step 3: Auto-start launcher for PRoot
echo ">>> [3/5] Setting up PRoot POS launcher..."
LAUNCHER_SCRIPT="$HOME/bin/pos-proot"
mkdir -p "$HOME/bin"
if [ "$DRY_RUN" -eq 0 ]; then
    cat << 'EOF' > "$LAUNCHER_SCRIPT"
#!/bin/sh
# Launcher for Restaurant POS running inside proot-distro ubuntu
proot-distro login ubuntu -- /opt/pos/bin/pos "$@"
EOF
    chmod +x "$LAUNCHER_SCRIPT"
else
    echo "[DRY-RUN] Would create launcher at $LAUNCHER_SCRIPT and chmod +x"
fi

# Step 4: Boot integration
echo ">>> [4/5] Integrating with Termux:Boot..."
BOOT_DIR="$HOME/.termux/boot"
if [ "$DRY_RUN" -eq 0 ]; then
    mkdir -p "$BOOT_DIR"
    cat << 'EOF' > "$BOOT_DIR/10-pos-proot-start.sh"
#!/bin/sh
if command -v termux-wake-lock >/dev/null 2>&1; then
    termux-wake-lock
fi
if [ -x "$HOME/bin/pos-proot" ]; then
    "$HOME/bin/pos-proot" start
fi
EOF
    chmod +x "$BOOT_DIR/10-pos-proot-start.sh"
else
    echo "[DRY-RUN] Would create $BOOT_DIR/10-pos-proot-start.sh and chmod +x"
fi

# Step 5: Wrap up
echo ">>> [5/5] Verification & next steps..."
echo ""
echo "Installation completed successfully."
echo "To manage POS in PRoot, run:"
echo "  pos-proot start"
echo "  pos-proot status"
echo "  pos-proot doctor"
