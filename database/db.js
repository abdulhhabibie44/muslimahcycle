// database/db.js
// Skema database lokal menggunakan Dexie.js (IndexedDB).
// Semua data aplikasi disimpan 100% di perangkat pengguna.

const db = new Dexie('MuslimahCycleDB');

db.version(1).stores({
  // Riwayat siklus haid
  cycle: '++id, startDate, endDate, intensity, bloodColor, hasSpotting, note, createdAt',

  // Gejala & mood harian (relasi longgar ke tanggal, bukan ke cycle id, agar bisa dicatat kapan saja)
  symptoms: '++id, date, symptomList, mood, createdAt',

  // Catatan harian bebas
  notes: '++id, date, text, createdAt',

  // Ringkasan utang puasa per periode Ramadhan
  qadha: '++id, hijriYear, totalDebt, createdAt',

  // Riwayat pembayaran qadha
  qadha_history: '++id, qadhaId, date, amount, note, createdAt',

  // Pengaturan aplikasi (key-value)
  settings: 'key',

  // Jadwal pengingat
  notifications: '++id, type, time, enabled, label, createdAt'
});

// v2: tambah tabel utang puasa manual (untuk mencatat utang dari sebelum
// mulai memakai aplikasi, atau koreksi manual di luar hitungan otomatis)
db.version(2).stores({
  cycle: '++id, startDate, endDate, intensity, bloodColor, hasSpotting, note, createdAt',
  symptoms: '++id, date, symptomList, mood, createdAt',
  notes: '++id, date, text, createdAt',
  qadha: '++id, hijriYear, totalDebt, createdAt',
  qadha_history: '++id, qadhaId, date, amount, note, createdAt',
  settings: 'key',
  notifications: '++id, type, time, enabled, label, createdAt',

  // Input utang puasa manual: hijriYear = tahun Hijriyah yang diutangkan,
  // amount = jumlah hari, date = tanggal dicatat (bukan tanggal puasa)
  qadha_manual: '++id, hijriYear, amount, date, note, createdAt'
});

// v3: perbaiki index tabel symptoms -- field `symptomList` berisi array (daftar
// gejala), tapi sebelumnya diindeks seolah nilai tunggal. Ini membuat proses
// simpan gagal secara diam-diam (IndexedDB menolak indeks non-multiEntry berisi
// array). Solusinya: hapus dari daftar indeks (tidak pernah dipakai untuk query
// where(), cuma dibaca sebagai data biasa).
db.version(3).stores({
  cycle: '++id, startDate, endDate, intensity, bloodColor, hasSpotting, note, createdAt',
  symptoms: '++id, date, mood, createdAt',
  notes: '++id, date, text, createdAt',
  qadha: '++id, hijriYear, totalDebt, createdAt',
  qadha_history: '++id, qadhaId, date, amount, note, createdAt',
  settings: 'key',
  notifications: '++id, type, time, enabled, label, createdAt',
  qadha_manual: '++id, hijriYear, amount, date, note, createdAt'
});

// Nilai default pengaturan aplikasi
const DEFAULT_SETTINGS = {
  theme: 'system',           // light | dark | system
  fontSize: 'md',            // sm | md | lg
  language: 'id',            // id | en
  hijriMode: 'auto',         // auto | manual
  hijriManualDates: {
    ramadhanStart: null,     // ISO date string, awal 1 Ramadhan (Masehi)
    syawalStart: null,       // awal 1 Syawal (Idul Fitri)
    zulhijahStart: null,     // awal 1 Zulhijah
    iduladha: null           // 10 Zulhijah (Idul Adha), jika ingin override langsung
  },
  avgCycleLength: 28,
  avgPeriodLength: 6,
  sunnahFastingEnabled: {
    senin: true,
    kamis: true,
    ayyamulBidh: true,
    arafah: true,
    asyura: true,
    tasua: true
  },
  smartQadhaReminder: true,   // saran otomatis: puasa sunnah besok + masih ada utang qadha
  lastSmartQadhaCheck: null,  // tanggal (YYYY-MM-DD) terakhir kali saran ini dicek/ditampilkan
  lastPeriodCheckDate: null   // tanggal (YYYY-MM-DD) terakhir kali modal "masih haid?" ditanyakan
};

async function initSettings() {
  const existing = await db.settings.get('app');
  if (!existing) {
    await db.settings.put({ key: 'app', value: DEFAULT_SETTINGS });
  }
  return (await db.settings.get('app')).value;
}

async function getSettings() {
  const row = await db.settings.get('app');
  return row ? row.value : DEFAULT_SETTINGS;
}

async function updateSettings(partial) {
  const current = await getSettings();
  const merged = { ...current, ...partial };
  await db.settings.put({ key: 'app', value: merged });
  return merged;
}
