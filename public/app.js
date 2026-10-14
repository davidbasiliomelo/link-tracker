const form = document.getElementById('submit-form');
const messageEl = document.getElementById('message');
const badgeEl = document.getElementById('streamer-badge');

const MEDALS = ['🥇', '🥈', '🥉'];

// O streamer vem do endereço da página: /brunobig, /birox...
const slug = (location.pathname.split('/').filter(Boolean)[0] || '').toLowerCase();
let streamer = null;

const CATEGORY_NAMES = {
  video: { singular: 'vídeo', plural: 'vídeos' },
  clipe: { singular: 'clipe', plural: 'clipes' },
};

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

// Mostra/esconde formulário e ranking conforme o que o streamer aceita
function applyAllowedCategories() {
  const allowed = streamer.allowedCategories || ['video', 'clipe'];

  ['video', 'clipe'].forEach((cat) => {
    const col = document.getElementById(`ranking-col-${cat}`);
    if (col) col.style.display = allowed.includes(cat) ? '' : 'none';
  });

  const categoryBlock = document.getElementById('category-block');
  const urlLabel = document.getElementById('url-label');
  const subtitle = document.getElementById('subtitle');

  if (allowed.length === 1) {
    const names = CATEGORY_NAMES[allowed[0]];
    categoryBlock.style.display = 'none';
    urlLabel.textContent = `Link do ${names.singular}`;
    subtitle.textContent = `Este streamer está recebendo apenas ${names.plural}. Links repetidos não são aceitos duas vezes.`;
  } else {
    categoryBlock.style.display = '';
    urlLabel.textContent = 'Link do vídeo/clipe';
    subtitle.textContent = 'Links repetidos não são aceitos duas vezes.';
  }
}

// Categoria escolhida: se só uma é aceita, é ela; senão, a marcada no formulário
function selectedCategory() {
  const allowed = streamer.allowedCategories || ['video', 'clipe'];
  if (allowed.length === 1) return allowed[0];
  return document.querySelector('input[name="category"]:checked').value;
}

async function loadRanking() {
  if (!streamer) return;
  try {
    const res = await fetch(`/api/ranking?streamer=${encodeURIComponent(streamer.slug)}`);
    const data = await res.json();
    renderRanking('ranking-video-body', data.ranking.video);
    renderRanking('ranking-clipe-body', data.ranking.clipe);
    applyAllowedCategories();
  } catch (e) {
    // silencioso: ranking é só um extra visual
  }
}

async function init() {
  try {
    const res = await fetch('/api/streamers');
    const data = await res.json();
    streamer = data.streamers.find((s) => s.slug === slug) || null;
  } catch (e) {
    streamer = null;
  }

  if (!streamer) {
    document.querySelector('.container').innerHTML =
      '<h1>Página não encontrada</h1><p><a href="/">← Voltar para a página inicial</a></p>';
    return;
  }

  badgeEl.textContent = `⭐ ${streamer.name}`;
  document.title = `Envie seu link — ${streamer.name}`;
  applyAllowedCategories();
  loadRanking();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!streamer) return;

  const name = document.getElementById('name').value;
  const url = document.getElementById('url').value;
  const category = selectedCategory();

  messageEl.textContent = 'Enviando...';
  messageEl.className = '';

  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, url, category, streamer: streamer.slug }),
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

init();
