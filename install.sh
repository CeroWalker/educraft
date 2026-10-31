#!/usr/bin/env bash
# CraftForge Education Edition - Linux / macOS Online Installer
# Kullanım (Tek Satır):
# curl -fsSL https://raw.githubusercontent.com/CeroWalker/educraft/master/install.sh | bash

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

# 2. Check / Install Python 3 & Node.js
echo "[2/5] Bağımlılıklar (Python 3 & Node.js) kontrol ediliyor..."
SUDO_CMD=""
if [ "$EUID" -ne 0 ]; then
    if command -v sudo &> /dev/null; then SUDO_CMD="sudo"; elif command -v pkexec &> /dev/null; then SUDO_CMD="pkexec"; fi
fi

if ! command -v python3 &> /dev/null; then
    echo "⚠️ Python 3 bulunamadı! Paket yöneticisi ile kuruluyor..."
    if [ "$OS_TYPE" = "Darwin" ]; then
        if command -v brew &> /dev/null; then brew install python3; else echo "Lütfen Homebrew veya python.org üzerinden Python 3 kurun."; fi
    elif command -v apt-get &> /dev/null; then $SUDO_CMD apt-get update -qq && $SUDO_CMD apt-get install -y python3 python3-pip
    elif command -v dnf &> /dev/null; then $SUDO_CMD dnf install -y python3
    elif command -v pacman &> /dev/null; then $SUDO_CMD pacman -S --noconfirm python
    elif command -v zypper &> /dev/null; then $SUDO_CMD zypper install -y python3
    elif command -v apk &> /dev/null; then $SUDO_CMD apk add --no-cache python3
    fi
fi

# Check Node.js / npx (Electron Runtime)
if ! command -v npx &> /dev/null && ! command -v electron &> /dev/null; then
    echo "⚠️ Node.js / npx bulunamadı! Kurulum deneniyor..."
    if [ "$OS_TYPE" = "Darwin" ]; then
        if command -v brew &> /dev/null; then
            echo "🍺 Homebrew üzerinden Node.js kuruluyor..."
            brew install node
        else
            echo "⚠️ macOS üzerinde Node.js (veya Homebrew) bulunamadı."
            echo "💡 Kurulum bittikten sonra https://nodejs.org adresinden Node.js kurmanız gerekebilir."
        fi
    elif command -v apt-get &> /dev/null; then $SUDO_CMD apt-get update -qq && $SUDO_CMD apt-get install -y nodejs npm
    elif command -v dnf &> /dev/null; then $SUDO_CMD dnf install -y nodejs npm
    elif command -v pacman &> /dev/null; then $SUDO_CMD pacman -S --noconfirm nodejs npm
    elif command -v zypper &> /dev/null; then $SUDO_CMD zypper install -y nodejs npm
    elif command -v apk &> /dev/null; then $SUDO_CMD apk add --no-cache nodejs npm
    fi
fi

# 3. Download Release Assets & Core Patches from GitHub
echo "[3/5] GitHub üzerinden paketler indiriliyor ($REPO)..."
if [ "$VERSION" = "latest" ]; then
    BASE_URL="https://github.com/$REPO/releases/latest/download"
else
    BASE_URL="https://github.com/$REPO/releases/download/$VERSION"
fi
RAW_URL="https://raw.githubusercontent.com/$REPO/master"
CB="?cb=$(date +%s)"

curl -fSL "$BASE_URL/app.asar" -o "$TARGET_DIR/app.asar" 2>/dev/null || curl -fsSL "$RAW_URL/app.asar$CB" -o "$TARGET_DIR/app.asar" 2>/dev/null || true
curl -fsSL "$RAW_URL/code_builder_bridge.py$CB" -o "$TARGET_DIR/code_builder_bridge.py" 2>/dev/null || curl -fsSL "$BASE_URL/code_builder_bridge.py" -o "$TARGET_DIR/code_builder_bridge.py" 2>/dev/null || true
curl -fsSL "$RAW_URL/run.sh$CB" -o "$TARGET_DIR/run.sh" 2>/dev/null || curl -fsSL "$BASE_URL/run.sh" -o "$TARGET_DIR/run.sh" 2>/dev/null || true
curl -fsSL "$RAW_URL/icon.png$CB" -o "$TARGET_DIR/icon.png" 2>/dev/null || curl -fsSL "$BASE_URL/icon.png" -o "$TARGET_DIR/icon.png" 2>/dev/null || true
curl -fsSL "$RAW_URL/resources/mods/educraft-agent-bridge-1.0.0.jar$CB" -o "$MODS_DIR/educraft-agent-bridge-1.0.0.jar" 2>/dev/null || curl -fsSL "$BASE_URL/educraft-agent-bridge-1.0.0.jar" -o "$MODS_DIR/educraft-agent-bridge-1.0.0.jar" 2>/dev/null || true
curl -fsSL "$RAW_URL/resources/e4mc-5.1.0-fabric.jar$CB" -o "$MODS_DIR/e4mc-5.1.0-fabric.jar" 2>/dev/null || true
curl -fsSL "$RAW_URL/resources/e4mc-5.1.0-fabric.jar$CB" -o "$TARGET_DIR/resources/e4mc-5.1.0-fabric.jar" 2>/dev/null || true
chmod +x "$TARGET_DIR/run.sh" 2>/dev/null || true

# If official macOS Kodland Launcher exists, patch its internal app.asar directly
if [ "$OS_TYPE" = "Darwin" ]; then
    for MAC_APP in "/Applications/Kodland Launcher.app" "$HOME/Applications/Kodland Launcher.app" "/Applications/Kodland.app"; do
        if [ -d "$MAC_APP/Contents/Resources" ] && [ -f "$TARGET_DIR/app.asar" ]; then
            echo "⚡ Resmi macOS Kodland paketi yamalanıyor ($MAC_APP)..."
            cp -f "$TARGET_DIR/app.asar" "$MAC_APP/Contents/Resources/app.asar" 2>/dev/null || true
        fi
    done
fi

# 4. Download Performance Mods (Sodium & Lithium) from Modrinth CDN
echo "[4/5] Performans modları (Sodium & Lithium) internetten indiriliyor..."
SODIUM_URL="https://cdn.modrinth.com/data/AANobbMI/versions/xJZxADzI/sodium-fabric-0.9.2%2Bmc26.2.jar"
LITHIUM_URL="https://cdn.modrinth.com/data/gvQqBUqZ/versions/f7vZ0VWU/lithium-fabric-0.25.3%2Bmc26.2.jar"

curl -fsSL -A "Mozilla/5.0" "$SODIUM_URL" -o "$MODS_DIR/sodium-fabric-0.9.2+mc26.2.jar" 2>/dev/null || true
curl -fsSL -A "Mozilla/5.0" "$LITHIUM_URL" -o "$MODS_DIR/lithium-fabric-0.25.3+mc26.2.jar" 2>/dev/null || true

# 5. Desktop & Application Menu Integration
echo "[5/5] Masaüstü ve uygulama menüsü entegrasyonu yapılıyor..."
if [ "$OS_TYPE" = "Linux" ]; then
    ICON_DIR="$HOME/.local/share/icons/hicolor/256x256/apps"
    mkdir -p "$ICON_DIR"
    cp -f "$TARGET_DIR/icon.png" "$ICON_DIR/craftforge-edu.png" 2>/dev/null || true

    APP_DIR="$HOME/.local/share/applications"
    mkdir -p "$APP_DIR"
    cat << EODESK > "$APP_DIR/craftforge-edu.desktop"
[Desktop Entry]
Name=CraftForge Education Edition
Comment=Minecraft Python Code Builder Education Launcher
Exec=$TARGET_DIR/run.sh %U
Icon=$TARGET_DIR/icon.png
Terminal=false
Type=Application
Categories=Education;Development;Game;
StartupWMClass=kodland-launcher
EODESK
    chmod +x "$APP_DIR/craftforge-edu.desktop" 2>/dev/null || true
    update-desktop-database "$APP_DIR" 2>/dev/null || true
    gtk-update-icon-cache -f -t "$HOME/.local/share/icons/hicolor" 2>/dev/null || true

    USER_DESKTOP="$HOME/Desktop"
    if [ -d "$HOME/Masaüstü" ]; then USER_DESKTOP="$HOME/Masaüstü"; fi
    if command -v xdg-user-dir &>/dev/null; then
        DETECTED_DESKTOP="$(xdg-user-dir DESKTOP 2>/dev/null || true)"
        if [ -n "$DETECTED_DESKTOP" ] && [ -d "$DETECTED_DESKTOP" ]; then
            USER_DESKTOP="$DETECTED_DESKTOP"
        fi
    fi

    if [ -d "$USER_DESKTOP" ]; then
        cp -f "$APP_DIR/craftforge-edu.desktop" "$USER_DESKTOP/craftforge-edu.desktop"
        chmod +x "$USER_DESKTOP/craftforge-edu.desktop" 2>/dev/null || true
        if command -v gio &>/dev/null; then
            gio trust "$USER_DESKTOP/craftforge-edu.desktop" 2>/dev/null || true
        fi
    fi

elif [ "$OS_TYPE" = "Darwin" ]; then
    MAC_APPS="$HOME/Applications"
    mkdir -p "$MAC_APPS"
    APP_BUNDLE="$MAC_APPS/CraftForge Education.app"

    # osacompile ile macOS native Applet paketi üret
    if command -v osacompile &>/dev/null; then
        osacompile -o "$APP_BUNDLE" -e "do shell script \"\\\"$TARGET_DIR/run.sh\\\" > /dev/null 2>&1 &\"" 2>/dev/null || true
        if [ -f "$TARGET_DIR/icon.png" ] && command -v sips &>/dev/null; then
            sips -s format icns "$TARGET_DIR/icon.png" --out "$APP_BUNDLE/Contents/Resources/applet.icns" 2>/dev/null || true
        fi
    fi

    USER_DESKTOP="$HOME/Desktop"
    if [ -d "$HOME/Masaüstü" ]; then USER_DESKTOP="$HOME/Masaüstü"; fi

    if [ -d "$USER_DESKTOP" ]; then
        cat << EOCMD > "$USER_DESKTOP/CraftForge Education.command"
#!/bin/bash
exec "$TARGET_DIR/run.sh"
EOCMD
        chmod +x "$USER_DESKTOP/CraftForge Education.command"

        if [ -d "$APP_BUNDLE" ]; then
            rm -rf "$USER_DESKTOP/CraftForge Education.app"
            cp -R "$APP_BUNDLE" "$USER_DESKTOP/CraftForge Education.app" 2>/dev/null || true
        fi
    fi
fi

echo "========================================================="
echo "🎓 CraftForge Education Edition ($OS_TYPE) Kurulumu Tamamlandı!"
echo "========================================================="
