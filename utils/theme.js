// utils/theme.js
function applyTheme(theme) {
  const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', isDark);
}

function applyFontSize(size) {
  const map = { sm: '14px', md: '16px', lg: '18px' };
  document.documentElement.style.fontSize = map[size] || map.md;
}

function watchSystemTheme(getCurrentTheme) {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getCurrentTheme() === 'system') applyTheme('system');
  });
}

window.ThemeUtil = { applyTheme, applyFontSize, watchSystemTheme };
