// app.js
// Titik masuk utama aplikasi. Mendaftarkan Alpine.data('app', ...) yang menjadi
// state & controller seluruh halaman (SPA sederhana tanpa router, berbasis x-show).

document.addEventListener('alpine:init', () => {
  Alpine.data('app', () => ({
    // ---------- STATE UMUM ----------
    page: 'dashboard',
    ready: false,
    settings: null,
    cycles: [],
    calendarInstance: null,
    modalOpen: false,
    modalDate: null,
    modalData: null,
    toast: null,

    // Modal harian "apakah hari ini masih haid?"
    periodCheckModalOpen: false,
    periodCheckStep: 'ask', // 'ask' | 'confirm-end'
    periodCheckCycleId: null,
    periodEndDateInput: '',

    // Modal pengingat/saran dalam aplikasi (pengganti notifikasi sistem)
    inAppAlertOpen: false,
    inAppAlertData: null,

    // form states
    cycleForm: { id: null, startDate: dayjs().format('YYYY-MM-DD'), endDate: '', intensity: 'sedang', bloodColor: 'merah_terang', hasSpotting: false, note: '' },
    symptomForm: { date: dayjs().format('YYYY-MM-DD'), symptomList: [], mood: null },
    noteForm: { date: dayjs().format('YYYY-MM-DD'), text: '' },
    qadhaPayForm: { date: dayjs().format('YYYY-MM-DD'), amount: 1, note: '' },
    manualQadhaForm: { hijriYear: null, amount: 1, date: dayjs().format('YYYY-MM-DD'), note: '' },
    manualHijriForm: { ramadhanStart: '', syawalStart: '', zulhijahStart: '' },

    qadhaSummary: { totalDebt: 0, totalPaid: 0, remaining: 0, progress: 0, details: [] },

    C: window.APP_CONSTANTS,

    // ---------- INIT ----------
    async init() {
      this.settings = await initSettings();
      ThemeUtil.applyTheme(this.settings.theme);
      ThemeUtil.applyFontSize(this.settings.fontSize);
      ThemeUtil.watchSystemTheme(() => this.settings.theme);

      await this.loadCycles();
      await this.refreshQadha();
      await this.checkSmartQadhaSuggestion();
      this.checkPeriodStatusPrompt();

      this.manualQadhaForm.hijriYear = HijriService.getHijriDate(dayjs(), this.settings).year;

      lucide.createIcons();
      this.ready = true;

      this.$watch('page', () => {
        this.$nextTick(() => {
          lucide.createIcons();
          if (this.page === 'kalender') this.renderCalendar();
          if (this.page === 'statistik') this.renderCharts();
          if (this.page === 'dashboard') this.renderMiniChart();
        });
      });
    },

    async loadCycles() {
      this.cycles = await db.cycle.orderBy('startDate').toArray();
    },

    showToast(msg) {
      this.toast = msg;
      setTimeout(() => { this.toast = null; }, 2500);
    },

    goto(p) { this.page = p; },

    // ---------- DASHBOARD COMPUTED ----------
    get currentCycleDay() { return CycleService.getCurrentCycleDay(this.cycles) ?? '-'; },
    get hasOpenPeriod() {
      const latest = CycleService.getLatestCycle(this.cycles);
      return !!(latest && !latest.endDate);
    },
    get nextPeriod() {
      const p = CycleService.predictNextPeriod(this.cycles, this.settings);
      return p ? p : null;
    },
    get daysUntilNextPeriod() {
      const p = this.nextPeriod;
      if (!p) return null;
      return p.startOf('day').diff(dayjs().startOf('day'), 'day');
    },
    get fertileWindow() { return CycleService.predictFertileWindow(this.cycles, this.settings); },
    get todayStatus() { return CycleService.getTodayStatus(this.cycles, this.settings); },
    get todayHijri() { return HijriService.getHijriDate(dayjs(), this.settings); },
    get todayGregorian() { return FormatUtil.formatIndoDate(dayjs()); },
    get statusLabel() {
      const map = { haid: 'Sedang Haid', subur: 'Masa Subur', ovulasi: 'Hari Ovulasi', normal: 'Hari Biasa' };
      return map[this.todayStatus];
    },

    get monthSummary() {
      const start = dayjs().startOf('month');
      const end = dayjs().endOf('month');
      // Hitung berapa KALI siklus haid dimulai pada bulan berjalan (bukan jumlah harinya)
      const occurrences = this.cycles.filter(c => {
        const s = dayjs(c.startDate);
        return !s.isBefore(start) && !s.isAfter(end);
      }).length;
      return { occurrences };
    },

    renderMiniChart() {
      const el = document.getElementById('chartMini');
      if (!el) return;
      const existing = Chart.getChart(el) || el._chart;
      if (existing) existing.destroy();
      const sorted = CycleService.sortCycles(this.cycles);
      const labels = sorted.map(c => dayjs(c.startDate).format('MMM'));
      const lengths = sorted.map((c, i) => i > 0 ? dayjs(c.startDate).diff(dayjs(sorted[i - 1].startDate), 'day') : null);
      el._chart = new Chart(el, {
        type: 'line',
        data: { labels, datasets: [{ data: lengths, borderColor: '#059669', backgroundColor: '#05966922', fill: true, tension: 0.35, pointRadius: 3 }] },
        options: { plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { display: false } } }
      });
    },

    async refreshQadha() {
      await QadhaService.syncAllQadha(this.cycles, this.settings);
      this.qadhaSummary = await QadhaService.getQadhaSummary();
    },

    /**
     * Cek sekali per hari (saat aplikasi dibuka): kalau besok adalah hari puasa
     * sunnah DAN masih ada sisa utang qadha, tampilkan modal saran untuk
     * niat puasa qadha sekaligus. Tidak perlu dipanggil manual.
     * Pakai modal dalam-aplikasi (bukan notifikasi sistem) supaya pasti jalan
     * di semua platform (PWA, TWA, maupun wrapper WebView seperti Median).
     */
    async checkSmartQadhaSuggestion() {
      if (this.settings.smartQadhaReminder === false) return;

      const todayStr = dayjs().format('YYYY-MM-DD');
      if (this.settings.lastSmartQadhaCheck === todayStr) return; // sudah ditampilkan hari ini

      if (this.qadhaSummary.remaining <= 0) return; // belum ada utang -> jangan kunci, coba lagi nanti kalau data berubah

      const tomorrowStr = dayjs().add(1, 'day').format('YYYY-MM-DD');
      const sunnahTomorrow = IslamicEventsService.getSunnahFastingInRange(tomorrowStr, tomorrowStr, this.settings);
      if (sunnahTomorrow.length === 0) return; // besok bukan hari puasa sunnah -> jangan kunci juga

      const names = [...new Set(sunnahTomorrow.map(s => s.name))].join(' & ');

      this.showInAppAlert({
        icon: 'moon-star',
        title: 'Saran Puasa Qadha',
        message: `Besok ${names}. Kamu masih punya utang puasa ${this.qadhaSummary.remaining} hari — yuk niatkan qadha sekalian puasa sunnah ya!`,
        actionLabel: 'Lihat Ibadah',
        actionPage: 'ibadah'
      });

      // Kunci HANYA setelah modal benar-benar berhasil ditampilkan
      this.settings = await updateSettings({ lastSmartQadhaCheck: todayStr });
    },

    /**
     * Modal generik untuk pengingat/saran dalam aplikasi (pengganti notifikasi sistem).
     */
    showInAppAlert({ icon = 'bell', title, message, actionLabel = null, actionPage = null }) {
      this.inAppAlertData = { icon, title, message, actionLabel, actionPage };
      this.inAppAlertOpen = true;
      this.$nextTick(() => lucide.createIcons());
    },
    closeInAppAlert() {
      this.inAppAlertOpen = false;
    },
    onInAppAlertAction() {
      const page = this.inAppAlertData?.actionPage;
      this.inAppAlertOpen = false;
      if (page) this.goto(page);
    },

    /**
     * Cek sekali per hari (saat app dibuka): kalau ada catatan haid yang masih
     * terbuka (belum ada tanggal selesai) dan statusnya masih dianggap 'haid',
     * tampilkan modal untuk konfirmasi apakah hari ini masih haid.
     */
    checkPeriodStatusPrompt() {
      const todayStr = dayjs().format('YYYY-MM-DD');
      if (this.settings.lastPeriodCheckDate === todayStr) return; // sudah ditanya hari ini

      const latest = CycleService.getLatestCycle(this.cycles);
      if (!latest || latest.endDate) return; // tidak ada catatan haid yang masih terbuka

      const start = dayjs(latest.startDate);
      if (dayjs().isBefore(start, 'day')) return;

      if (CycleService.getTodayStatus(this.cycles, this.settings) !== 'haid') return;

      this.periodCheckCycleId = latest.id;
      this.periodEndDateInput = dayjs().subtract(1, 'day').format('YYYY-MM-DD');
      this.periodCheckStep = 'ask';
      this.periodCheckModalOpen = true;
    },

    /**
     * Shortcut dari beranda: langsung buka modal di step "isi tanggal selesai",
     * tanpa perlu menunggu popup harian atau masuk ke menu Catat Haid.
     */
    openEndPeriodShortcut() {
      const latest = CycleService.getLatestCycle(this.cycles);
      if (!latest) return;
      this.periodCheckCycleId = latest.id;
      this.periodEndDateInput = dayjs().format('YYYY-MM-DD'); // default hari ini, karena ini aksi manual eksplisit
      this.periodCheckStep = 'confirm-end';
      this.periodCheckModalOpen = true;
    },

    async confirmStillPeriod() {
      this.periodCheckModalOpen = false;
      this.settings = await updateSettings({ lastPeriodCheckDate: dayjs().format('YYYY-MM-DD') });
    },

    showPeriodEndDateStep() {
      this.periodCheckStep = 'confirm-end';
    },

    async confirmPeriodEnded() {
      if (!this.periodEndDateInput || !this.periodCheckCycleId) return;
      await db.cycle.update(this.periodCheckCycleId, { endDate: this.periodEndDateInput });
      await this.loadCycles();
      await this.refreshQadha();
      this.periodCheckModalOpen = false;
      this.settings = await updateSettings({ lastPeriodCheckDate: dayjs().format('YYYY-MM-DD') });
      this.showToast('Tanggal selesai haid disimpan');
    },

    async closePeriodCheckModal() {
      this.periodCheckModalOpen = false;
      // Tetap kunci untuk hari ini walau ditutup tanpa dijawab, supaya tidak muncul berulang
      this.settings = await updateSettings({ lastPeriodCheckDate: dayjs().format('YYYY-MM-DD') });
    },

    async toggleSmartQadhaReminder() {
      this.settings = await updateSettings({ smartQadhaReminder: !this.settings.smartQadhaReminder });
    },

    // Tes: paksa cek ulang saran qadha SEKARANG pakai data yang sudah ada (bukan nunggu besok/reload)
    async recheckQadhaSuggestionNow() {
      // hapus kunci "sudah dicek hari ini" supaya pengecekan dipaksa jalan lagi
      this.settings = await updateSettings({ lastSmartQadhaCheck: null });
      await this.refreshQadha();
      await this.checkSmartQadhaSuggestion();

      if (this.settings.lastSmartQadhaCheck === dayjs().format('YYYY-MM-DD')) {
        // modal sudah tampil lewat showInAppAlert(), tidak perlu toast tambahan
      } else if (this.qadhaSummary.remaining <= 0) {
        this.showToast('Belum ada sisa utang qadha, modal tidak ditampilkan');
      } else {
        this.showToast('Besok bukan hari puasa sunnah, modal tidak ditampilkan');
      }
    },

    // ---------- CATAT HAID ----------
    async saveCycleForm() {
      const payload = { ...this.cycleForm };
      if (!payload.endDate) delete payload.endDate;
      if (payload.id) {
        const id = payload.id; delete payload.id;
        await db.cycle.update(id, payload);
      } else {
        delete payload.id;
        payload.createdAt = new Date().toISOString();
        await db.cycle.add(payload);
      }
      await this.loadCycles();
      await this.refreshQadha();
      await this.checkSmartQadhaSuggestion();
      this.resetCycleForm();
      this.showToast('Data haid tersimpan');
      this.goto('dashboard');
    },
    resetCycleForm() {
      this.cycleForm = { id: null, startDate: dayjs().format('YYYY-MM-DD'), endDate: '', intensity: 'sedang', bloodColor: 'merah_terang', hasSpotting: false, note: '' };
    },
    editCycle(c) {
      this.cycleForm = { id: c.id, startDate: c.startDate, endDate: c.endDate || '', intensity: c.intensity, bloodColor: c.bloodColor, hasSpotting: !!c.hasSpotting, note: c.note || '' };
      this.goto('catat-haid');
    },
    async deleteCycle(id) {
      await db.cycle.delete(id);
      await this.loadCycles();
      await this.refreshQadha();
      this.showToast('Data dihapus');
    },

    // ---------- GEJALA & MOOD ----------
    toggleSymptom(id) {
      const i = this.symptomForm.symptomList.indexOf(id);
      if (i >= 0) this.symptomForm.symptomList.splice(i, 1); else this.symptomForm.symptomList.push(id);
    },
    /**
     * Dipanggil tiap kali tanggal di form Gejala berubah (termasuk saat halaman
     * pertama dibuka). Kalau tanggal itu sudah punya catatan, form diisi ulang
     * dengan data yang ada; kalau belum, form dikosongkan (tidak menyisakan
     * centang/mood dari tanggal sebelumnya).
     */
    async loadSymptomForDate() {
      const existing = await db.symptoms.where('date').equals(this.symptomForm.date).first();
      if (existing) {
        this.symptomForm.symptomList = [...existing.symptomList];
        this.symptomForm.mood = existing.mood;
      } else {
        this.symptomForm.symptomList = [];
        this.symptomForm.mood = null;
      }
    },
    async saveSymptomForm() {
      try {
        // Alpine.js membungkus array/objek reaktif dengan Proxy -- IndexedDB tidak
        // bisa menyimpan Proxy langsung (DataCloneError), jadi ubah dulu jadi array polos.
        const plainSymptomList = JSON.parse(JSON.stringify(this.symptomForm.symptomList));

        const existing = await db.symptoms.where('date').equals(this.symptomForm.date).first();
        if (existing) {
          await db.symptoms.update(existing.id, { symptomList: plainSymptomList, mood: this.symptomForm.mood });
        } else {
          await db.symptoms.add({
            date: this.symptomForm.date,
            symptomList: plainSymptomList,
            mood: this.symptomForm.mood,
            createdAt: new Date().toISOString()
          });
        }
        this.showToast('Gejala & mood tersimpan');
      } catch (e) {
        console.error('Gagal menyimpan gejala:', e);
        this.showToast('Gagal menyimpan, coba lagi');
      }
    },

    // ---------- CATATAN ----------
    async saveNote() {
      if (!this.noteForm.text.trim()) return;
      await db.notes.add({ ...this.noteForm, createdAt: new Date().toISOString() });
      this.noteForm.text = '';
      this.showToast('Catatan tersimpan');
      this.allNotes = await db.notes.orderBy('date').reverse().toArray();
    },
    allNotes: [],
    async loadNotes() { this.allNotes = await db.notes.orderBy('date').reverse().toArray(); },
    async deleteNote(id) { await db.notes.delete(id); await this.loadNotes(); },

    // ---------- KALENDER ----------
    renderCalendar() {
      const el = document.getElementById('calendarEl');
      if (!el) return;

      if (typeof FullCalendar === 'undefined') {
        el.innerHTML = '<div class="text-center text-sm opacity-60 py-10">Kalender gagal dimuat. Pastikan kamu terhubung ke internet saat pertama kali membuka aplikasi ini, lalu muat ulang halaman.</div>';
        console.error('FullCalendar library tidak ditemukan (CDN gagal dimuat).');
        return;
      }

      if (this.calendarInstance) { this.calendarInstance.destroy(); }

      const self = this;
      const shortHijriMonths = ['Muh', 'Saf', "R.Awal", "R.Akhir", 'J.Awal', 'J.Akhir', 'Rajab', "Sya'ban", 'Ramadhan', 'Syawal', "Dz.Qadah", 'Dz.Hijjah'];

      this.calendarInstance = new FullCalendar.Calendar(el, {
        initialView: 'dayGridMonth',
        height: 'auto',
        headerToolbar: { left: 'prev,next today', center: 'title', right: 'dayGridMonth,listMonth' },
        firstDay: 1,
        buttonText: { today: 'Hari ini', month: 'Bulan', list: 'Daftar' },
        dayHeaderContent(arg) {
          const names = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', "Jum", 'Sab'];
          return names[arg.date.getDay()];
        },
        noEventsText: 'Tidak ada catatan pada bulan ini',
        datesSet(arg) {
          const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
          const mid = new Date((arg.start.getTime() + arg.end.getTime()) / 2);
          const titleEl = el.querySelector('.fc-toolbar-title');
          if (titleEl) titleEl.textContent = `${months[mid.getMonth()]} ${mid.getFullYear()}`;

          // Perbaikan bug: paksa hitung ulang ukuran kalender setelah render/ganti tampilan,
          // supaya tidak "hilang" kalau sempat di-render saat container belum sepenuhnya terlihat.
          requestAnimationFrame(() => {
            try { self.calendarInstance?.updateSize(); } catch (e) { /* abaikan */ }
          });
        },
        dayCellDidMount(info) {
          try {
            const hijri = HijriService.getHijriDate(dayjs(info.date), self.settings);
            const badge = document.createElement('div');
            badge.className = 'hijri-badge';
            badge.title = hijri.label;
            badge.textContent = `${hijri.day} ${shortHijriMonths[hijri.month - 1] || ''}`;
            const frame = info.el.querySelector('.fc-daygrid-day-top') || info.el;
            frame.appendChild(badge);

            const dateStr = dayjs(info.date).format('YYYY-MM-DD');
            const dots = self.getDayMarkers(dateStr);
            if (dots.length) {
              const dotWrap = document.createElement('div');
              dotWrap.className = 'day-dots';
              dots.forEach(d => {
                const dot = document.createElement('span');
                dot.className = 'day-dot';
                dot.style.background = d.color;
                dotWrap.appendChild(dot);
              });
              (info.el.querySelector('.fc-daygrid-day-frame') || info.el).appendChild(dotWrap);
            }
            if (dayjs(info.date).isSame(dayjs(), 'day')) {
              info.el.classList.add('today-cell');
            }
          } catch (e) {
            // Jangan biarkan error di satu sel tanggal menggagalkan render kalender secara keseluruhan
            console.warn('Gagal menyusun sel kalender:', e);
          }
        },
        dateClick(info) { self.openDayModal(info.dateStr); },
        eventClick(info) { self.openDayModal(info.event.startStr); }
      });
      this.calendarInstance.render();

      // Jaga-jaga tambahan: paksa hitung ulang ukuran sesaat setelah render pertama kali
      requestAnimationFrame(() => {
        try { self.calendarInstance?.updateSize(); } catch (e) { /* abaikan */ }
      });
    },

    getDayMarkers(dateStr) {
      const markers = [];
      const cycleEvents = CycleService.buildCalendarEvents(this.cycles, dayjs(dateStr).startOf('month').subtract(7, 'day'), dayjs(dateStr).endOf('month').add(7, 'day'), this.settings);
      const legend = this.C.LEGEND;
      const isDark = document.documentElement.classList.contains('dark');
      const colorFor = (t) => {
        const item = legend.find(l => l.type === t) || {};
        return (isDark && item.colorDark) ? item.colorDark : item.color;
      };

      cycleEvents.filter(e => e.date === dateStr).forEach(e => markers.push({ color: colorFor(e.type) }));

      const holidays = IslamicEventsService.getHolidaysInRange(dateStr, dateStr, this.settings);
      if (holidays.length) markers.push({ color: colorFor('holiday') });

      const sunnah = IslamicEventsService.getSunnahFastingInRange(dateStr, dateStr, this.settings);
      if (sunnah.length) markers.push({ color: colorFor('sunnah') });

      return markers.slice(0, 4);
    },

    async openDayModal(dateStr) {
      const d = dayjs(dateStr);
      const hijri = HijriService.getHijriDate(d, this.settings);
      const cycleDay = CycleService.getLatestCycle(this.cycles) ? d.diff(dayjs(CycleService.getLatestCycle(this.cycles).startDate), 'day') + 1 : null;
      const symptomEntry = await db.symptoms.where('date').equals(dateStr).first();
      const noteEntries = await db.notes.where('date').equals(dateStr).toArray();
      const holidays = IslamicEventsService.getHolidaysInRange(dateStr, dateStr, this.settings);
      const sunnah = IslamicEventsService.getSunnahFastingInRange(dateStr, dateStr, this.settings);
      const cycleEvents = CycleService.buildCalendarEvents(this.cycles, d, d, this.settings).filter(e => e.date === dateStr);

      this.modalDate = dateStr;
      this.modalData = {
        gregorian: FormatUtil.formatIndoDate(d),
        hijri: hijri.label,
        cycleDay,
        status: cycleEvents.length ? cycleEvents.map(e => e.type).join(', ') : '-',
        symptoms: symptomEntry ? symptomEntry.symptomList.map(id => (this.C.SYMPTOMS.find(s => s.id === id) || {}).label).join(', ') : '-',
        mood: symptomEntry ? (this.C.MOODS.find(m => m.id === symptomEntry.mood) || {}).emoji : '-',
        notes: noteEntries,
        holidays,
        sunnah
      };
      this.modalOpen = true;
    },

    // ---------- STATISTIK ----------
    renderCharts() {
      this.renderCycleLengthChart();
      this.renderMoodChart();
      this.renderSymptomChart();
    },
    async renderCycleLengthChart() {
      const el = document.getElementById('chartCycleLength');
      if (!el) return;
      const existing = Chart.getChart(el) || el._chart;
      if (existing) existing.destroy();
      const sorted = CycleService.sortCycles(this.cycles);
      const labels = []; const lengths = []; const periodLengths = [];
      for (let i = 0; i < sorted.length; i++) {
        labels.push(dayjs(sorted[i].startDate).format('MMM YY'));
        if (i > 0) lengths.push(dayjs(sorted[i].startDate).diff(dayjs(sorted[i - 1].startDate), 'day'));
        else lengths.push(null);
        periodLengths.push(sorted[i].endDate ? dayjs(sorted[i].endDate).diff(dayjs(sorted[i].startDate), 'day') + 1 : null);
      }
      el._chart = new Chart(el, {
        type: 'line',
        data: { labels, datasets: [
          { label: 'Panjang Siklus (hari)', data: lengths, borderColor: '#10B981', backgroundColor: '#10B98133', tension: 0.3 },
          { label: 'Lama Haid (hari)', data: periodLengths, borderColor: '#F472B6', backgroundColor: '#F472B633', tension: 0.3 }
        ]},
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
      });
    },
    async renderMoodChart() {
      const el = document.getElementById('chartMood');
      if (!el) return;
      const existing = Chart.getChart(el) || el._chart;
      if (existing) existing.destroy();
      const symptoms = await db.symptoms.toArray();
      const counts = {};
      this.C.MOODS.forEach(m => counts[m.id] = 0);
      symptoms.forEach(s => { if (counts[s.mood] !== undefined) counts[s.mood]++; });
      el._chart = new Chart(el, {
        type: 'doughnut',
        data: {
          labels: this.C.MOODS.map(m => `${m.emoji} ${m.label}`),
          datasets: [{ data: this.C.MOODS.map(m => counts[m.id]), backgroundColor: ['#34D399', '#6EE7B7', '#FBBF24', '#F59E0B', '#F87171', '#F472B6'] }]
        },
        options: { responsive: true, plugins: { legend: { position: 'bottom' } } }
      });
    },
    async renderSymptomChart() {
      const el = document.getElementById('chartSymptom');
      if (!el) return;
      const existing = Chart.getChart(el) || el._chart;
      if (existing) existing.destroy();
      const symptoms = await db.symptoms.toArray();
      const counts = {};
      this.C.SYMPTOMS.forEach(s => counts[s.id] = 0);
      symptoms.forEach(s => (s.symptomList || []).forEach(id => { if (counts[id] !== undefined) counts[id]++; }));
      el._chart = new Chart(el, {
        type: 'bar',
        data: { labels: this.C.SYMPTOMS.map(s => s.label), datasets: [{ label: 'Frekuensi', data: this.C.SYMPTOMS.map(s => counts[s.id]), backgroundColor: '#059669' }] },
        options: { responsive: true, indexAxis: 'y', plugins: { legend: { display: false } } }
      });
    },

    // ---------- QADHA ----------
    async payQadha() {
      if (this.qadhaPayForm.amount <= 0) return;
      await QadhaService.payQadha(this.qadhaPayForm);
      this.qadhaSummary = await QadhaService.getQadhaSummary();
      this.qadhaPayForm = { date: dayjs().format('YYYY-MM-DD'), amount: 1, note: '' };
      this.showToast('Pembayaran qadha tercatat');
    },

    async addManualQadha() {
      if (!this.manualQadhaForm.hijriYear || this.manualQadhaForm.amount <= 0) {
        this.showToast('Isi tahun Hijriyah dan jumlah hari dengan benar');
        return;
      }
      try {
        this.qadhaSummary = await QadhaService.addManualQadha(this.manualQadhaForm, this.cycles, this.settings);
        await this.checkSmartQadhaSuggestion();
        this.manualQadhaForm = { hijriYear: HijriService.getHijriDate(dayjs(), this.settings).year, amount: 1, date: dayjs().format('YYYY-MM-DD'), note: '' };
        this.showToast('Utang puasa manual ditambahkan');
      } catch (e) {
        this.showToast(e.message || 'Gagal menambah utang manual');
      }
    },

    async deleteManualQadha(id) {
      this.qadhaSummary = await QadhaService.deleteManualQadha(id, this.cycles, this.settings);
      this.showToast('Input manual dihapus');
    },

    // ---------- PENGATURAN ----------
    async setTheme(t) {
      this.settings = await updateSettings({ theme: t });
      ThemeUtil.applyTheme(t);
    },
    async setFontSize(s) {
      this.settings = await updateSettings({ fontSize: s });
      ThemeUtil.applyFontSize(s);
    },
    async setHijriMode(mode) {
      this.settings = await updateSettings({ hijriMode: mode });
      await this.refreshQadha();
    },
    async saveManualHijri() {
      const merged = { ...this.settings.hijriManualDates, ...this.manualHijriForm };
      this.settings = await updateSettings({ hijriManualDates: merged });
      await this.refreshQadha();
      this.showToast('Tanggal Hijriyah manual disimpan');
    },
    async toggleSunnah(key) {
      const current = { ...this.settings.sunnahFastingEnabled };
      current[key] = !current[key];
      this.settings = await updateSettings({ sunnahFastingEnabled: current });
    },
    async resetAllData() {
      if (!confirm('Yakin ingin menghapus SELURUH data aplikasi? Tindakan ini tidak dapat dibatalkan.')) return;
      await Promise.all([db.cycle.clear(), db.symptoms.clear(), db.notes.clear(), db.qadha.clear(), db.qadha_history.clear(), db.qadha_manual.clear(), db.notifications.clear()]);
      await this.loadCycles();
      await this.refreshQadha();
      this.showToast('Seluruh data telah direset');
    },

    // ---------- BACKUP ----------
    async onImportFile(ev) {
      const file = ev.target.files[0];
      if (!file) return;
      const text = await file.text();
      try {
        await BackupService.importJSON(text, 'replace');
        await this.loadCycles();
        await this.refreshQadha();
        this.settings = await getSettings();

        // Reset kunci "sudah dicek hari ini" -> jangan ikut bawa status dari backup lama,
        // supaya pengecekan saran qadha benar-benar dicoba fresh di instalasi ini.
        this.settings = await updateSettings({ lastSmartQadhaCheck: null });
        await this.checkSmartQadhaSuggestion();

        this.showToast('Data berhasil diimpor');
      } catch (e) {
        this.showToast('Gagal mengimpor file: format tidak valid');
      }
      ev.target.value = '';
    }
  }));
});
