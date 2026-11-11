#!/bin/sh
# ==============================================================================
# Restaurant POS - Automated Installer for Native Termux (Plan A)
# ==============================================================================

set -eu

TARGET_DIR="${HOME}/pos"
DRY_RUN=0
NO_SYSTEM_PACKAGES=0

while [ $# -gt 0 ]; do
    case "$1" in
        --target-dir)
            TARGET_DIR="$2"
            shift 2
            ;;
        --dry-run)
            DRY_RUN=1
            shift
            ;;
        --no-system-packages)
            NO_SYSTEM_PACKAGES=1
            shift
            ;;
        -h|--help)
            echo "Usage: sh ./install_termux.sh [--target-dir <dir>] [--dry-run] [--no-system-packages]"
            exit 0
            ;;
        *)
            echo "Unknown argument: $1"
            exit 1
            ;;
    esac
done

echo "============================================================"
echo "    Restaurant POS - Termux Native Installation (Plan A)    "
echo "============================================================"
echo "Target Directory: $TARGET_DIR"
echo "Dry Run Mode:     $DRY_RUN"
echo ""

if [ "$DRY_RUN" -eq 1 ]; then
    echo "[DRY-RUN] Simulating Termux installation steps without making system changes."
fi

# Step 1: Package updates & dependencies
echo ">>> [1/6] Installing Android & Termux package dependencies..."
if [ "$DRY_RUN" -eq 0 ]; then
    if [ "$NO_SYSTEM_PACKAGES" -eq 0 ] && command -v pkg >/dev/null 2>&1; then
        pkg update -y || true
        pkg install -y python git openssl clang libffi rust termux-api proot-distro || true
        # Attempt TUR repo for prebuilt pydantic-core wheel
        pkg install -y tur-repo || true
        pkg install -y python-pydantic-core || true
    fi
else
    echo "[DRY-RUN] Would run: pkg install python git openssl clang libffi rust termux-api"
fi

# Step 2: Directory Layout
echo ">>> [2/6] Creating directory layout under $TARGET_DIR..."
for d in \
    "$TARGET_DIR/releases" \
    "$TARGET_DIR/data" \
    "$TARGET_DIR/data/backups" \
    "$TARGET_DIR/data/logs" \
    "$TARGET_DIR/data/uploads" \
    "$TARGET_DIR/config" \
    "$TARGET_DIR/certs" \
    "$TARGET_DIR/run" \
    "$TARGET_DIR/bin"; do
    if [ "$DRY_RUN" -eq 0 ]; then
        mkdir -p "$d"
        chmod 700 "$d"
    else
        echo "[DRY-RUN] mkdir -p $d (chmod 700)"
    fi
done

# Step 3: Python Virtual Environment & Dependencies
echo ">>> [3/6] Setting up Python virtual environment..."
VENV_DIR="$TARGET_DIR/venv"
if [ "$DRY_RUN" -eq 0 ]; then
    if [ ! -d "$VENV_DIR" ]; then
        python3 -m venv "$VENV_DIR"
    fi
    "$VENV_DIR/bin/pip" install --upgrade pip setuptools wheel
    
    # Try installing wheels
    "$VENV_DIR/bin/pip" install --extra-index-url https://eutalix.github.io/android-pydantic-core/ pydantic-core==2.41.5 || true
    if [ -f "backend/requirements.lock" ]; then
        "$VENV_DIR/bin/pip" install -r backend/requirements.lock || "$VENV_DIR/bin/pip" install -r backend/requirements-termux.txt
    fi
else
    echo "[DRY-RUN] Would create venv at $VENV_DIR and install backend/requirements.lock"
fi

# Step 4: Configuration & Secrets
echo ">>> [4/6] Initializing configuration and secrets..."
if [ "$DRY_RUN" -eq 0 ]; then
    if [ ! -f "$TARGET_DIR/config/.env" ]; then
        if [ -f "backend/.env.example" ]; then
            cp "backend/.env.example" "$TARGET_DIR/config/.env"
        elif [ -f ".env.example" ]; then
            cp ".env.example" "$TARGET_DIR/config/.env"
        fi
        
        # Generate secure secret key
        SECRET_KEY=$(python3 -c "import secrets; print(secrets.token_hex(32))" 2>/dev/null || openssl rand -hex 32)
        # Portably update .env without sed -i incompatibility
        awk -v s="$SECRET_KEY" '{gsub("CHANGE_THIS_TO_A_SECURE_RANDOM_SECRET_KEY", s); print}' "$TARGET_DIR/config/.env" > "$TARGET_DIR/config/.env.tmp" && mv "$TARGET_DIR/config/.env.tmp" "$TARGET_DIR/config/.env"
        chmod 600 "$TARGET_DIR/config/.env"
    fi

    if [ ! -f "$TARGET_DIR/config/users.yaml" ]; then
        if [ -f "backend/config/users.example.yaml" ]; then
            cp "backend/config/users.example.yaml" "$TARGET_DIR/config/users.yaml"
        elif [ -f "config/users.example.yaml" ]; then
            cp "config/users.example.yaml" "$TARGET_DIR/config/users.yaml"
        fi
        chmod 600 "$TARGET_DIR/config/users.yaml" 2>/dev/null || true
    fi
else
    echo "[DRY-RUN] Would seed config/.env with generated secret key and config/users.yaml"
fi

# Step 5: TLS Certificates
echo ">>> [5/6] Generating Root CA and LAN server certificates..."
if [ "$DRY_RUN" -eq 0 ]; then
    if [ ! -f "$TARGET_DIR/certs/server.crt" ]; then
        python3 scripts/certs.py init --certs-dir "$TARGET_DIR/certs" || true
    fi
else
    echo "[DRY-RUN] Would execute: python3 scripts/certs.py init --certs-dir $TARGET_DIR/certs"
fi

# Step 6: Termux:Boot Auto-Start Hook & Permissions
echo ">>> [6/6] Configuring auto-start on boot and permissions..."
BOOT_DIR="$HOME/.termux/boot"
if [ "$DRY_RUN" -eq 0 ]; then
    mkdir -p "$BOOT_DIR"
    cat << 'EOF' > "$BOOT_DIR/10-pos-start.sh"
#!/bin/sh
# Auto-start Restaurant POS on device boot
if command -v termux-wake-lock >/dev/null 2>&1; then
    termux-wake-lock
fi
export HOME="${HOME:-/data/data/com.termux/files/home}"
if [ -f "$HOME/pos/bin/pos" ]; then
    sh "$HOME/pos/bin/pos" start
elif [ -f "$HOME/pos/scripts/run_server.sh" ]; then
    sh "$HOME/pos/scripts/run_server.sh" start
fi
EOF
    chmod +x "$BOOT_DIR/10-pos-start.sh"

    # Make CLI scripts executable
    if [ -d "$TARGET_DIR/scripts" ]; then
        chmod +x "$TARGET_DIR/scripts/"*.sh "$TARGET_DIR/scripts/pos" 2>/dev/null || true
    fi
    if [ -f "$TARGET_DIR/bin/pos" ]; then
        chmod +x "$TARGET_DIR/bin/pos" 2>/dev/null || true
    fi
else
    echo "[DRY-RUN] Would write $BOOT_DIR/10-pos-start.sh and apply chmod +x"
fi

echo ""
echo "============================================================"
echo "    Installation Complete!                                 "
echo "============================================================"
echo "Next steps:"
echo "  1. Verify diagnostic:  sh scripts/termux_check.sh"
echo "  2. Start server:       sh scripts/pos start"
echo "  3. Check health:       sh scripts/pos doctor"
