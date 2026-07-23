// services/hijriService.js
// Konversi tanggal Masehi <-> Hijriyah.
// Mode "auto" memakai algoritma tabular (Kuwaiti algorithm) sebagai perkiraan.
// Mode "manual" menggeser hasil algoritma agar cocok dengan tanggal awal Ramadhan/Syawal/
// Zulhijah yang ditentukan sendiri oleh pengguna (mis. mengikuti keputusan pemerintah).

const HIJRI_MONTHS = [
  'Muharram', 'Safar', "Rabiul Awal", "Rabiul Akhir",
  'Jumadil Awal', 'Jumadil Akhir', 'Rajab', "Sya'ban",
  'Ramadhan', 'Syawal', "Dzulqa'dah", 'Dzulhijjah'
];

// Algoritma tabular Kuwaiti: konversi Julian Day <-> Hijri
function gregorianToJD(date) {
  return dayjs(date).startOf('day').valueOf() / 86400000 + 2440587.5;
}

function jdToHijri(jd) {
  // PENTING: jangan tambah 0.5 di sini -- itu bikin pembulatan hari selalu
  // "kebulat ke atas" 1 hari lebih banyak di tiap pergantian bulan (tanggal 1
  // keloncat jadi tanggal 2, hari terakhir bulan salah jadi 31 padahal maks 30).
  jd = Math.floor(jd);
  const iyear0 = Math.floor((30 * (jd - 1948440) + 10646) / 10631);
  let iyear = iyear0;
  let iMonth, iDay;
  const monthStart = (y, m) => {
    return Math.ceil(29.5001 * (m - 1)) + (y - 1) * 354 + Math.floor((3 + 11 * y) / 30) + 1948440 - 1;
  };
  let startOfYear = monthStart(iyear, 1);
  // cari bulan
  let m = 1;
  let dayCursor = startOfYear;
  while (m <= 12) {
    const len = (m === 12) ? (monthStart(iyear + 1, 1) - monthStart(iyear, 12)) : (monthStart(iyear, m + 1) - monthStart(iyear, m));
    if (jd < monthStart(iyear, m) + len) break;
    m++;
  }
  iMonth = m;
  iDay = jd - monthStart(iyear, iMonth) + 1;
  return { year: iyear, month: iMonth, day: Math.round(iDay) };
}

function hijriToJD(year, month, day) {
  return Math.ceil(29.5001 * (month - 1)) + (year - 1) * 354 + Math.floor((3 + 11 * year) / 30) + 1948440 + day - 1 - 1;
}

function jdToGregorian(jd) {
  return dayjs(new Date((jd - 2440587.5) * 86400000));
}

/**
 * Konversi tanggal Masehi ke Hijriyah (mode auto, algoritma tabular murni).
 */
function toHijriAuto(gregorianDate) {
  const jd = gregorianToJD(gregorianDate);
  const h = jdToHijri(jd);
  return h;
}

/**
 * Hitung offset (dalam hari) antara hasil algoritma auto dengan tanggal manual
 * yang ditentukan pengguna untuk 1 Ramadhan / 1 Syawal / 1 Dzulhijjah.
 * Offset ini dipakai untuk menggeser semua tanggal Hijriyah agar konsisten
 * dengan penetapan pemerintah/pengguna.
 */
function getManualOffset(settings, referenceGregorianDate) {
  if (!settings || settings.hijriMode !== 'manual') return 0;
  const manual = settings.hijriManualDates || {};
  const refDate = dayjs(referenceGregorianDate);

  // Pilih titik acuan manual terdekat (Ramadhan/Syawal/Zulhijah) yang sudah diisi
  const candidates = [];
  if (manual.ramadhanStart) candidates.push({ date: manual.ramadhanStart, month: 9, day: 1 });
  if (manual.syawalStart) candidates.push({ date: manual.syawalStart, month: 10, day: 1 });
  if (manual.zulhijahStart) candidates.push({ date: manual.zulhijahStart, month: 12, day: 1 });

  if (candidates.length === 0) return 0;

  // pilih candidate (titik acuan manual) yang tanggalnya paling dekat dengan referensi
  let best = candidates[0];
  let bestDiff = Infinity;
  for (const c of candidates) {
    const diff = Math.abs(dayjs(c.date).diff(refDate, 'day'));
    if (diff < bestDiff) { bestDiff = diff; best = c; }
  }

  // offset = selisih hari antara JD tanggal manual sebenarnya vs JD hasil algoritma auto
  // pada tanggal Masehi yang sama
  const manualActualJD = gregorianToJD(best.date);
  const autoHijriOnManualDate = toHijriAuto(best.date);
  const autoJDForThatDate = hijriToJD(autoHijriOnManualDate.year, autoHijriOnManualDate.month, autoHijriOnManualDate.day);
  return Math.round(manualActualJD - autoJDForThatDate);
}

/**
 * API utama: dapatkan tanggal Hijriyah untuk tanggal Masehi tertentu,
 * dengan mempertimbangkan pengaturan (auto/manual).
 */
function getHijriDate(gregorianDate, settings) {
  const offset = getManualOffset(settings, gregorianDate);
  const jd = gregorianToJD(gregorianDate) + offset;
  const h = jdToHijri(jd);
  return {
    year: h.year,
    month: h.month,
    day: h.day,
    monthName: HIJRI_MONTHS[h.month - 1],
    label: `${h.day} ${HIJRI_MONTHS[h.month - 1]} ${h.year}H`
  };
}

/**
 * Cari tanggal Masehi untuk tanggal Hijriyah tertentu (dipakai untuk menghitung
 * hari besar Islam di tahun berjalan), dengan offset manual.
 */
function hijriToGregorian(hijriYear, hijriMonth, hijriDay, settings, referenceGregorianDate) {
  const offset = getManualOffset(settings, referenceGregorianDate || dayjs());
  const jd = hijriToJD(hijriYear, hijriMonth, hijriDay) - offset;
  return jdToGregorian(jd);
}

window.HijriService = {
  HIJRI_MONTHS,
  getHijriDate,
  hijriToGregorian,
  toHijriAuto
};
