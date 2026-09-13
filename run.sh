#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ELECTRON_BIN="${SCRIPT_DIR}/src_extracted/node_modules/.bin/electron"

# Start Python Code Builder Bridge for Education Edition (with automatic port release)
if command -v python3 &> /dev/null && [[ -f "${SCRIPT_DIR}/code_builder_bridge.py" ]]; then
  fuser -k -9 4711/tcp 8080/tcp 2>/dev/null || true
  pkill -9 -f "code_builder_bridge.py" 2>/dev/null || true
  python3 "${SCRIPT_DIR}/code_builder_bridge.py" &
  BRIDGE_PID=$!
  trap 'kill ${BRIDGE_PID} 2>/dev/null || true' EXIT
fi

# Upstream Auto-Sync and Patch Engine
if [[ -f "${SCRIPT_DIR}/sync_upstream_patch.js" ]] && command -v node &> /dev/null; then
  node -e '
  const fs = require("fs");
  const path = require("path");
  const scriptDir = process.argv[1];
  const pkgPath = path.join(scriptDir, "src_extracted", "package.json");
  if (!fs.existsSync(pkgPath)) process.exit(0);
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const baseVer = pkg.upstreamVersion || "0.8.6";
  fetch("https://portfolio.kodland.org/api/v1/launcher/version", { signal: AbortSignal.timeout(2500) })
    .then(r => r.json())
    .then(meta => {
      if (meta && meta.latest && meta.latest !== baseVer && meta.latest > baseVer) {
        console.log(`\n⚡ Yeni resmi Kodland sürümü algılandı: (Mevcut Upstream: v${baseVer} -> Yeni: v${meta.latest})`);
        console.log(`⚡ Otomatik çekiliyor ve tüm CraftForge Education yamaları enjekte ediliyor...\n`);
        require("child_process").execSync(`node "${path.join(scriptDir, "sync_upstream_patch.js")}"`, { stdio: "inherit" });
      }
    })
    .catch(() => {});
  ' "${SCRIPT_DIR}" 2>/dev/null || true
fi

if [[ ! -x "${ELECTRON_BIN}" ]]; then
  if command -v electron &> /dev/null; then
    ELECTRON_BIN="$(command -v electron)"
  else
    echo "Hata: Electron çalışma zamanı bulunamadı. 'cd src_extracted && npm install' çalıştırın." >&2
    exit 1
  fi
fi

APP_TARGET="${SCRIPT_DIR}/src_extracted"
if [[ ! -d "${APP_TARGET}" ]] && [[ -f "${SCRIPT_DIR}/app.asar" ]]; then
  APP_TARGET="${SCRIPT_DIR}/app.asar"
fi

echo "🎓 CraftForge Education Edition başlatılıyor..."
exec "${ELECTRON_BIN}" "${APP_TARGET}" "$@"

