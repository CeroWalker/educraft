# CraftForge Education Edition - Windows Online Installer (PowerShell)
# Kullanım (Tek Satır):
# powershell -ExecutionPolicy Bypass -Command "iwr -useb https://raw.githubusercontent.com/CeroWalker/educraft/master/install.ps1 | iex"

param(
    [string]$Repo = "CeroWalker/educraft",
    [string]$Version = "latest"
)

Write-Host "=========================================================" -ForegroundColor Cyan
Write-Host "🎓 CraftForge Education Edition - Online Setup (Windows)" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan

$ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"

# 1. Administrator Check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[!] Yonetici yetkisi gerekiyor. UAC onay penceresi baslatiliyor..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Verb RunAs
    exit
}

# 2. Stop Running Instances
Get-Process "Kodland Launcher" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Get-Process "python" -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

# 3. Check & Install Python 3
$pyWork = $false
try {
    $ver = python -c "import sys; print(sys.version)" 2>$null
    if ($ver) { $pyWork = $true }
} catch {}

if (-not $pyWork) {
    Write-Host "[!] Python 3 bulunamadi. Resmi Python 3.11 indirilip kuruluyor..." -ForegroundColor Yellow
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    $arch = $env:PROCESSOR_ARCHITECTURE
    $pyUrl = if ($arch -eq 'ARM64' -or $env:PROCESSOR_ARCHITEW6432 -eq 'ARM64') {
        'https://www.python.org/ftp/python/3.11.9/python-3.11.9-arm64.exe'
    } else {
        'https://www.python.org/ftp/python/3.11.9/python-3.11.9-amd64.exe'
    }
    $pySetup = Join-Path $env:TEMP "py311_setup.exe"
    try {
        Invoke-WebRequest -Uri $pyUrl -UserAgent $ua -OutFile $pySetup -ErrorAction SilentlyContinue
        Start-Process -FilePath $pySetup -ArgumentList '/quiet InstallAllUsers=0 PrependPath=1 Include_test=0' -Wait
        Remove-Item $pySetup -Force -ErrorAction SilentlyContinue
    } catch {}
}

# 4. Target Directories
$targetDir = "$env:APPDATA\KodlandLauncher"
$instanceDir = "$targetDir\instances\kodland-course-default"
$modsDir = "$instanceDir\mods"
$null = New-Item -ItemType Directory -Force -Path $targetDir, $instanceDir, $modsDir, "$targetDir\resources\mods"

# Options.txt GUI Scale
$optionsFile = "$instanceDir\options.txt"
if (-not (Test-Path $optionsFile)) {
    Set-Content -Path $optionsFile -Value "guiScale:3"
} else {
    $content = Get-Content $optionsFile
    if ($content -notmatch "guiScale:") {
        Add-Content -Path $optionsFile -Value "guiScale:3"
    }
}

# 5. Download Release Assets & Core Patches from GitHub
$baseUrl = if ($Version -eq "latest") {
    "https://github.com/$Repo/releases/latest/download"
} else {
    "https://github.com/$Repo/releases/download/$Version"
}
$rawUrl = "https://raw.githubusercontent.com/$Repo/master"

Write-Host "[➜] GitHub uzerinden yama dosyalari indiriliyor..." -ForegroundColor Green

# Download app.asar
$asarDownloaded = $false
try {
    Invoke-WebRequest -Uri "$baseUrl/app.asar" -UserAgent $ua -OutFile "$targetDir\app.asar" -ErrorAction Stop
    $asarDownloaded = $true
} catch {
    try {
        Invoke-WebRequest -Uri "$rawUrl/app.asar" -UserAgent $ua -OutFile "$targetDir\app.asar" -ErrorAction Stop
        $asarDownloaded = $true
    } catch {}
}

if (-not $asarDownloaded) {
    Write-Host "[⚠️ WARNING] app.asar dosyasi indirilemedi. Lutfen Release uzerine app.asar ekleyin." -ForegroundColor Yellow
} else {
    Write-Host "✅ app.asar yama paketi indirildi!" -ForegroundColor Green
}

# Download Core Patch Scripts
try { Invoke-WebRequest -Uri "$rawUrl/code_builder_bridge.py" -UserAgent $ua -OutFile "$targetDir\code_builder_bridge.py" -ErrorAction SilentlyContinue } catch {}
try { Invoke-WebRequest -Uri "$rawUrl/launch.vbs" -UserAgent $ua -OutFile "$targetDir\launch.vbs" -ErrorAction SilentlyContinue } catch {}
try { Invoke-WebRequest -Uri "$rawUrl/icon.ico" -UserAgent $ua -OutFile "$targetDir\icon.ico" -ErrorAction SilentlyContinue } catch {}
try { Invoke-WebRequest -Uri "$rawUrl/resources/mods/educraft-agent-bridge-1.0.0.jar" -UserAgent $ua -OutFile "$modsDir\educraft-agent-bridge-1.0.0.jar" -ErrorAction SilentlyContinue } catch {}

# 6. Download Performance Mods (Sodium & Lithium) from Modrinth CDN
Write-Host "[➜] Performans modlari (Sodium & Lithium) internetten indiriliyor..." -ForegroundColor Green
$sodiumUrl = "https://cdn.modrinth.com/data/AANobbMI/versions/xJZxADzI/sodium-fabric-0.9.2%2Bmc26.2.jar"
$lithiumUrl = "https://cdn.modrinth.com/data/gvQqBUqZ/versions/f7vZ0VWU/lithium-fabric-0.25.3%2Bmc26.2.jar"

try { Invoke-WebRequest -Uri $sodiumUrl -UserAgent $ua -OutFile "$modsDir\sodium-fabric-0.9.2+mc26.2.jar" -ErrorAction SilentlyContinue } catch {}
try { Invoke-WebRequest -Uri $lithiumUrl -UserAgent $ua -OutFile "$modsDir\lithium-fabric-0.25.3+mc26.2.jar" -ErrorAction SilentlyContinue } catch {}

# 7. Create Invisible Desktop Shortcut
$desktop = [Environment]::GetFolderPath("Desktop")
if (Test-Path "$env:USERPROFILE\OneDrive\Masaustu") { $desktop = "$env:USERPROFILE\OneDrive\Masaustu" }
elseif (Test-Path "$env:USERPROFILE\Masaustu") { $desktop = "$env:USERPROFILE\Masaustu" }

try {
    $ws = New-Object -ComObject WScript.Shell
    $s = $ws.CreateShortcut("$desktop\CraftForge Education.lnk")
    $s.TargetPath = "wscript.exe"
    $s.Arguments = "`"$targetDir\launch.vbs`""
    $s.WorkingDirectory = $targetDir
    $s.IconLocation = "$targetDir\icon.ico,0"
    $s.Save()
} catch {}

Write-Host "=========================================================" -ForegroundColor Green
Write-Host "✅ CraftForge Education Edition (Windows) Kurulumu Tamamlandi!" -ForegroundColor Green
Write-Host "Masaustu kisayolu olusturuldu." -ForegroundColor Green
Write-Host "=========================================================" -ForegroundColor Green
