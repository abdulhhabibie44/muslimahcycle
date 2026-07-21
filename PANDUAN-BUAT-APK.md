# Panduan Membungkus Muslimah Cycle Jadi APK (via TWA)

Dokumen ini memandu kamu dari nol sampai punya file `.apk` yang bisa dibagikan
ke orang lain. Semua fitur (export/import, notifikasi, kalender, database)
akan tetap berfungsi persis seperti versi web/PWA, karena TWA menjalankan
Chrome asli di baliknya — bukan menulis ulang kode.

**Perkiraan waktu:** 30–60 menit (di luar waktu review kalau kamu publish ke Play Store).

---

## Gambaran Alur

```
1. Hosting file website  -->  2. Generate APK di PWABuilder  -->  3. Pasang assetlinks.json  -->  4. Bagikan APK
```

---

## Langkah 1 — Hosting File Website

TWA **wajib** menunjuk ke website yang benar-benar online (HTTPS), tidak bisa dari folder lokal di komputer.

Pilih salah satu hosting gratis ini (semuanya support HTTPS otomatis + service worker):

### Opsi A — Netlify (paling gampang, drag & drop)
1. Buka https://app.netlify.com/drop
2. Drag seluruh folder `muslimah-cycle` (isi projectnya) ke halaman itu
3. Tunggu selesai upload, Netlify kasih URL otomatis, misal `https://muslimah-cycle-abc123.netlify.app`
4. Catat URL ini — dipakai di Langkah 2

### Opsi B — GitHub Pages (kalau sudah punya akun GitHub)
1. Buat repository baru, upload semua file project (bukan di-zip, file mentahnya)
2. Masuk **Settings → Pages** di repo tersebut, pilih branch `main`, folder `/root`
3. Tunggu beberapa menit, URL-nya biasanya `https://namakamu.github.io/nama-repo/`

### Opsi C — Firebase Hosting (kalau sudah biasa pakai Firebase)
1. `npm install -g firebase-tools`
2. `firebase login` lalu `firebase init hosting`
3. Arahkan public directory ke folder project ini
4. `firebase deploy`

**Penting:** pastikan setelah hosting, kamu bisa buka `https://url-kamu/manifest.json` dan `https://url-kamu/service-worker.js` langsung dari browser (harus bisa diakses, bukan 404).

---

## Langkah 2 — Generate APK di PWABuilder

1. Buka https://www.pwabuilder.com
2. Masukkan URL website kamu dari Langkah 1, klik **Start**
3. PWABuilder akan menganalisis PWA kamu (manifest, service worker, ikon) — pastikan skornya hijau/oke di bagian "Manifest" dan "Service Worker". Kalau ada peringatan kecil biasanya masih aman dilanjut
4. Klik tab **Android**, lalu **Generate Package**
5. Isi form:
   - **Package ID**: contoh `com.muslimahcycle.app` (harus unik, format kebalikan domain, boleh bebas asal konsisten)
   - **App name**: `Muslimah Cycle`
   - **Signing key**: pilih **"Generate new signing key"** kalau ini APK pertama kamu (PWABuilder akan generate otomatis)
6. Klik **Generate**, tunggu proses build (biasanya 1–2 menit)
7. Download hasilnya — kamu akan dapat:
   - File `.apk` atau `.aab` (APK untuk sideload langsung, AAB untuk upload ke Play Store)
   - File `signing.keystore` dan info **SHA-256 fingerprint** (⚠️ **simpan file keystore ini baik-baik**, dibutuhkan lagi kalau nanti mau update APK)
   - File `assetlinks.json` yang sudah otomatis diisi dengan package ID & fingerprint kamu

---

## Langkah 3 — Pasang `assetlinks.json`

Ini yang membuat APK-mu tampil **tanpa address bar** (benar-benar terlihat seperti app native, bukan Chrome).

1. Ambil isi file `assetlinks.json` hasil download dari PWABuilder (Langkah 2)
2. Buka file `.well-known/assetlinks.json` yang sudah saya siapkan di project ini — isinya masih placeholder:
   ```json
   "package_name": "com.muslimahcycle.app",
   "sha256_cert_fingerprints": ["GANTI_DENGAN_FINGERPRINT_SHA256_DARI_PWABUILDER"]
   ```
3. Ganti `package_name` dan `sha256_cert_fingerprints` dengan nilai asli dari file PWABuilder tadi
4. Upload ulang file ini ke hosting kamu di path persis: `https://url-kamu/.well-known/assetlinks.json`
5. Cek dengan Google Statement List Tool: https://developers.google.com/digital-asset-links/tools/generator — masukkan URL & package name, pastikan hasilnya "cocok"

> Kalau langkah ini dilewati, APK tetap bisa dipakai — cuma nanti muncul address bar kecil di bagian atas (fallback), bukan fullscreen murni.

---

## Langkah 4 — Uji Coba & Bagikan

1. Install APK-nya ke HP Android (aktifkan dulu "Install dari sumber tidak dikenal" di pengaturan HP kalau belum)
2. Cek satu-satu fitur inti:
   - [ ] Buka app, dashboard tampil normal
   - [ ] Kalender tampil (grid + hijriyah)
   - [ ] Catat haid → tersimpan
   - [ ] Ekspor JSON → file ke-download
   - [ ] Impor JSON → data masuk lagi
   - [ ] Pengaturan → Aktifkan Notifikasi → izin muncul & bisa di-approve
   - [ ] Kirim Notifikasi Tes → notifikasi muncul di tray Android
   - [ ] Cek Saran Qadha Sekarang (kalau ada utang + besok puasa sunnah) → notifikasi muncul
   - [ ] Tutup app total, buka lagi → data & pengaturan tetap ada (bukti offline storage jalan)
3. Kalau semua oke, tinggal bagikan file `.apk`-nya ke siapa pun (lihat catatan sideload vs Play Store di bawah)

---

## Cara Membagikan ke Orang Lain

**Sideload (paling simpel, gratis, langsung)**
- Kirim file `.apk` lewat WhatsApp/Drive/Telegram
- Orang lain klik file → izinkan "Install dari sumber tidak dikenal" → install seperti biasa

**Google Play Store (opsional, lebih profesional)**
- Perlu akun Google Play Console (biaya sekali ±$25)
- Upload file `.aab` (bukan `.apk`) hasil dari PWABuilder
- Proses review Google biasanya beberapa hari sebelum tayang

---

## Update APK di Kemudian Hari

Kalau nanti saya bantu tambah fitur baru lagi:
1. Upload ulang file project yang sudah diperbarui ke hosting yang sama
2. APK yang sudah terinstall **otomatis dapat versi terbaru** dari kode web-nya (karena TWA cuma "cangkang" yang menunjuk ke website — sama seperti PWA yang sudah kita siapkan sistem update-nya)
3. **Kamu TIDAK perlu generate APK baru** kecuali mengubah hal-hal di level native seperti nama app, ikon di launcher, atau splash screen

---

## Troubleshooting Singkat

| Masalah | Kemungkinan Penyebab |
|---|---|
| Muncul address bar di atas app | `assetlinks.json` belum terpasang benar / fingerprint tidak cocok |
| Notifikasi tidak muncul | Sama seperti versi web — cek izin notifikasi di Pengaturan Android untuk app ini |
| Data hilang setelah update APK | Seharusnya tidak terjadi (data di IndexedDB per-origin, bukan di dalam APK) — kalau terjadi, kemungkinan origin/domain hosting berubah |
| PWABuilder kasih skor jelek di "Service Worker" | Pastikan `service-worker.js` bisa diakses langsung dari browser di URL hosting kamu |
