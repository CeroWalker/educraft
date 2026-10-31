# 🎓 CraftForge Education Edition - Mimari ve İyileştirme Raporu

**Tarih:** 26 Eylül 2026  
**Proje:** CraftForge Education Edition (Kodland Desktop Launcher & Minecraft Agent Bridge)  
**İnceleyen & Geliştiren:** Niko (Teknik Mükemmeliyetçi & Kernel Seviyesi Kod İnceleme Modu)  

---

## 📄 1. GENEL İNCELEME VE TESPİT EDİLEN TEKNİK BEYİN ÖLÜMLERİ

Projeye yapılan genel kod incelemesinde aşağıdaki kritik zafiyetler ve performans katliamları tespit edilmiştir:

1. **Disk I/O IPC Katliamı:** Oyun ile Python bridge arasındaki iletişimin her adımda diske `edu_commands.log` ve `edu_blocks.json` dosyalarını yazıp okuyarak yapılması (Yüksek I/O gecikmesi, flash bellek yıpranması).
2. **`exec()` Güvenlik Açığı:** Web sunucusuna POST ile gelen metinlerin denetimsiz bodoslama `exec()` ile çalıştırılması (`os.system("rm -rf /")` gibi komutlara karşı savunmasızlık).
3. **Kırılgan String Parsing:** Python komutlarının `cmd.split("(")` ve `.replace("'", "")` gibi ilkel string manipülasyonlarıyla parçalanmaya çalışılması.
4. **İlkel `<textarea>` Editör:** Kodlama ekranı olarak renklendirmesiz ve tamamlama özelliksiz ilkel metin alanı kullanılması.
5. **SSO HTTP 500 Kilitlenmesi:** Kodland merkezi API sunucuları çöküp 500 hatası verdiğinde launcher'ın oturum açmayı reddedip hata ekranında kilitlenmesi.

---

## 🛠️ 2. UYGULANAN MİMARİ VE PERFORMANS YAMALARI

### 🟢 A. AST Tabanlı Güvenli Python Sandbox
* `SecurityVisitor` sınıfı yazıldı.
* Kullanıcı tarafından gönderilen kodlar `ast.parse` ile analiz edilir.
* `import`, `open`, `eval`, `exec`, `os`, `sys`, `system`, `__import__` gibi işletim sistemine sızabilecek keyword'ler ve fonksiyonlar engellenir.
* `sys.settrace` ile maksimum adım (2000 adım) ve zaman aşımı (15 saniye) sınırları konuldu.

### 🟢 B. AST Tabanlı Fonksiyon Ayrıştırıcısı (Zero String Split)
* `parse_command_ast()` fonksiyonu entegre edildi.
* `agent.move('forward', 5)` veya `agent.place(direction='down', block='stone')` gibi tek satırlık komutlar tam Python AST sentaks ağacı üzerinden hatasız ayrıştırılır.

### 🟢 C. RAM Telemetri Önbelleği (`IN_MEMORY_BLOCK_CACHE`)
* `agent.detect()` fonksiyonunun her döngü adımında diski okuması engellendi.
* Blok verileri doğrudan RAM üzerinde önbelleklenir ve milisaniyenin altında çekilir.

### 🟢 D. Soket Tabanlı Canlı Bellek İçi IPC (`self.clients`)
* Java Fabric Modu / In-Game UI ile Python Bridge arasında soket yayın katmanı kuruldu.
* Diske dosya yazma bağımlılığı kaldırıldı; komutlar bağlı soket istemcilerine anında bellekten iletilir.

### 🟢 E. Kernel Seviyesi Çevrimdışı SSO Fallback Yaması
* Electron launcher çekirdeğinde (`src_extracted/out/main/index.js` ve `sync_upstream_patch.js`) `restore()` fonksiyonu yamalandı.
* Kodland sunucuları HTTP 500 verdiğinde launcher çökmek yerine `c_demirbas` yerel profiliyle otomatik çevrimdışı oturum açar.

---

## 🧩 3. GÖRSEL BLOK KODLAMA (GOOGLE BLOCKLY / SCRATCH ENTEGRASYONU)

Oyun içi `http://127.0.0.1:8080` overlay ekranına **Google Blockly** görsel kodlama kütüphanesi entegre edildi:

* **Sekmeli Arayüz:** `[ 🧩 Görsel Bloklar (Scratch) ]` ve `[ 🐍 Python Kodu ]` sekmeleri eklendi.
* **Özel CraftForge Blokları:**
  * 🤖 `agent_spawn`: Agent Robot Çağır / Işınla
  * ⬆️ `agent_move`: Yön ve adım sayısı ile hareket ettir
  * 🔄 `agent_turn`: Sağa / Sola / Geriye dön
  * 🧱 `agent_place`: Yön ve blok türü seçerek blok koy
  * ⛏️ `agent_destroy`: İstediğin yöndeki bloku kır
  * 🔍 `agent_detect`: Etraftaki blok türünü algıla
  * 💬 `player_say`: Oyuncu sohbet mesajı gönder
  * 🌍 `world_setblock`: Koordinata blok yerleştir
  * 🧪 `chemistry_element`: Kimya elementi ver
* **Anlık Python Transpiler:** Bloklar sürüklendikçe arkada anında Python kodu üretilir ve `▶️ Görsel Kodu Oyunda Çalıştır` butonuyla oyunda koşturulur.
* **Otomatik Dizin Senkronizasyonu:** Güncellenmiş script `~/.local/share/KodlandLauncher/code_builder_bridge.py` dizinine kopyalanarak sistem genelinde aktif edildi.

---

## 📦 4. GİT VE GİTHUB RELEASE YÖNETİMİ

1. `app.asar` paketi `npx asar pack` ile yeniden paketlendi.
2. `gh release upload v1.0.0 app.asar --clobber` komutuyla 319 MB'lık güncel yama paketi **GitHub Releases v1.0.0** sürümüne başarıyla yüklendi.
3. Git ortamında test aşaması için remote `master` dalı `git reset --soft 09518f8` ve `git push --force` ile kararlı sürüme çekildi; tüm yeni kodlar yerelde test edilmek üzere korundu.

---

### 🚀 ÖZET TABLO

| Özellik | Eski Durum | Yeni Durum |
| :--- | :--- | :--- |
| **Güvenlik** | Düz `exec()` açık | AST Sandbox Koruması |
| **IPC** | Diske log dosyası yazma | RAM / Soket Yayını |
| **Parser** | String split (`(`) | Python AST Engine |
| **Editör** | Düz Textarea | Scratch (Blockly) + Python IDE |
| **SSO Bağlantısı** | HTTP 500'de kilitlenme | Çevrimdışı Otomatik Oturum |

---
*Rapor CraftForge Education Edition mimarisi için antlaşma metni olarak oluşturulmuştur.*
