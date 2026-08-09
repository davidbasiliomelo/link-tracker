const form = document.getElementById('submit-form');
const messageEl = document.getElementById('message');

const MEDALS = ['🥇', '🥈', '🥉'];

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function rankPrefix(index) {
  return MEDALS[index] || `${index + 1}.`;
}

function renderRanking(tbodyId, list) {
  const tbody = document.getElementById(tbodyId);
  if (!list || list.length === 0) {
    tbody.innerHTML = '<tr><td colspan="3" class="empty-state">Ninguém enviou ainda.</td></tr>';
    return;
  }
  tbody.innerHTML = list
    .map(
      (row, i) =>
        `<tr><td class="medal">${rankPrefix(i)}</td><td>${escapeHtml(row.submitter_name)}</td><td>${row.total}</td></tr>`
    )
    .join('');
}

async function loadRanking() {
  try {
    const res = await fetch('/api/ranking');
    const data = await res.json();
    renderRanking('ranking-video-body', data.ranking.video);
    renderRanking('ranking-clipe-body', data.ranking.clipe);
  } catch (e) {
    // silencioso: ranking é só um extra visual
  }
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('name').value;
  const url = document.getElementById('url').value;
  const category = document.querySelector('input[name="category"]:checked').value;

  messageEl.textContent = 'Enviando...';
  messageEl.className = '';

  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url, category }),
    });
    const data = await res.json();

    if (data.ok) {
      messageEl.textContent = '✅ Link enviado com sucesso!';
      messageEl.className = 'msg-ok';
      document.getElementById('url').value = '';
      if (typeof launchConfetti === 'function') launchConfetti();
      loadRanking();
    } else {
      messageEl.textContent = '⚠️ ' + data.error;
      messageEl.className = 'msg-error';
    }
  } catch (err) {
    messageEl.textContent = '❌ Erro de conexão com o servidor.';
    messageEl.className = 'msg-error';
  }
});

loadRanking();
