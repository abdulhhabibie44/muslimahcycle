// config/constants.js
window.APP_CONSTANTS = {
  SYMPTOMS: [
    { id: 'kram', label: 'Kram', icon: 'zap' },
    { id: 'nyeri_pinggang', label: 'Nyeri Pinggang', icon: 'activity' },
    { id: 'sakit_kepala', label: 'Sakit Kepala', icon: 'brain' },
    { id: 'mual', label: 'Mual', icon: 'wind' },
    { id: 'jerawat', label: 'Jerawat', icon: 'sparkles' },
    { id: 'payudara_nyeri', label: 'Payudara Nyeri', icon: 'heart' },
    { id: 'lelah', label: 'Lelah', icon: 'battery-low' },
    { id: 'sulit_tidur', label: 'Sulit Tidur', icon: 'moon' },
    { id: 'nafsu_makan', label: 'Nafsu Makan Meningkat', icon: 'utensils' },
    { id: 'mood_swing', label: 'Mood Swing', icon: 'shuffle' }
  ],
  MOODS: [
    { id: 'sangat_bahagia', label: 'Sangat Bahagia', emoji: '😀' },
    { id: 'bahagia', label: 'Bahagia', emoji: '🙂' },
    { id: 'biasa', label: 'Biasa', emoji: '😐' },
    { id: 'sedih', label: 'Sedih', emoji: '🙁' },
    { id: 'marah', label: 'Marah', emoji: '😡' },
    { id: 'sensitif', label: 'Sensitif', emoji: '😭' }
  ],
  INTENSITY: [
    { id: 'sedikit', label: 'Sedikit' },
    { id: 'sedang', label: 'Sedang' },
    { id: 'banyak', label: 'Banyak' }
  ],
  BLOOD_COLORS: [
    { id: 'merah_terang', label: 'Merah Terang' },
    { id: 'merah_tua', label: 'Merah Tua' },
    { id: 'coklat', label: 'Coklat' },
    { id: 'merah_muda', label: 'Merah Muda' },
    { id: 'hitam', label: 'Hitam' }
  ],
  LEGEND: [
    { type: 'haid', color: '#EF4444', colorDark: '#F87171', label: 'Hari Haid' },
    { type: 'prediksi_haid', color: '#A855F7', colorDark: '#C084FC', label: 'Prediksi Haid' },
    { type: 'subur', color: '#22C55E', colorDark: '#4ADE80', label: 'Masa Subur' },
    { type: 'ovulasi', color: '#EAB308', colorDark: '#FDE047', label: 'Ovulasi' },
    { type: 'qadha', color: '#3B82F6', colorDark: '#60A5FA', label: 'Puasa Qadha' },
    { type: 'sunnah', color: '#B45309', colorDark: '#FB923C', label: 'Puasa Sunnah' },
    { type: 'holiday', color: '#065F46', colorDark: '#10B981', label: 'Hari Besar Islam' },
    { type: 'note', color: '#0891B2', colorDark: '#22D3EE', label: 'Catatan', isStar: true },
    { type: 'today', color: '#6B7280', colorDark: '#9CA3AF', label: 'Hari Ini' }
  ]
};
