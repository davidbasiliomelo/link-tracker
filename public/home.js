(async function () {
  const container = document.getElementById('streamer-cards');
  try {
    const res = await fetch('/api/streamers');
    const data = await res.json();
    container.innerHTML = '';
    data.streamers.forEach((s) => {
      const a = document.createElement('a');
      a.className = 'streamer-card';
      a.href = '/' + s.slug;
      a.textContent = s.name;
      container.appendChild(a);
    });
  } catch (e) {
    container.textContent = 'Não foi possível carregar a lista. Tente recarregar a página.';
  }
})();
