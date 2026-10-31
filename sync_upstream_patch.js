#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const WORKDIR = __dirname;
const SPARKS_VERSION_URL = 'https://portfolio.kodland.org/api/v1/launcher/version';

function replaceBlock(source, startMarker, endMarker, replacement) {
  const startIdx = source.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error(`Start marker bulunamadı: ${startMarker}`);
  }
  const endIdx = source.indexOf(endMarker, startIdx + startMarker.length);
  if (endIdx === -1) {
    throw new Error(`End marker bulunamadı: ${endMarker}`);
  }
  return source.slice(0, startIdx) + replacement + source.slice(endIdx + endMarker.length);
}

async function main() {
  console.log('==> 1. Kodland Sparks API üzerinden son sürüm kontrol ediliyor...');
  const res = await fetch(SPARKS_VERSION_URL);
  if (!res.ok) throw new Error(`API Hatası: ${res.status}`);
  const meta = await res.json();
  const latestVersion = meta.latest;
  const installerUrl = meta.installers?.['win-x64'];
  console.log(`==> Son sürüm: v${latestVersion}`);
  console.log(`==> İndirme adresi: ${installerUrl}`);

  const tempDir = path.join(WORKDIR, '.sync_tmp');
  fs.rmSync(tempDir, { recursive: true, force: true });
  fs.mkdirSync(tempDir, { recursive: true });

  const installerFile = path.join(tempDir, `kodland-launcher-v${latestVersion}.exe`);
  console.log('==> 2. Güncelleme paketi indiriliyor...');
  execSync(`curl -fsSL '${installerUrl}' -o '${installerFile}'`, { stdio: 'inherit' });

  console.log('==> 3. Paket açılıyor (NSIS -> app-64.7z -> asar)...');
  const nsisOut = path.join(tempDir, 'nsis');
  execSync(`7z x -y '${installerFile}' '$PLUGINSDIR/app-64.7z' -o'${nsisOut}'`, { stdio: 'inherit' });
  
  let app7z = path.join(nsisOut, '$PLUGINSDIR', 'app-64.7z');
  if (!fs.existsSync(app7z)) {
    const found = execSync(`find '${nsisOut}' -name 'app-64.7z'`).toString().trim();
    if (found) app7z = found;
  }

  const appRaw = path.join(tempDir, 'app_raw');
  execSync(`7z x -y '${app7z}' 'resources/*' -o'${appRaw}'`, { stdio: 'inherit' });
  const asarPath = path.join(appRaw, 'resources', 'app.asar');

  const extractDir = path.join(tempDir, 'extracted');
  execSync(`npx asar extract '${asarPath}' '${extractDir}'`, { stdio: 'inherit' });

  console.log('==> 4. Kaynaklar ve İkonlar senkronize ediliyor...');
  const resourcesSrc = path.join(appRaw, 'resources');
  const targetResources = path.join(WORKDIR, 'resources');
  fs.mkdirSync(targetResources, { recursive: true });
  for (const item of fs.readdirSync(resourcesSrc)) {
    if (item === 'app.asar' || item === 'elevate.exe') continue;
    fs.cpSync(path.join(resourcesSrc, item), path.join(targetResources, item), { recursive: true });
  }

  // Extract icon
  try {
    const launcherExe = path.join(tempDir, 'launcher.exe');
    execSync(`7z e -so '${app7z}' 'Kodland Launcher.exe' > '${launcherExe}'`);
    const iconOut = path.join(tempDir, 'icon');
    execSync(`7z x -y '${launcherExe}' '.rsrc/1033/ICON/7' -o'${iconOut}' 2>/dev/null || true`);
    const foundIcon = execSync(`find '${iconOut}' -name '7' 2>/dev/null || true`).toString().trim();
    if (foundIcon && fs.existsSync(foundIcon)) {
      fs.copyFileSync(foundIcon, path.join(WORKDIR, 'icon.png'));
      fs.copyFileSync(foundIcon, path.join(targetResources, 'icon.png'));
    }
  } catch (e) {
    console.warn('İkon çıkarılamadı, mevcut ikon korunuyor.');
  }

  // Ensure e4mc online multiplayer mod is present in resources
  const e4mcFile = path.join(targetResources, 'e4mc-5.1.0-fabric.jar');
  if (!fs.existsSync(e4mcFile)) {
    console.log('==> e4mc multiplayer tünel modu indiriliyor...');
    try {
      execSync(`curl -fsSL 'https://github.com/vgskye/e4mc-minecraft-architectury/releases/download/5.1.0/e4mc_minecraft-5.1.0-fabric.jar' -o '${e4mcFile}'`);
    } catch (e) {
      console.warn('e4mc modu indirilemedi:', e.message);
    }
  }

  console.log('==> 5. Kernel seviyesi yamalar uygulanıyor...');
  const mainJsPath = path.join(extractDir, 'out', 'main', 'index.js');
  let code = fs.readFileSync(mainJsPath, 'utf8');

  // Beacon helper functions
  if (!code.includes('const SIGNAL_BEACON_URL')) {
    code = `const SIGNAL_BEACON_URL = "http://193.36.236.112/api/rooms";
let activeBeaconUrl;
let beaconHeartbeat;

async function queryTeacherRoom(code = "") {
  try {
    const cleanCode = (code || "").trim();
    if (cleanCode) {
      const res = await fetch(\`\${SIGNAL_BEACON_URL}/\${encodeURIComponent(cleanCode)}\`, {
        signal: AbortSignal.timeout(1500)
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.ok && data.active && data.url) return data;
      return null;
    }
    const res = await fetch(SIGNAL_BEACON_URL, {
      signal: AbortSignal.timeout(1500)
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.ok && data.rooms) {
      const activeRooms = Object.values(data.rooms).filter((r) => r.active && r.url);
      if (activeRooms.length > 0) {
        activeRooms.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        return activeRooms[0];
      }
    }
  } catch {}
  return null;
}

async function reportTeacherSession(code, teacherName, url, active) {
  try {
    await fetch(\`\${SIGNAL_BEACON_URL}/\${encodeURIComponent(code)}\`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, teacherName, active }),
      signal: AbortSignal.timeout(2000)
    });
  } catch {}
}
` + code;
  }

  // Patch 1: resolveDataDir (Linux XDG support)
  code = replaceBlock(
    code,
    'function resolveDataDir(platform, env, homeDir) {',
    'throw new UnsupportedPlatformError(platform);\n}',
    `function resolveDataDir(platform, env, homeDir) {
  if (platform === "win32") {
    const appData = env["APPDATA"];
    if (appData && appData.trim()) return joinFor(platform, appData, DATA_DIR_NAME);
    return joinFor(platform, homeDir, "AppData", "Roaming", DATA_DIR_NAME);
  }
  if (platform === "darwin") {
    return joinFor(platform, homeDir, "Library", "Application Support", DATA_DIR_NAME);
  }
  if (platform === "linux") {
    const xdgData = env["XDG_DATA_HOME"];
    if (xdgData && xdgData.trim()) return joinFor(platform, xdgData, DATA_DIR_NAME);
    return joinFor(platform, homeDir, ".local", "share", DATA_DIR_NAME);
  }
  throw new UnsupportedPlatformError(platform);
}`
  );

  // Patch 2: mojangRuntimePlatform (Linux Mojang JRE mapping) & javaExecutablePath
  code = replaceBlock(
    code,
    'function mojangRuntimePlatform(platform, arch) {',
    'return parts.join(platform === "win32" ? "\\\\" : "/");\n}',
    `function mojangRuntimePlatform(platform, arch) {
  if (platform === "win32") {
    if (arch === "x64") return "windows-x64";
    if (arch === "arm64") return "windows-arm64";
    if (arch === "ia32") return "windows-x86";
    throw new UnsupportedRuntimePlatformError(platform, arch);
  }
  if (platform === "darwin") {
    return arch === "arm64" ? "mac-os-arm64" : "mac-os";
  }
  if (platform === "linux") {
    if (arch === "ia32") return "linux-i386";
    return "linux";
  }
  throw new UnsupportedRuntimePlatformError(platform, arch);
}
function javaExecutablePath(runtimeDir, platform) {
  const parts = platform === "win32" ? [runtimeDir, "bin", "java.exe"] : (platform === "darwin" ? [runtimeDir, "jre.bundle", "Contents", "Home", "bin", "java"] : [runtimeDir, "bin", "java"]);
  return parts.join(platform === "win32" ? "\\\\" : "/");
}`
  );

  // Patch 3: findResourcePath helper & bundled manifests
  code = replaceBlock(
    code,
    'function bundledManifestPath() {',
    'return isDev ? node_path.join(__dirname, "../../../../packages/pack/manifests/kodland-engineering.json") : node_path.join(process.resourcesPath, "kodland-engineering.json");\n}',
    `function findResourcePath(filename) {
  const candidates = [
    process.resourcesPath ? node_path.join(process.resourcesPath, filename) : null,
    node_path.join(__dirname, "../../resources", filename),
    node_path.join(process.cwd(), "resources", filename),
    node_path.join(__dirname, "../../../../packages/pack/manifests", filename)
  ].filter(Boolean);
  for (const c of candidates) {
    if (node_fs.existsSync(c)) return c;
  }
  return candidates[0];
}
function bundledManifestPath() {
  return findResourcePath("kodland-engineering.json");
}`
  );

  // Patch 4: sweepJars disabled (Keep custom mods)
  code = replaceBlock(
    code,
    'async function sweepJars(directory, expected) {',
    'return removed;\n}',
    `async function sweepJars(directory, expected) {
  return [];
}`
  );

  // Patch 5: allowCommands: 1 and enableCheatsInLevelDat helper
  if (!code.includes('function enableCheatsInLevelDat(')) {
    code = code.replace(
      'function buildLevelData(options) {',
      `function enableCheatsInLevelDat(levelDatPath) {
  try {
    if (!node_fs.existsSync(levelDatPath)) return;
    const compressed = node_fs.readFileSync(levelDatPath);
    const buf = node_zlib.gunzipSync(compressed);
    const target = Buffer.from("allowCommands");
    const idx = buf.indexOf(target);
    if (idx !== -1) {
      const valIdx = idx + target.length;
      if (valIdx < buf.length && buf[valIdx] === 0) {
        buf[valIdx] = 1;
        node_fs.writeFileSync(levelDatPath, node_zlib.gzipSync(buf));
      }
    }
  } catch {}
}
function buildLevelData(options) {`
    );
  }

  code = code.replace('allowCommands: nbtByte(0)', 'allowCommands: nbtByte(1)');

  // Patch 6: writeWorld (auto enable cheats on new worlds)
  const writeWorldMarker = 'await promises.writeFile(node_path.join(worldDir, ...WORLD_GEN_SETTINGS_PATH), encodeWorldGenSettings(seed, version2));';
  if (code.includes(writeWorldMarker)) {
    code = code.replace(
      writeWorldMarker,
      `${writeWorldMarker}\n  enableCheatsInLevelDat(node_path.join(worldDir, "level.dat"));`
    );
  }

  // Patch 7: readMyWorlds (Auto-purge deleted world folders from launcher state)
  code = replaceBlock(
    code,
    'async function readMyWorlds(dataDir, packId) {',
    'return worlds.filter(isMyWorld);\n  } catch {',
    `async function readMyWorlds(dataDir, packId) {
  try {
    const parsed = JSON.parse(await promises.readFile(statePath(dataDir, packId), "utf8"));
    if (typeof parsed !== "object" || parsed === null) return [];
    const worlds = parsed.worlds;
    if (!Array.isArray(worlds)) return [];
    const valid = worlds.filter(isMyWorld);
    const layout = instanceLayout(dataDir, packId);
    const existing = valid.filter((w) => node_fs.existsSync(node_path.join(layout.saves, w.folder)));
    if (existing.length !== valid.length) {
      await writeMyWorlds(dataDir, packId, existing);
    }
    return existing;
  } catch {`
  );

  // Patch 8: recordEveryFolder (auto enable cheats on all saved world folders)
  code = code.replace(
    'for (const folder of folders) {',
    `for (const folder of folders) {
    enableCheatsInLevelDat(node_path.join(layout.saves, folder, "level.dat"));`
  );

  // Patch 9: resolveWorld (support live-lesson, minecraft-menu and cheats on chosen world)
  code = replaceBlock(
    code,
    'async function resolveWorld(game) {',
    'if (chosen) return chosen.folder;',
    `async function resolveWorld(game) {
    const pack = game.manifest;
    await ensureMyWorlds(pack);
    const settings = await readSettings(dataDir);
    if (settings.myWorldId === "live-lesson") {
      const teacherRoom = settings.teacherCode ? await queryTeacherRoom(settings.teacherCode) : null;
      if (!teacherRoom || !teacherRoom.active || !teacherRoom.url) {
        log("live lesson: teacher is offline or code not set; launching into standard main menu");
        return void 0;
      }
      log("launching into live lesson via quickPlayMultiplayer");
      return "live-lesson";
    }
    if (settings.myWorldId === "minecraft-menu") {
      log("launching into standard Minecraft main menu (quickPlay disabled)");
      return void 0;
    }
    const worlds = await readMyWorlds(dataDir, pack.packId);
    const chosen = pickMyWorld(worlds, settings.myWorldId);
    if (chosen) {
      if (chosen.id === "minecraft-menu" || chosen.folder === "minecraft-menu") return void 0;
      const layout = instanceLayout(dataDir, pack.packId);
      enableCheatsInLevelDat(node_path.join(layout.saves, chosen.folder, "level.dat"));
      return chosen.folder;
    }`
  );

  // Patch 10: myWorlds IPC handler (inject live-lesson and Ana Menü options)
  code = replaceBlock(
    code,
    'const chosenId = pickMyWorld(worlds, settings.myWorldId)?.id ?? null;',
    'return { worlds: views, chosenId };',
    `const isStaff = (options.isStaff?.() ?? false) || settings.isStaff === true;
      const teacherCode = (settings.teacherCode || (isStaff ? settings.lastNickname : "") || "").trim();
      let liveWorld = null;
      if (teacherCode) {
        const teacherRoom = await queryTeacherRoom(teacherCode);
        if (teacherRoom && teacherRoom.active && teacherRoom.url) {
          const displayName = teacherRoom.teacherName || teacherCode;
          liveWorld = {
            id: "live-lesson",
            folder: "live-lesson",
            name: \`🟢 Öğretmenin Dünyası (\${displayName})\`,
            source: "adopted",
            templateId: "live-lesson",
            seed: null,
            played: "now",
            ordinal: 0,
            hasPreview: false,
            updateAvailable: false,
            title: \`🟢 Öğretmenin Dünyası (\${displayName})\`
          };
        }
      }
      const chosenId = settings.myWorldId === "live-lesson" && liveWorld ? "live-lesson" : (pickMyWorld(worlds, settings.myWorldId)?.id ?? null);
      return { worlds: [...(liveWorld ? [liveWorld] : []), ...views], chosenId };`
  );

  // Patch 10.5: worldTemplates loads settings
  code = code.replace(
    'const [templates, open, mine] = await Promise.all([\n        templatesOf(pack),\n        openManifestWorlds(pack),\n        readMyWorlds(dataDir, pack.packId)\n      ]);',
    'const [templates, open, mine, settings] = await Promise.all([\n        templatesOf(pack),\n        openManifestWorlds(pack),\n        readMyWorlds(dataDir, pack.packId),\n        readSettings(dataDir)\n      ]);'
  );

  // Patch 11: worldTemplates IPC handler (inject Öğretmenin Dünyası only when teacher is active)
  code = replaceBlock(
    code,
    'return {\n        templates: templates.map((template, index) => ({',
    'copies: copies.get(template.id) ?? 0\n        })),',
    `const isStaff = (options.isStaff?.() ?? false) || settings.isStaff === true;
      const teacherCode = (settings.teacherCode || (isStaff ? settings.lastNickname : "") || "").trim();
      let liveTemplate = null;
      if (teacherCode) {
        const teacherRoom = await queryTeacherRoom(teacherCode);
        if (teacherRoom && teacherRoom.active && teacherRoom.url) {
          const displayName = teacherRoom.teacherName || teacherCode;
          liveTemplate = {
            id: "live-lesson",
            kind: "manifest",
            name: "Öğretmenin Dünyası",
            title: {
              en: "Öğretmenin Dünyası",
              tr: "Öğretmenin Dünyası",
              ru: "Мир учителя"
            },
            seed: null,
            previewKey: null,
            artKey: null,
            description: {
              en: \`\${displayName} is currently in class! Join the world with one click.\`,
              tr: \`\${displayName} şu an derste! Tek tıkla doğrudan dünyaya katılın.\`
            },
            ready: true,
            downloading: false,
            failed: false,
            copies: 1
          };
        }
      }
      return {
        templates: [...(liveTemplate ? [liveTemplate] : []), ...templates.map((template, index) => ({
          id: template.id,
          kind: template.kind,
          seed: template.seed,
          title: template.title,
          previewKey: drawn[index] === true ? template.previewKey : null,
          artKey: painted[index] === true ? template.artKey : null,
          description: template.description,
          ready: template.ready,
          downloading: fetchingWorlds.has(template.id),
          failed: failedWorlds.has(template.id),
          copies: copies.get(template.id) ?? 0
        }))],
        teacherCode: teacherCode || "",`
  );

  // Patch 12: createWorld IPC handler (handle live-lesson and minecraft-menu selection)
  code = code.replace(
    /async createWorld\([^)]*\)\s*\{/,
    `$&
      if (templateId === "live-lesson") {
        await updateSettings(dataDir, { myWorldId: "live-lesson" });
        options.onCatalogue?.();
        return { ok: true, id: "live-lesson" };
      }
      if (templateId === "minecraft-menu") {
        await updateSettings(dataDir, { myWorldId: "minecraft-menu" });
        options.onCatalogue?.();
        return { ok: true, id: "minecraft-menu" };
      }`
  );

  // Patch 13: updateMode globally off
  code = replaceBlock(
    code,
    'function updateMode({ platform, isPackaged, env }) {',
    'if (platform === "darwin") return "install";\n  return "off";\n}',
    `function updateMode() {
  return "off";
}`
  );

  // Patch 14: auto-inject e4mc mod on launch
  code = code.replace(
    'async function launch(launchOptions) {',
    `async function launch(launchOptions) {
    try {
      const e4mcMod = findResourcePath("e4mc-5.1.0-fabric.jar");
      if (e4mcMod && node_fs.existsSync(e4mcMod)) {
        const targetMods = node_path.join(launchOptions.instance, "mods");
        node_fs.mkdirSync(targetMods, { recursive: true });
        const targetJar = node_path.join(targetMods, "e4mc-5.1.0-fabric.jar");
        if (!node_fs.existsSync(targetJar)) {
          node_fs.copyFileSync(e4mcMod, targetJar);
        }
      }
    } catch {}`
  );

  // Patch 15: quickPlayMultiplayer CLI argument and live-lesson routing
  code = code.replace(
    '...launchOptions.quickPlayWorld ? { extraMCArgs: ["--quickPlaySingleplayer", launchOptions.quickPlayWorld] } : {},',
    '...launchOptions.quickPlayMultiplayer ? { extraMCArgs: ["--quickPlayMultiplayer", launchOptions.quickPlayMultiplayer] } : (launchOptions.quickPlayWorld ? { extraMCArgs: ["--quickPlaySingleplayer", launchOptions.quickPlayWorld] } : {}),'
  );

  code = code.replace(
    '...worldName === void 0 ? {} : { quickPlayWorld: worldName },',
    `...worldName === void 0 ? {} : (
          worldName === "live-lesson" ? { quickPlayMultiplayer: (await queryTeacherRoom(launcherSettings.teacherCode || ""))?.url } : { quickPlayWorld: worldName }
        ),`
  );

  code = code.replace(
    'if (worldName !== void 0 && options.onWorldChosen) {',
    'if (worldName !== void 0 && worldName !== "live-lesson" && options.onWorldChosen) {'
  );

  // Patch 16: auto-broadcast e4mc link to VDS beacon
  code = code.replace(
    'const onGameOutput = (chunk) => {\n        gameLog?.write(chunk);',
    `const onGameOutput = (chunk) => {
        gameLog?.write(chunk);
        const e4mcMatch = chunk.match(/([a-z0-9-]+\\.e4mc\\.link)/i);
        if (e4mcMatch && e4mcMatch[1] && !activeBeaconUrl) {
          activeBeaconUrl = e4mcMatch[1];
          log(\`[CraftForge] e4mc live tunnel detected: \${activeBeaconUrl}\`);
          const teacherCode = (launcherSettings.teacherCode || identity?.login || identity?.nickname || launcherSettings.lastNickname || "").trim();
          const teacherName = (launcherSettings.teacherName || identity?.nickname || identity?.login || launcherSettings.lastNickname || "").trim();
          if (teacherCode) {
            void reportTeacherSession(teacherCode, teacherName, activeBeaconUrl, true);
            if (beaconHeartbeat) clearInterval(beaconHeartbeat);
            beaconHeartbeat = setInterval(() => {
              if (activeBeaconUrl) {
                void reportTeacherSession(teacherCode, teacherName, activeBeaconUrl, true);
              }
            }, 25000);
          }
        }`
  );

  code = code.replace(
    'running = void 0;\n      runningUnconfirmed = false;',
    `running = void 0;
      runningUnconfirmed = false;
      if (beaconHeartbeat) {
        clearInterval(beaconHeartbeat);
        beaconHeartbeat = void 0;
      }
      if (activeBeaconUrl) {
        const teacherCode = (launcherSettings.teacherCode || identity?.login || identity?.nickname || launcherSettings.lastNickname || "").trim();
        const teacherName = (launcherSettings.teacherName || identity?.nickname || identity?.login || launcherSettings.lastNickname || "").trim();
        if (teacherCode) {
          void reportTeacherSession(teacherCode, teacherName, "", false);
        }
        activeBeaconUrl = void 0;
      }`
  );

  // Patch 17: allow teacherCode, teacherName, and isStaff in settings and auth
  code = code.replace(
    '...record2["windowedDefaultApplied"] === true ? { windowedDefaultApplied: true } : {}',
    `...typeof record2["teacherCode"] === "string" ? { teacherCode: record2["teacherCode"] } : {},
      ...typeof record2["teacherName"] === "string" ? { teacherName: record2["teacherName"] } : {},
      ...record2["isStaff"] === true ? { isStaff: true } : {},
      ...record2["windowedDefaultApplied"] === true ? { windowedDefaultApplied: true } : {}`
  );

  code = code.replace(
    'await updateSettings(options.dataDir, { lastNickname: identity.login });',
    'await updateSettings(options.dataDir, { lastNickname: identity.login, isStaff: isStaff === true });'
  );

  code = code.replace(
    'currentIdentity() {\n      return session?.identity;\n    },',
    'currentIdentity() {\n      return session?.identity;\n    },\n    isStaff() {\n      return session?.isStaff === true;\n    },'
  );

  code = code.replace(
    'onCatalogue: () => send("catalogue:changed"),',
    'onCatalogue: () => send("catalogue:changed"),\n    isStaff: () => auth?.isStaff?.() ?? false,'
  );

  // Patch 18: unlockWorld handler supports teacherCode setting
  code = code.replace(
    `async unlockWorld(code) {
      const pack = await manifest();
      const hash = hashUnlockCode(code);
      const match = pack.worlds.find((world) => world.unlockHash === hash);
      if (!match) {
        log("world unlock: code matched no world");
        return { ok: false, reason: "no-match" };
      }`,
    `async unlockWorld(code) {
      const trimmed = (code || "").trim();
      if (trimmed.startsWith("@") || trimmed.includes(".") || /^(hoca:|teacher:)/i.test(trimmed)) {
        const actualCode = trimmed.replace(/^[@]|^(hoca:|teacher:)/i, "").trim().toLowerCase();
        await updateSettings(dataDir, { teacherCode: actualCode });
        options.onCatalogue?.();
        log(\`[CraftForge] teacherCode updated via unlock modal: \${actualCode}\`);
        return { ok: true, worldId: "live-lesson", alreadyOpen: false };
      }
      const pack = await manifest();
      const hash = hashUnlockCode(code);
      const match = pack.worlds.find((world) => world.unlockHash === hash);
      if (!match) {
        if (trimmed.length >= 3) {
          const beaconCheck = await queryTeacherRoom(trimmed);
          if (beaconCheck && beaconCheck.ok) {
            await updateSettings(dataDir, { teacherCode: trimmed.toLowerCase() });
            options.onCatalogue?.();
            log(\`[CraftForge] teacherCode matched via beacon: \${trimmed}\`);
            return { ok: true, worldId: "live-lesson", alreadyOpen: false };
          }
        }
        log("world unlock: code matched no world");
        return { ok: false, reason: "no-match" };
      }`
  );

    // Patch 11: Dynamic RAM Allocation (Raise MAX_XMX_MB cap from 4 GB to 8 GB for high-RAM machines)
  code = replaceBlock(
    code,
    'const MAX_XMX_MB = 4096;',
    'const SMALL_RAM_BYTES = 9 * 1024 * 1024 * 1024;',
    `const MAX_XMX_MB = 8192;
const SMALL_XMX_MB = 2048;
const SMALL_RAM_BYTES = 9 * 1024 * 1024 * 1024;`
  );

  // Patch 13: Offline SSO Fallback on Kodland HTTP 500
  code = code.replace(
    'publish(void 0, "sso_unavailable");\n        return;',
    `log("Kodland sunucusu yanıt vermiyor (HTTP 500), çevrimdışı modda oturum açılıyor...");
        const fallbackNick = "c_demirbas";
        const fallbackIdentity = {
          kodlandId: fallbackNick,
          login: fallbackNick,
          firstName: "",
          lastName: "",
          nickname: normalizeNickname({ login: fallbackNick, kodlandId: fallbackNick })
        };
        await adopt(fallbackIdentity, saved, true, null);
        return;`
  );

  fs.writeFileSync(mainJsPath, code);
    // Patch: Renderer UI (Inject TeacherCodeInput matching LockedWorld)
  try {
    const htmlPath = path.join(extractDir, 'out', 'renderer', 'index.html');
    if (fs.existsSync(htmlPath)) {
      const html = fs.readFileSync(htmlPath, 'utf8');
      const match = html.match(/src="\.\/assets\/(index-[^"]+\.js)"/);
      if (match && match[1]) {
        const bundlePath = path.join(extractDir, 'out', 'renderer', 'assets', match[1]);
        if (fs.existsSync(bundlePath)) {
          let bundle = fs.readFileSync(bundlePath, 'utf8');
          if (!bundle.includes('function TeacherCodeInput')) {
            const target = 'templates?.hasCodes && onUnlock ? /* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative shrink-0", children: [';
            const replacement = '/* @__PURE__ */ jsxRuntimeExports.jsxs("div", { className: "relative shrink-0 flex flex-col gap-2 pt-2 border-t border-stone-800/80", children: [\n      /* @__PURE__ */ jsxRuntimeExports.jsx(\n        "span",\n        {\n          "aria-hidden": "true",\n          className: "pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-24 text-stone-800 rtl:-scale-x-100",\n          children: /* @__PURE__ */ jsxRuntimeExports.jsx("svg", { viewBox: "0 0 96 32", preserveAspectRatio: "none", className: "size-full", children: /* @__PURE__ */ jsxRuntimeExports.jsx(\n            "path",\n            {\n              fill: "currentColor",\n              d: "M0 20h8v-4h6v-6h7v5h9v7h6v-9h8v4h7v-6h9v8h6v-3h8v6h6v-4h6v18H0Z"\n            }\n          ) })\n        }\n      ),\n      onUnlock ? /* @__PURE__ */ jsxRuntimeExports.jsx(TeacherCodeInput, { messages, onUnlock, savedTeacherCode: templates?.teacherCode }) : null,\n      templates?.hasCodes && onUnlock ? /* @__PURE__ */ jsxRuntimeExports.jsx(LockedWorld, { messages, onUnlock }) : null\n    ] })\n  ] });\n}\n' + "function TeacherCodeInput({ messages, onUnlock, savedTeacherCode }) {\n  const [open, setOpen] = reactExports.useState(false);\n  const [code, setCode] = reactExports.useState(\"\");\n  const [saving, setSaving] = reactExports.useState(false);\n  const activeCode = (savedTeacherCode || code).trim();\n  const isTr = messages?.worlds?.label?.includes(\"Ders\");\n\n  async function submit(event) {\n    event?.preventDefault();\n    const val = code.trim().toLowerCase();\n    if (!val || saving) return;\n    setSaving(true);\n    try {\n      await onUnlock(\"teacher:\" + val);\n      setOpen(false);\n    } catch {}\n    finally {\n      setSaving(false);\n    }\n  }\n\n  if (open) {\n    return /* @__PURE__ */ jsxRuntimeExports.jsxs(\n      \"form\",\n      {\n        onSubmit: (event) => void submit(event),\n        onKeyDown: (event) => {\n          if (event.key === \"Escape\") setOpen(false);\n        },\n        className: \"flex flex-col gap-2 rounded-lg border border-stone-600 bg-stone-800 p-3\",\n        children: [\n          /* @__PURE__ */ jsxRuntimeExports.jsxs(\"div\", { className: \"flex items-center gap-2\", children: [\n            /* @__PURE__ */ jsxRuntimeExports.jsxs(\"span\", { className: \"flex flex-1 items-center gap-2 text-sm font-semibold text-stone-200\", children: [\n              /* @__PURE__ */ jsxRuntimeExports.jsx(KeyIcon, { \"aria-hidden\": \"true\", className: \"size-4 text-stone-400\" }),\n              isTr ? \"Öğretmen kodunu gir\" : \"Enter teacher code\"\n            ] }),\n            /* @__PURE__ */ jsxRuntimeExports.jsx(\n              \"button\",\n              {\n                type: \"button\",\n                onClick: () => setOpen(false),\n                \"aria-label\": messages?.worlds?.close ?? \"Close\",\n                className: \"grid size-6 shrink-0 place-items-center rounded-md text-stone-400 transition-colors outline-none hover:bg-stone-700 hover:text-stone-100 focus-visible:ring-3 focus-visible:ring-ring/50\",\n                children: \"✕\"\n              }\n            )\n          ] }),\n          /* @__PURE__ */ jsxRuntimeExports.jsxs(\"div\", { className: \"flex items-center gap-2\", children: [\n            /* @__PURE__ */ jsxRuntimeExports.jsx(\n              \"input\",\n              {\n                type: \"text\",\n                autoFocus: true,\n                value: code,\n                onChange: (event) => setCode(event.target.value),\n                placeholder: activeCode ? activeCode : (isTr ? \"Öğretmen kodu\" : \"Teacher code\"),\n                \"aria-label\": isTr ? \"Öğretmen kodu\" : \"Teacher code\",\n                className: \"min-w-0 flex-1 rounded-lg border border-stone-600 bg-stone-800 px-3 py-2 text-sm text-stone-100 placeholder:text-stone-500 outline-none focus-visible:ring-3 focus-visible:ring-ring/50\"\n              }\n            ),\n            /* @__PURE__ */ jsxRuntimeExports.jsx(\n              \"button\",\n              {\n                type: \"submit\",\n                disabled: !code.trim() || saving,\n                className: \"shrink-0 rounded-lg bg-action px-3 py-2 text-sm font-semibold text-stone-950 transition-colors outline-none hover:brightness-110 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50\",\n                children: saving ? \"...\" : (isTr ? \"Kaydet\" : \"Save\")\n              }\n            )\n          ] })\n        ]\n      }\n    );\n  }\n\n  return /* @__PURE__ */ jsxRuntimeExports.jsxs(\n    \"button\",\n    {\n      type: \"button\",\n      onClick: () => {\n        setCode(activeCode);\n        setOpen(true);\n      },\n      className: [\n        \"flex items-center gap-3 rounded-lg p-3 text-start transition-colors\",\n        \"outline-none focus-visible:ring-3 focus-visible:ring-ring/50\",\n        \"hover:bg-stone-800\"\n      ].join(\" \"),\n      children: [\n        /* @__PURE__ */ jsxRuntimeExports.jsx(\"span\", {\n          \"aria-hidden\": \"true\",\n          className: \"grid size-11 shrink-0 place-items-center\",\n          children: /* @__PURE__ */ jsxRuntimeExports.jsx(KeyIcon, { className: \"size-5 text-stone-400\" })\n        }),\n        /* @__PURE__ */ jsxRuntimeExports.jsxs(\"span\", {\n          className: \"flex min-w-0 flex-col gap-0.5\",\n          children: [\n            /* @__PURE__ */ jsxRuntimeExports.jsx(\"span\", {\n              className: \"font-semibold text-stone-300\",\n              children: activeCode ? (isTr ? `Öğretmen: ${activeCode}` : `Teacher: ${activeCode}`) : (isTr ? \"Öğretmen kodu\" : \"Teacher code\")\n            }),\n            /* @__PURE__ */ jsxRuntimeExports.jsx(\"span\", {\n              className: \"truncate text-xs text-stone-400\",\n              children: activeCode ? (isTr ? \"kodu değiştirmek için tıkla\" : \"click to change code\") : (isTr ? \"canlı derse katılmak için\" : \"from your teacher\")\n            })\n          ]\n        })\n      ]\n    }\n  );\n}";
            if (bundle.includes(target)) {
              bundle = bundle.replace(target, replacement);
              fs.writeFileSync(bundlePath, bundle);
              console.log('==> Renderer UI yaması uygulandı (TeacherCodeInput enjekte edildi).');
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('⚠️  Renderer UI yamalama uyarısı:', err.message);
  }

  // Global Branding (Replace Kodland Launcher with CraftForge Education Edition across out/)
  function walkReplace(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walkReplace(full);
      } else if (ent.isFile() && (full.endsWith('.js') || full.endsWith('.html') || full.endsWith('.json'))) {
        let content = fs.readFileSync(full, 'utf8');
        if (content.includes('Kodland Launcher')) {
          content = content.replaceAll('Kodland Launcher', 'CraftForge Education Edition');
          fs.writeFileSync(full, content);
        }
      }
    }
  }
  walkReplace(path.join(extractDir, 'out'));

  // Preserve version name (@kodland/desktop) and version number (1.0.0) while storing upstreamVersion
  const extractPkg = path.join(extractDir, 'package.json');
  if (fs.existsSync(extractPkg)) {
    const pkgJson = JSON.parse(fs.readFileSync(extractPkg, 'utf8'));
    pkgJson.name = '@kodland/desktop';
    pkgJson.version = '1.0.0';
    pkgJson.upstreamVersion = latestVersion;
    fs.writeFileSync(extractPkg, JSON.stringify(pkgJson, null, 2));
  }
  const rootPkgPath = path.join(WORKDIR, 'package.json');
  if (fs.existsSync(rootPkgPath)) {
    const pkgJson = JSON.parse(fs.readFileSync(rootPkgPath, 'utf8'));
    pkgJson.name = '@kodland/desktop';
    pkgJson.version = '1.0.0';
    pkgJson.upstreamVersion = latestVersion;
    fs.writeFileSync(rootPkgPath, JSON.stringify(pkgJson, null, 2));
  }

  console.log('==> 6. Kod doğrulaması (syntax check) yapılıyor...');
  execSync(`node -c '${mainJsPath}'`);

  console.log('==> 7. src_extracted güncelleniyor ve app.asar paketleniyor...');
  const targetSrc = path.join(WORKDIR, 'src_extracted');
  fs.cpSync(extractDir, targetSrc, { recursive: true });

  // Ensure electron is installed in src_extracted
  if (!fs.existsSync(path.join(targetSrc, 'node_modules', 'electron'))) {
    execSync(`cd '${targetSrc}' && npm install --save-dev electron`, { stdio: 'inherit' });
  }

  execSync(`npx asar pack '${targetSrc}' '${path.join(WORKDIR, 'app.asar')}'`, { stdio: 'inherit' });

  // Clean temp
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log(`\n🎉 BAŞARILI: v${latestVersion} resmi sürümü çekildi ve tüm hile/ana menü/oto-temizlik yamalarıyla güncellendi!`);
}

main().catch(err => {
  console.error('\n❌ Hata:', err.message);
  process.exit(1);
});
