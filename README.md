# 🎓 CraftForge Education Edition

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20Linux%20%7C%20macOS-brightgreen.svg)]()
[![Python](https://img.shields.io/badge/Python-3.9%2B-blue.svg)](https://www.python.org/)

CraftForge Education Edition, Minecraft tabanlı, yüksek performanslı Python Code Builder Bridge ve Fabric Mod Entegrasyonu içeren eğitim odaklı özel yama paketidir.

---

## 🚀 Hızlı Çevrimiçi Kurulum (Online Installer)

Kurulum yapmak için bilgisayarınıza yüzlerce megabaytlık bağımlılık veya binary dosyası indirmenize gerek yoktur. Aşağıdaki tek satırlık komutlar, işletim sisteminize göre gerekli Python ortamını denetler ve en güncel yama paketlerini doğrudan GitHub Releases üzerinden çekip sisteme entegre eder.

### 🪟 Windows (PowerShell)

PowerShell'i açın ve şu komutu çalıştırın:

```powershell
powershell -ExecutionPolicy Bypass -Command "iwr -useb https://raw.githubusercontent.com/CeroWalker/educraft/main/install.ps1 | iex"
```

> **Not:** Sistemde Python 3 yüklü değilse, kurulum scripti resmi Python 3.11'i sessiz modda otomatik kuracaktır. Masaüstünde görünmez başlatıcı kısayolu (`CraftForge Education.lnk`) otomatik oluşturulur.

---

### 🐧 Linux & 🍎 macOS (Terminal)

Terminali açın ve şu komutu çalıştırın:

```bash
curl -fsSL https://raw.githubusercontent.com/CeroWalker/educraft/main/install.sh | bash
```

> **Not:** Linux dağıtımınızın paket yöneticisine (`apt`, `dnf`, `pacman`, `zypper`, `apk`) veya macOS Homebrew yapısına uygun şekilde Python 3 doğrulanır ve uygulama menünüze `.desktop` kısayolu eklenir.

---

## 🛠️ Mimari ve Yama Bileşenleri

* **`install.ps1` / `install.sh`**: İşletim sistemine uygun tek satırlık akıllı çevrimiçi kurucular.
* **`code_builder_bridge.py`**: Minecraft oyunu ile Python kodlama ekranı arasındaki iletişimi sağlayan daemon köprüsü.
* **`resources/mods/educraft-agent-bridge-1.0.0.jar`**: Minecraft Fabric 1.20.x mimarisine entegre çalışan Java Agent Bridge mod dosyası.
* **`Sodium` & `Lithium`**: Düşük donanımlı bilgisayarlarda akıcı oyun deneyimi sağlayan performans modları.
* **`launch.vbs` & `run.sh`**: Konsol penceresi açmadan arka planda sessiz başlatmayı sağlayan scriptler.

---

## 📜 Lisans

Bu proje MIT Lisansı altında sunulmaktadır.
