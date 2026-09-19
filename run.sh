#!/usr/bin/env bash
set -eo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Start Python Code Builder Bridge for Education Edition (with automatic port release)
if command -v python3 &> /dev/null && [[ -f "${SCRIPT_DIR}/code_builder_bridge.py" ]]; then
  fuser -k -9 4711/tcp 8080/tcp 2>/dev/null || true
  pkill -9 -f "code_builder_bridge.py" 2>/dev/null || true
  python3 "${SCRIPT_DIR}/code_builder_bridge.py" &
  BRIDGE_PID=$!
  trap 'kill ${BRIDGE_PID} 2>/dev/null || true' EXIT
fi

# Upstream Auto-Sync Engine (Fetches latest upstream version while preserving local version 1.0.0 and branding)
if command -v node &> /dev/null && [[ -f "${SCRIPT_DIR}/sync_upstream_patch.js" ]]; then
  node -e '
  const fs = require("fs");
  const path = require("path");
  const scriptDir = process.argv[1];
  const pkgPath = fs.existsSync(path.join(scriptDir, "src_extracted", "package.json"))
    ? path.join(scriptDir, "src_extracted", "package.json")
    : path.join(scriptDir, "package.json");
  let baseVer = "0.0.0";
  if (fs.existsSync(pkgPath)) {
    try { baseVer = JSON.parse(fs.readFileSync(pkgPath, "utf8")).upstreamVersion || "0.0.0"; } catch {}
  }
  fetch("https://portfolio.kodland.org/api/v1/launcher/version", { signal: AbortSignal.timeout(3000) })
    .then(r => r.json())
    .then(meta => {
      if (meta && meta.latest && meta.latest !== baseVer) {
        console.log(`\n⚡ Yeni resmi Kodland sürümü algılandı: (Mevcut Upstream: v${baseVer} -> Yeni: v${meta.latest})`);
        console.log(`⚡ Otomatik çekiliyor (Sürüm adı ve numarası CraftForge v1.0.0 olarak korunuyor)...\n`);
        require("child_process").execSync(`node "${path.join(scriptDir, "sync_upstream_patch.js")}"`, { stdio: "inherit" });
      }
    })
    .catch(() => {});
  ' "${SCRIPT_DIR}" 2>/dev/null || true
fi

# Locate Electron Runner Binary
ELECTRON_BIN=""
if [[ -x "${SCRIPT_DIR}/src_extracted/node_modules/.bin/electron" ]]; then
  ELECTRON_BIN="${SCRIPT_DIR}/src_extracted/node_modules/.bin/electron"
elif [[ -x "${SCRIPT_DIR}/dev/src_extracted/node_modules/.bin/electron" ]]; then
  ELECTRON_BIN="${SCRIPT_DIR}/dev/src_extracted/node_modules/.bin/electron"
elif command -v electron &> /dev/null; then
  ELECTRON_BIN="$(command -v electron)"
elif command -v kodland-launcher &> /dev/null; then
  ELECTRON_BIN="$(command -v kodland-launcher)"
elif [[ -x "/opt/Kodland Launcher/kodland-launcher" ]]; then
  ELECTRON_BIN="/opt/Kodland Launcher/kodland-launcher"
elif [[ -x "/opt/kodland-launcher/kodland-launcher" ]]; then
  ELECTRON_BIN="/opt/kodland-launcher/kodland-launcher"
fi

APP_TARGET="${SCRIPT_DIR}/app.asar"
if [[ ! -f "${APP_TARGET}" ]] && [[ -d "${SCRIPT_DIR}/src_extracted" ]]; then
  APP_TARGET="${SCRIPT_DIR}/src_extracted"
elif [[ ! -f "${APP_TARGET}" ]] && [[ -d "${SCRIPT_DIR}/dev/src_extracted" ]]; then
  APP_TARGET="${SCRIPT_DIR}/dev/src_extracted"
fi

echo "🎓 CraftForge Education Edition başlatılıyor..."
if [[ -n "${ELECTRON_BIN}" ]]; then
  exec "${ELECTRON_BIN}" "${APP_TARGET}" "$@"
elif command -v npx &> /dev/null; then
  exec npx -y electron@28.2.0 "${APP_TARGET}" "$@"
else
  echo "Hata: Electron çalışma zamanı bulunamadı." >&2
  exit 1
fi

