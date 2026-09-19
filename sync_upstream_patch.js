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

  console.log('==> 5. Kernel seviyesi yamalar uygulanıyor...');
  const mainJsPath = path.join(extractDir, 'out', 'main', 'index.js');
  let code = fs.readFileSync(mainJsPath, 'utf8');

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

  // Patch 4: sweepJars disabled
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

  // Patch 6: writeWorld calls enableCheatsInLevelDat
  code = replaceBlock(
    code,
    'async function writeWorld(worldDir, worldName, seed, version2, now = /* @__PURE__ */ new Date()) {',
    'await promises.writeFile(node_path.join(worldDir, ...WORLD_GEN_SETTINGS_PATH), encodeWorldGenSettings(seed, version2));\n}',
    `async function writeWorld(worldDir, worldName, seed, version2, now = /* @__PURE__ */ new Date()) {
  await promises.mkdir(node_path.join(worldDir, WORLD_GEN_SETTINGS_PATH[0], WORLD_GEN_SETTINGS_PATH[1]), {
    recursive: true
  });
  await promises.writeFile(node_path.join(worldDir, "level.dat"), encodeLevelDat({ worldName, version: version2, now }));
  await promises.writeFile(node_path.join(worldDir, ...WORLD_GEN_SETTINGS_PATH), encodeWorldGenSettings(seed, version2));
  enableCheatsInLevelDat(node_path.join(worldDir, "level.dat"));
}`
  );

  // Patch 7: listTemplates (Inject Standart Minecraft / Main Menu template)
  code = replaceBlock(
    code,
    'function listTemplates(open, library) {',
    'return [...presets, random];\n}',
    `function listTemplates(open, library) {
  const mainmenu = {
    id: "minecraft-menu",
    kind: "preset",
    seed: null,
    title: "Ana Menü (Standart Minecraft)",
    description: "Dünyasız başlat - Minecraft ana menüsüne girer",
    artKey: null,
    revision: null,
    previewKey: null,
    ready: true
  };
  const random = {
    id: RANDOM_WORLD_ID,
    kind: "random",
    seed: null,
    title: null,
    description: null,
    artKey: null,
    revision: null,
    previewKey: null,
    ready: true
  };
  if (open !== void 0) {
    const lessons = open.map(
      (world) => ({
        id: world.id,
        kind: "manifest",
        seed: null,
        title: world.title ?? null,
        description: world.description ?? null,
        artKey: world.art ? artKeyOf(world.art.sha512) : null,
        revision: world.revision,
        previewKey: \`\${world.id}-r\${world.revision}\`,
        ready: library.get(world.id) === world.revision
      })
    );
    return [mainmenu, ...lessons, random];
  }
  const presets = PRESET_WORLDS.map(
    (world) => ({
      id: world.id,
      kind: "preset",
      seed: world.seed === null ? null : world.seed.toString(),
      title: null,
      description: null,
      artKey: null,
      revision: null,
      previewKey: null,
      ready: true
    })
  );
  return [mainmenu, ...presets, random];
}`
  );

  // Patch 8: myWorlds & createWorld (Handle minecraft-menu entry in My Worlds list and creation)
  code = replaceBlock(
    code,
    'async myWorlds(lessonId) {',
    'return { worlds: views, chosenId };\n    },',
    `async myWorlds(lessonId) {
      const pack = await manifest();
      await ensureMyWorlds(pack);
      if (lessonId !== void 0) await seedLesson(pack, lessonId);
      const [worlds, library, settings] = await Promise.all([
        readMyWorlds(dataDir, pack.packId),
        listWorldLibrary(dataDir, pack.packId),
        readSettings(dataDir)
      ]);
      const rows = await describeMyWorlds(dataDir, pack.packId, worlds, library);
      const titles = new Map(pack.worlds.map((world) => [world.id, world.title ?? null]));
      const views = rows.map((row) => ({
        ...row,
        title: row.templateId === null ? null : titles.get(row.templateId) ?? null
      }));
      const menuWorld = {
        id: "minecraft-menu",
        folder: "",
        name: "Ana Menü (Standart Minecraft)",
        source: "preset",
        templateId: "minecraft-menu",
        seed: null,
        played: "today",
        ordinal: 0,
        hasPreview: false,
        updateAvailable: false,
        title: "Ana Menü (Dünyasız)"
      };
      const chosenId = settings.myWorldId === "minecraft-menu" ? "minecraft-menu" : (pickMyWorld(worlds, settings.myWorldId)?.id ?? null);
      return { worlds: [menuWorld, ...views], chosenId };
    },`
  );

  code = replaceBlock(
    code,
    'async createWorld(templateId) {',
    'const pack = await manifest();',
    `async createWorld(templateId) {
      if (templateId === "minecraft-menu") {
        await updateSettings(dataDir, { myWorldId: "minecraft-menu" });
        options.onCatalogue?.();
        return { ok: true, id: "minecraft-menu" };
      }
      const pack = await manifest();`
  );

  // Patch 9: resolveWorld (Check minecraft-menu to disable quickPlay and open main menu)
  code = replaceBlock(
    code,
    'async function resolveWorld(game) {',
    'log(`could not prepare a world, the game will open at the menu: ${String(error)}`);\n      return void 0;\n    }\n  }',
    `async function resolveWorld(game) {
    const pack = game.manifest;
    await ensureMyWorlds(pack);
    const settings = await readSettings(dataDir);
    if (settings.myWorldId === "minecraft-menu") {
      log("launching into standard Minecraft main menu (quickPlay disabled)");
      return void 0;
    }
    const worlds = await readMyWorlds(dataDir, pack.packId);
    const chosen = pickMyWorld(worlds, settings.myWorldId);
    if (chosen) {
      enableCheatsInLevelDat(node_path.join(instanceLayout(dataDir, pack.packId).saves, chosen.folder, "level.dat"));
      return chosen.folder;
    }
    try {
      const version2 = game.clientVersion ?? await readClientVersionInfo(game.instance, pack.minecraft);
      const templates = await templatesOf(pack);
      const open = await openManifestWorlds(pack);
      const first = templates.find((entry) => entry.ready) ?? templates[templates.length - 1];
      const template = first ? templateFor(first.id, open, templates) : void 0;
      const made = template ? await createMyWorld(dataDir, pack.packId, template, version2) : void 0;
      if (made?.ok) {
        await updateSettings(dataDir, { myWorldId: made.world.id });
        options.onCatalogue?.();
        log(\`first world "\${made.world.folder}" created from \${first?.id ?? "nothing"}\`);
        enableCheatsInLevelDat(node_path.join(instanceLayout(dataDir, pack.packId).saves, made.world.folder, "level.dat"));
        return made.world.folder;
      }
      log(\`could not make a first world: \${made?.ok === false ? made.reason : "no footprint"}\`);
      return void 0;
    } catch (error) {
      log(\`could not prepare a world, the game will open at the menu: \${String(error)}\`);
      return void 0;
    }
  }`
  );

  // Patch 10: updateMode globally off
  code = replaceBlock(
    code,
    'function updateMode({ platform, isPackaged, env }) {',
    'if (platform === "darwin") return "install";\n  return "off";\n}',
    `function updateMode() {
  return "off";
}`
  );

  fs.writeFileSync(mainJsPath, code);

  // Patch 11: Global Branding (Replace Kodland Launcher with CraftForge Education Edition across out/)
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

  console.log('==> 6. src_extracted güncelleniyor ve app.asar paketleniyor...');
  const targetSrc = path.join(WORKDIR, 'src_extracted');
  fs.cpSync(extractDir, targetSrc, { recursive: true });

  // Ensure electron is installed in src_extracted
  if (!fs.existsSync(path.join(targetSrc, 'node_modules', 'electron'))) {
    execSync(`cd '${targetSrc}' && npm install --save-dev electron`, { stdio: 'inherit' });
  }

  execSync(`npx asar pack '${targetSrc}' '${path.join(WORKDIR, 'app.asar')}'`, { stdio: 'inherit' });

  // Clean temp
  fs.rmSync(tempDir, { recursive: true, force: true });
  console.log(`\n🎉 BAŞARILI: v${latestVersion} resmi sürümü çekildi! Sürüm adı ve numarası (v1.0.0) korundu.`);
}

main().catch(err => {
  console.error('\n❌ Hata:', err.message);
  process.exit(1);
});
