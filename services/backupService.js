// services/backupService.js
// Ekspor/impor seluruh data aplikasi ke JSON, dan ekspor ringkas ke CSV.

async function exportAllData() {
  const [cycle, symptoms, notes, qadha, qadha_history, qadha_manual, settingsRow, notifications] = await Promise.all([
    db.cycle.toArray(),
    db.symptoms.toArray(),
    db.notes.toArray(),
    db.qadha.toArray(),
    db.qadha_history.toArray(),
    db.qadha_manual.toArray(),
    db.settings.toArray(),
    db.notifications.toArray()
  ]);
  return {
    exportedAt: new Date().toISOString(),
    version: 2,
    data: { cycle, symptoms, notes, qadha, qadha_history, qadha_manual, settings: settingsRow, notifications }
  };
}

function downloadFile(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function exportJSON() {
  const payload = await exportAllData();
  downloadFile(`muslimah-cycle-backup-${dayjs().format('YYYYMMDD-HHmm')}.json`, JSON.stringify(payload, null, 2), 'application/json');
}

async function exportCSV() {
  const cycles = await db.cycle.toArray();
  const header = ['Tanggal Mulai', 'Tanggal Selesai', 'Lama Haid (hari)', 'Intensitas', 'Warna Darah', 'Ada Flek', 'Catatan'];
  const rows = cycles.map(c => {
    const len = c.endDate ? (dayjs(c.endDate).diff(dayjs(c.startDate), 'day') + 1) : '';
    return [c.startDate, c.endDate || '', len, c.intensity || '', c.bloodColor || '', c.hasSpotting ? 'Ya' : 'Tidak', (c.note || '').replace(/[\n,]/g, ' ')];
  });
  const csv = [header, ...rows].map(r => r.map(v => `"${v}"`).join(',')).join('\n');
  downloadFile(`muslimah-cycle-riwayat-${dayjs().format('YYYYMMDD-HHmm')}.csv`, csv, 'text/csv');
}

/**
 * Impor dari file JSON hasil ekspor sebelumnya. Mode: 'replace' (hapus semua data lama)
 * atau 'merge' (tambahkan sebagai data baru, id akan dibuat ulang otomatis).
 */
async function importJSON(fileContent, mode = 'replace') {
  const parsed = JSON.parse(fileContent);
  const d = parsed.data || parsed; // toleransi format lama

  await db.transaction('rw', db.cycle, db.symptoms, db.notes, db.qadha, db.qadha_history, db.qadha_manual, db.settings, db.notifications, async () => {
    if (mode === 'replace') {
      await Promise.all([
        db.cycle.clear(), db.symptoms.clear(), db.notes.clear(),
        db.qadha.clear(), db.qadha_history.clear(), db.qadha_manual.clear(), db.notifications.clear()
      ]);
    }
    const stripId = (arr) => arr.map(({ id, ...rest }) => rest);
    if (d.cycle) await db.cycle.bulkAdd(stripId(d.cycle));
    if (d.symptoms) await db.symptoms.bulkAdd(stripId(d.symptoms));
    if (d.notes) await db.notes.bulkAdd(stripId(d.notes));

    // qadha & qadha_history perlu remap id lama -> id baru agar relasi tetap benar
    const idMap = {};
    if (d.qadha) {
      for (const q of d.qadha) {
        const { id, ...rest } = q;
        const newId = await db.qadha.add(rest);
        idMap[id] = newId;
      }
    }
    if (d.qadha_history) {
      for (const h of d.qadha_history) {
        const { id, qadhaId, ...rest } = h;
        await db.qadha_history.add({ ...rest, qadhaId: idMap[qadhaId] ?? qadhaId });
      }
    }
    if (d.qadha_manual) await db.qadha_manual.bulkAdd(stripId(d.qadha_manual));
    if (d.notifications) await db.notifications.bulkAdd(stripId(d.notifications));
    if (mode === 'replace' && d.settings && d.settings.length) {
      await db.settings.clear();
      for (const s of d.settings) await db.settings.put(s);
    }
  });
}

window.BackupService = { exportAllData, exportJSON, exportCSV, importJSON };
