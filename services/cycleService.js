// services/cycleService.js
// Logika perhitungan siklus haid: lama haid, lama siklus, prediksi haid berikutnya,
// masa subur, dan hari ovulasi.

/**
 * Urutkan riwayat cycle berdasarkan startDate menaik.
 */
function sortCycles(cycles) {
  return [...cycles].sort((a, b) => dayjs(a.startDate).diff(dayjs(b.startDate)));
}

/**
 * Hitung rata-rata panjang siklus (jarak antar startDate) dari riwayat.
 * Fallback ke nilai default pengaturan bila data belum cukup (< 2 siklus).
 */
function getAverageCycleLength(cycles, fallback = 28) {
  const sorted = sortCycles(cycles);
  if (sorted.length < 2) return fallback;
  const diffs = [];
  for (let i = 1; i < sorted.length; i++) {
    diffs.push(dayjs(sorted[i].startDate).diff(dayjs(sorted[i - 1].startDate), 'day'));
  }
  const recent = diffs.slice(-6); // pakai 6 siklus terakhir agar prediksi lebih relevan
  return Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
}

/**
 * Hitung rata-rata lama haid dari riwayat (hanya cycle yang sudah memiliki endDate).
 */
function getAveragePeriodLength(cycles, fallback = 6) {
  const withEnd = cycles.filter(c => c.endDate);
  if (withEnd.length === 0) return fallback;
  const lengths = withEnd.map(c => dayjs(c.endDate).diff(dayjs(c.startDate), 'day') + 1);
  const recent = lengths.slice(-6);
  return Math.round(recent.reduce((a, b) => a + b, 0) / recent.length);
}

/**
 * Dapatkan cycle paling akhir (terbaru).
 */
function getLatestCycle(cycles) {
  const sorted = sortCycles(cycles);
  return sorted[sorted.length - 1] || null;
}

/**
 * Hitung hari siklus saat ini (hari ke-berapa sejak haid terakhir mulai).
 */
function getCurrentCycleDay(cycles, today = dayjs()) {
  const latest = getLatestCycle(cycles);
  if (!latest) return null;
  return today.diff(dayjs(latest.startDate), 'day') + 1;
}

/**
 * Prediksi tanggal mulai haid berikutnya.
 */
function predictNextPeriod(cycles, settings) {
  const latest = getLatestCycle(cycles);
  if (!latest) return null;
  const avgLen = getAverageCycleLength(cycles, settings?.avgCycleLength || 28);
  return dayjs(latest.startDate).add(avgLen, 'day');
}

/**
 * Prediksi masa subur & hari ovulasi.
 * Ovulasi diperkirakan 14 hari sebelum haid berikutnya dimulai.
 * Masa subur: 5 hari sebelum ovulasi s/d 1 hari sesudah ovulasi.
 */
function predictFertileWindow(cycles, settings) {
  const nextPeriod = predictNextPeriod(cycles, settings);
  if (!nextPeriod) return null;
  const ovulation = nextPeriod.subtract(14, 'day');
  const fertileStart = ovulation.subtract(5, 'day');
  const fertileEnd = ovulation.add(1, 'day');
  return { ovulation, fertileStart, fertileEnd };
}

/**
 * Tentukan status hari ini: 'haid' | 'subur' | 'ovulasi' | 'normal'
 */
function getTodayStatus(cycles, settings, today = dayjs()) {
  const MAX_ONGOING_DAYS = 14; // batas wajar kalau tanggal selesai belum diisi, supaya tidak "nyangkut" selamanya

  const latest = getLatestCycle(cycles);
  if (latest) {
    const start = dayjs(latest.startDate);
    if (latest.endDate) {
      const end = dayjs(latest.endDate);
      if (!today.isBefore(start, 'day') && !today.isAfter(end, 'day')) return 'haid';
    } else if (!today.isBefore(start, 'day') && today.diff(start, 'day') < MAX_ONGOING_DAYS) {
      // Belum ada tanggal selesai -> anggap masih berlangsung, jangan menebak sudah selesai
      // hanya berdasarkan rata-rata lama haid.
      return 'haid';
    }
  }
  const fertile = predictFertileWindow(cycles, settings);
  if (fertile) {
    if (today.isSame(fertile.ovulation, 'day')) return 'ovulasi';
    if (!today.isBefore(fertile.fertileStart, 'day') && !today.isAfter(fertile.fertileEnd, 'day')) return 'subur';
  }
  return 'normal';
}

/**
 * Bangun peta status kalender untuk rentang tanggal (dipakai FullCalendar).
 * Mengembalikan array event: { date, type, cycleId? }
 */
function buildCalendarEvents(cycles, rangeStart, rangeEnd, settings) {
  const events = [];
  const sorted = sortCycles(cycles);

  // Hari haid aktual (dari data yang sudah dicatat)
  const MAX_ONGOING_DAYS = 14;
  sorted.forEach(c => {
    const start = dayjs(c.startDate);
    let end;
    if (c.endDate) {
      end = dayjs(c.endDate);
    } else {
      // Belum ditutup -> tandai sampai hari ini (dibatasi wajar) sebagai estimasi masih berlangsung
      const cappedEnd = start.add(MAX_ONGOING_DAYS - 1, 'day');
      const today = dayjs();
      end = today.isBefore(cappedEnd) ? today : cappedEnd;
    }
    let cur = start;
    while (!cur.isAfter(end, 'day')) {
      events.push({ date: cur.format('YYYY-MM-DD'), type: 'haid', cycleId: c.id });
      cur = cur.add(1, 'day');
    }
  });

  // Prediksi haid berikutnya (beberapa siklus ke depan dalam rentang kalender)
  const avgLen = getAverageCycleLength(cycles, settings?.avgCycleLength || 28);
  const avgPeriod = getAveragePeriodLength(cycles, settings?.avgPeriodLength || 6);
  const latest = getLatestCycle(cycles);
  if (latest) {
    let cursorStart = dayjs(latest.startDate).add(avgLen, 'day');
    let guard = 0;
    // Loop dilanjutkan selama masa subur (14 hari SEBELUM prediksi haid) masih
    // mungkin masuk rentang tampilan, bukan cuma cek tanggal prediksi haidnya saja --
    // supaya titik masa subur/ovulasi tidak hilang saat prediksi haidnya sendiri
    // sudah di luar bulan yang sedang dilihat.
    while (cursorStart.subtract(21, 'day').isBefore(dayjs(rangeEnd)) && guard < 24) {
      const cursorEnd = cursorStart.add(avgPeriod - 1, 'day');
      let cur = cursorStart;
      while (!cur.isAfter(cursorEnd, 'day')) {
        if (!cur.isBefore(dayjs(rangeStart)) && !cur.isAfter(dayjs(rangeEnd))) {
          events.push({ date: cur.format('YYYY-MM-DD'), type: 'prediksi_haid' });
        }
        cur = cur.add(1, 'day');
      }
      // masa subur & ovulasi untuk siklus prediksi ini
      const ovulation = cursorStart.subtract(14, 'day');
      const fertileStart = ovulation.subtract(5, 'day');
      const fertileEnd = ovulation.add(1, 'day');
      let fc = fertileStart;
      while (!fc.isAfter(fertileEnd, 'day')) {
        if (!fc.isBefore(dayjs(rangeStart)) && !fc.isAfter(dayjs(rangeEnd))) {
          events.push({ date: fc.format('YYYY-MM-DD'), type: fc.isSame(ovulation, 'day') ? 'ovulasi' : 'subur' });
        }
        fc = fc.add(1, 'day');
      }
      cursorStart = cursorStart.add(avgLen, 'day');
      guard++;
    }
  }

  return events;
}

window.CycleService = {
  sortCycles,
  getAverageCycleLength,
  getAveragePeriodLength,
  getLatestCycle,
  getCurrentCycleDay,
  predictNextPeriod,
  predictFertileWindow,
  getTodayStatus,
  buildCalendarEvents
};
