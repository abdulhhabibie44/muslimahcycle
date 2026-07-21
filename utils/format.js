// utils/format.js
function formatIndoDate(date) {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', "Jum'at", 'Sabtu'];
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const d = dayjs(date);
  return `${days[d.day()]}, ${d.date()} ${months[d.month()]} ${d.year()}`;
}

function formatShortDate(date) {
  return dayjs(date).format('D MMM YYYY');
}

function pluralHari(n) {
  return `${n} Hari`;
}

window.FormatUtil = { formatIndoDate, formatShortDate, pluralHari };
