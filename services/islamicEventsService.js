// services/islamicEventsService.js
// Menentukan Hari Besar Islam & penanda puasa sunnah untuk rentang tanggal Masehi tertentu,
// mengikuti pengaturan kalender Hijriyah (auto/manual).

// Definisi hari besar: { month, day, name }, mengacu bulan Hijriyah (1-12)
const ISLAMIC_HOLIDAYS = [
  { month: 1, day: 1, name: 'Tahun Baru Hijriyah' },
  { month: 7, day: 27, name: "Isra Mi'raj" },
  { month: 3, day: 12, name: 'Maulid Nabi' },
  { month: 8, day: 15, name: "Nisfu Sya'ban" },
  { month: 9, day: 1, name: 'Awal Ramadhan' },
  { month: 9, day: 17, name: "Nuzulul Qur'an" },
  { month: 10, day: 1, name: 'Idul Fitri' },
  { month: 12, day: 9, name: 'Hari Arafah' },
  { month: 12, day: 10, name: 'Idul Adha' },
  { month: 12, day: 11, name: 'Tasyrik (1)' },
  { month: 12, day: 12, name: 'Tasyrik (2)' },
  { month: 12, day: 13, name: 'Tasyrik (3)' }
];

/**
 * Dapatkan seluruh hari besar Islam yang jatuh dalam rentang tanggal Masehi tertentu.
 */
function getHolidaysInRange(rangeStart, rangeEnd, settings) {
  const results = [];
  const start = dayjs(rangeStart);
  const end = dayjs(rangeEnd);
  // perkirakan rentang tahun Hijriyah yang perlu dicek
  const hStart = HijriService.getHijriDate(start, settings).year - 1;
  const hEnd = HijriService.getHijriDate(end, settings).year + 1;

  for (let y = hStart; y <= hEnd; y++) {
    ISLAMIC_HOLIDAYS.forEach(h => {
      const g = HijriService.hijriToGregorian(y, h.month, h.day, settings, start);
      if (!g.isBefore(start, 'day') && !g.isAfter(end, 'day')) {
        results.push({ date: g.format('YYYY-MM-DD'), name: h.name });
      }
    });
  }
  return results;
}

/**
 * Tentukan tanggal Ayyamul Bidh (13,14,15 tiap bulan Hijriyah) dalam rentang.
 */
function getAyyamulBidhInRange(rangeStart, rangeEnd, settings) {
  const results = [];
  let cur = dayjs(rangeStart);
  const end = dayjs(rangeEnd);
  while (!cur.isAfter(end, 'day')) {
    const h = HijriService.getHijriDate(cur, settings);
    if ([13, 14, 15].includes(h.day)) {
      results.push({ date: cur.format('YYYY-MM-DD'), name: 'Ayyamul Bidh' });
    }
    cur = cur.add(1, 'day');
  }
  return results;
}

/**
 * Puasa sunnah harian (Senin/Kamis) + hari-hari khusus (Arafah, Asyura, Tasu'a).
 */
function getSunnahFastingInRange(rangeStart, rangeEnd, settings) {
  const enabled = settings?.sunnahFastingEnabled || {};
  const results = [];
  let cur = dayjs(rangeStart);
  const end = dayjs(rangeEnd);

  while (!cur.isAfter(end, 'day')) {
    const dow = cur.day(); // 0=Minggu, 1=Senin, 4=Kamis
    if (enabled.senin !== false && dow === 1) results.push({ date: cur.format('YYYY-MM-DD'), name: 'Puasa Senin' });
    if (enabled.kamis !== false && dow === 4) results.push({ date: cur.format('YYYY-MM-DD'), name: 'Puasa Kamis' });

    const h = HijriService.getHijriDate(cur, settings);
    if (enabled.asyura !== false && h.month === 1 && h.day === 10) results.push({ date: cur.format('YYYY-MM-DD'), name: 'Puasa Asyura' });
    if (enabled.tasua !== false && h.month === 1 && h.day === 9) results.push({ date: cur.format('YYYY-MM-DD'), name: "Puasa Tasu'a" });
    if (enabled.arafah !== false && h.month === 12 && h.day === 9) results.push({ date: cur.format('YYYY-MM-DD'), name: 'Puasa Arafah' });

    cur = cur.add(1, 'day');
  }

  if (enabled.ayyamulBidh !== false) {
    results.push(...getAyyamulBidhInRange(rangeStart, rangeEnd, settings));
  }

  return results;
}

window.IslamicEventsService = {
  ISLAMIC_HOLIDAYS,
  getHolidaysInRange,
  getSunnahFastingInRange
};
