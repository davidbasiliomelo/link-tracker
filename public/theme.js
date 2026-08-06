// Aplica o tema salvo assim que possível, para não "piscar" claro antes de escurecer.
(function () {
  const saved = localStorage.getItem('theme');
  const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const theme = saved || (prefersDark ? 'dark' : 'light');
  if (theme === 'dark') document.documentElement.classList.add('dark');
})();

document.addEventListener('DOMContentLoaded', () => {
  const btn = document.getElementById('theme-toggle');
  if (!btn) return;

  function updateIcon() {
    btn.textContent = document.documentElement.classList.contains('dark') ? '☀️' : '🌙';
  }
  updateIcon();

  btn.addEventListener('click', () => {
    document.documentElement.classList.toggle('dark');
    const isDark = document.documentElement.classList.contains('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    updateIcon();
  });
});
