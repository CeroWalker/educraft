set -e

REPO="${REPO:-CeroWalker/educraft}"
VERSION="${VERSION:-latest}"

OS_TYPE="$(uname -s)"
echo "========================================================="
echo "🎓 CraftForge Education Edition - Online Setup ($OS_TYPE)"
echo "========================================================="

# 1. Determine Target Directories
if [ "$OS_TYPE" = "Darwin" ]; then
    TARGET_DIR="$HOME/Library/Application Support/KodlandLauncher"
else
    TARGET_DIR="$HOME/.local/share/KodlandLauncher"
fi
INSTANCE_DIR="$TARGET_DIR/instances/kodland-course-default"
MODS_DIR="$INSTANCE_DIR/mods"

echo "[1/5] Dizin yapısı hazırlanıyor..."
mkdir -p "$TARGET_DIR" "$INSTANCE_DIR" "$MODS_DIR" "$TARGET_DIR/resources/mods"

OPTIONS_FILE="$INSTANCE_DIR/options.txt"
if [ ! -f "$OPTIONS_FILE" ]; then
    echo "guiScale:3" > "$OPTIONS_FILE"
elif ! grep -q "guiScale:" "$OPTIONS_FILE"; then
    echo "guiScale:3" >> "$OPTIONS_FILE"
fi

# 2. Check / Install Python 3
echo "[2/5] Python 3 kontrol ediliyor..."
if ! command -v python3 &> /dev/null; then
    echo "⚠️ Python 3 bulunamadı! Paket yöneticisi ile kuruluyor..."
    SUDO_CMD=""
    if [ "$EUID" -ne 0 ]; then
        if command -v sudo &> /dev/null; then SUDO_CMD="sudo"; elif command -v pkexec &> /dev/null; then SUDO_CMD="pkexec"; fi
    fi

    if [ "$OS_TYPE" = "Darwin" ]; then
        if command -v brew &> /dev/null; then brew install python3; else echo "Lütfen Homebrew veya python.org üzerinden Python 3 kurun."; fi
    elif command -v apt-get &> /dev/null; then $SUDO_CMD apt-get update -qq && $SUDO_CMD apt-get install -y python3 python3-pip
    elif command -v dnf &> /dev/null; then $SUDO_CMD dnf install -y python3
    elif command -v pacman &> /dev/null; then $SUDO_CMD pacman -S --noconfirm python
    elif command -v zypper &> /dev/null; then $SUDO_CMD zypper install -y python3
    elif command -v apk &> /dev/null; then $SUDO_CMD apk add --no-cache python3
    fi
fi

# 3. Download Release Assets & Core Patches from GitHub
echo "[3/5] GitHub üzerinden paketler indiriliyor ($REPO)..."
if [ "$VERSION" = "latest" ]; then
    BASE_URL="https://github.com/$REPO/releases/latest/download"
else
    BASE_URL="https://github.com/$REPO/releases/download/$VERSION"
fi
RAW_URL="https://raw.githubusercontent.com/$REPO/main"

curl -fsSL "$BASE_URL/app.asar" -o "$TARGET_DIR/app.asar" 2>/dev/null || curl -fsSL "$RAW_URL/app.asar" -o "$TARGET_DIR/app.asar" 2>/dev/null || true
curl -fsSL "$RAW_URL/code_builder_bridge.py" -o "$TARGET_DIR/code_builder_bridge.py" 2>/dev/null || curl -fsSL "$BASE_URL/code_builder_bridge.py" -o "$TARGET_DIR/code_builder_bridge.py" 2>/dev/null || true
curl -fsSL "$RAW_URL/run.sh" -o "$TARGET_DIR/run.sh" 2>/dev/null || curl -fsSL "$BASE_URL/run.sh" -o "$TARGET_DIR/run.sh" 2>/dev/null || true
curl -fsSL "$RAW_URL/icon.png" -o "$TARGET_DIR/icon.png" 2>/dev/null || curl -fsSL "$BASE_URL/icon.png" -o "$TARGET_DIR/icon.png" 2>/dev/null || true
curl -fsSL "$RAW_URL/resources/mods/educraft-agent-bridge-1.0.0.jar" -o "$MODS_DIR/educraft-agent-bridge-1.0.0.jar" 2>/dev/null || curl -fsSL "$BASE_URL/educraft-agent-bridge-1.0.0.jar" -o "$MODS_DIR/educraft-agent-bridge-1.0.0.jar" 2>/dev/null || true
chmod +x "$TARGET_DIR/run.sh" 2>/dev/null || true

# 4. Download Performance Mods (Sodium & Lithium) from Modrinth CDN / GitHub
echo "[4/5] Performans modları (Sodium & Lithium) internetten indiriliyor..."
SODIUM_URL="https://cdn.modrinth.com/data/AANobb73/versions/7HdQc1Bv/sodium-fabric-0.9.2%2Bmc26.2.jar"
LITHIUM_URL="https://cdn.modrinth.com/data/gvA2b1u0/versions/M6R94fQy/lithium-fabric-0.25.3%2Bmc26.2.jar"

curl -fsSL "$SODIUM_URL" -o "$MODS_DIR/sodium-fabric-0.9.2+mc26.2.jar" || curl -fsSL "$BASE_URL/sodium-fabric-0.9.2+mc26.2.jar" -o "$MODS_DIR/sodium-fabric-0.9.2+mc26.2.jar" 2>/dev/null || true
curl -fsSL "$LITHIUM_URL" -o "$MODS_DIR/lithium-fabric-0.25.3+mc26.2.jar" || curl -fsSL "$BASE_URL/lithium-fabric-0.25.3+mc26.2.jar" -o "$MODS_DIR/lithium-fabric-0.25.3+mc26.2.jar" 2>/dev/null || true

# 5. Desktop Shortcut
echo "[5/5] Masaüstü entegrasyonu yapılıyor..."
if [ "$OS_TYPE" = "Linux" ]; then
    DESKTOP_DIR="$HOME/.local/share/applications"
    mkdir -p "$DESKTOP_DIR"
    cat << EODESK > "$DESKTOP_DIR/craftforge-edu.desktop"
[Desktop Entry]
Name=CraftForge Education Edition
Comment=Minecraft Python Code Builder Education Launcher
Exec=$TARGET_DIR/run.sh %U
Icon=$TARGET_DIR/icon.png
Terminal=false
Type=Application
Categories=Education;Development;Game;
EODESK
    chmod +x "$DESKTOP_DIR/craftforge-edu.desktop"
fi

echo "========================================================="
echo "🎓 CraftForge Education Edition ($OS_TYPE) Kurulumu Tamamlandı!"
echo "========================================================="
