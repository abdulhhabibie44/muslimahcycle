// services/qadhaService.js
// Menghitung utang puasa Ramadhan berdasarkan hari haid yang jatuh pada bulan
// Ramadhan (menurut pengaturan kalender Hijriyah aktif) DITAMBAH input manual
// (untuk mencatat utang dari sebelum memakai aplikasi), lalu melacak progres
// pembayaran (qadha).

/**
 * Hitung jumlah hari haid yang jatuh pada bulan Ramadhan untuk tahun Hijriyah tertentu.
 */
function countRamadhanPeriodDays(cycles, hijriYear, settings) {
  let count = 0;
  const sorted = CycleService.sortCycles(cycles);
  sorted.forEach(c => {
    const start = dayjs(c.startDate);
    const end = c.endDate ? dayjs(c.endDate) : start;
    let cur = start;
    while (!cur.isAfter(end, 'day')) {
      const h = HijriService.getHijriDate(cur, settings);
      if (h.month === 9 && h.year === hijriYear) count++;
      cur = cur.add(1, 'day');
    }
  });
  return count;
}

/**
 * Total hari utang yang diinput manual untuk tahun Hijriyah tertentu.
 */
async function getManualDebtForYear(hijriYear) {
  const entries = await db.qadha_manual.where('hijriYear').equals(hijriYear).toArray();
  return entries.reduce((sum, e) => sum + e.amount, 0);
}

/**
 * Pastikan record `qadha` untuk tahun Hijriyah tertentu ada & totalDebt-nya
 * sinkron dengan (hari haid otomatis + input manual) tahun tsb.
 */
async function syncQadhaForYear(hijriYear, cycles, settings) {
  const autoDebt = countRamadhanPeriodDays(cycles, hijriYear, settings);
  const manualDebt = await getManualDebtForYear(hijriYear);
  const totalDebt = autoDebt + manualDebt;

  let record = await db.qadha.where('hijriYear').equals(hijriYear).first();
  if (!record) {
    if (totalDebt === 0) return null;
    const id = await db.qadha.add({ hijriYear, totalDebt, createdAt: new Date().toISOString() });
    record = await db.qadha.get(id);
  } else if (record.totalDebt !== totalDebt) {
    await db.qadha.update(record.id, { totalDebt });
    record.totalDebt = totalDebt;
  }
  return record;
}

/**
 * Sinkronkan seluruh tahun Hijriyah yang punya hari haid di bulan Ramadhan
 * ATAU punya input utang manual.
 */
async function syncAllQadha(cycles, settings) {
  const years = new Set();

  cycles.forEach(c => {
    const start = dayjs(c.startDate);
    const end = c.endDate ? dayjs(c.endDate) : start;
    let cur = start;
    while (!cur.isAfter(end, 'day')) {
      const h = HijriService.getHijriDate(cur, settings);
      if (h.month === 9) years.add(h.year);
      cur = cur.add(1, 'day');
    }
  });

  const manualEntries = await db.qadha_manual.toArray();
  manualEntries.forEach(e => years.add(e.hijriYear));

  const results = [];
  for (const y of years) {
    const r = await syncQadhaForYear(y, cycles, settings);
    if (r) results.push(r);
  }
  return results;
}

/**
 * Ringkasan total utang, sudah dibayar, dan sisa untuk semua tahun (atau satu tahun).
 */
async function getQadhaSummary(hijriYear = null) {
  const records = hijriYear
    ? await db.qadha.where('hijriYear').equals(hijriYear).toArray()
    : await db.qadha.toArray();

  let totalDebt = 0, totalPaid = 0;
  const details = [];

  for (const r of records) {
    const history = await db.qadha_history.where('qadhaId').equals(r.id).toArray();
    const manualEntries = await db.qadha_manual.where('hijriYear').equals(r.hijriYear).toArray();
    const paid = history.reduce((sum, h) => sum + h.amount, 0);
    totalDebt += r.totalDebt;
    totalPaid += paid;
    details.push({ ...r, paid, remaining: r.totalDebt - paid, history, manualEntries });
  }

  return {
    totalDebt,
    totalPaid,
    remaining: totalDebt - totalPaid,
    progress: totalDebt > 0 ? Math.round((totalPaid / totalDebt) * 100) : 0,
    details
  };
}

/**
 * Catat pembayaran qadha baru. amount tidak boleh melebihi sisa utang keseluruhan.
 */
async function payQadha({ date, amount, note }) {
  const summary = await getQadhaSummary();
  // alokasikan pembayaran ke record qadha tertua yang masih ada sisa (FIFO)
  let remainingToAllocate = amount;
  const sortedDetails = [...summary.details].sort((a, b) => a.hijriYear - b.hijriYear);
  for (const d of sortedDetails) {
    if (remainingToAllocate <= 0) break;
    if (d.remaining <= 0) continue;
    const alloc = Math.min(d.remaining, remainingToAllocate);
    await db.qadha_history.add({
      qadhaId: d.id,
      date,
      amount: alloc,
      note: note || '',
      createdAt: new Date().toISOString()
    });
    remainingToAllocate -= alloc;
  }
  return await getQadhaSummary();
}

/**
 * Tambah utang puasa secara manual untuk tahun Hijriyah tertentu (mis. utang
 * dari sebelum mulai memakai aplikasi, atau koreksi di luar hitungan otomatis).
 * cycles & settings dibutuhkan untuk langsung mensinkronkan ulang record qadha.
 */
async function addManualQadha({ hijriYear, amount, date, note }, cycles, settings) {
  if (!hijriYear || !amount || amount <= 0) {
    throw new Error('Tahun Hijriyah dan jumlah hari harus diisi dengan benar.');
  }
  await db.qadha_manual.add({
    hijriYear: Number(hijriYear),
    amount: Number(amount),
    date: date || new Date().toISOString().slice(0, 10),
    note: note || '',
    createdAt: new Date().toISOString()
  });
  await syncQadhaForYear(Number(hijriYear), cycles, settings);
  return await getQadhaSummary();
}

/**
 * Hapus satu entri utang manual, lalu sinkronkan ulang totalDebt tahun terkait.
 */
async function deleteManualQadha(id, cycles, settings) {
  const entry = await db.qadha_manual.get(id);
  await db.qadha_manual.delete(id);
  if (entry) await syncQadhaForYear(entry.hijriYear, cycles, settings);
  return await getQadhaSummary();
}

window.QadhaService = {
  countRamadhanPeriodDays,
  getManualDebtForYear,
  syncQadhaForYear,
  syncAllQadha,
  getQadhaSummary,
  payQadha,
  addManualQadha,
  deleteManualQadha
};
