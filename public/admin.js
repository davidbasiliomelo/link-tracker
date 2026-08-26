const loginBox = document.getElementById('login-box');
const adminPanel = document.getElementById('admin-panel');
const loginBtn = document.getElementById('login-btn');
const logoutBtn = document.getElementById('logout-btn');
const loginMessage = document.getElementById('login-message');
const searchInput = document.getElementById('search-input');
const periodTabs = document.querySelectorAll('.period-tab');

const CATEGORY_LABELS = {
  video: '🎥 Vídeos',
  clipe: '✂️ Clipes',
};
const MEDALS = ['🥇', '🥈', '🥉'];

let currentPeriod = 'all';
let currentSearch = '';
let liveInterval = null;

async function checkSession() {
  const res = await fetch('/api/admin/check');
  const data = await res.json();
  if (data.isAdmin) showAdminPanel();
}

function showAdminPanel() {
  loginBox.style.display = 'none';
  adminPanel.style.display = 'block';
  loadAdminData();
  if (!liveInterval) {
    liveInterval = setInterval(refreshLiveStats, 5000);
  }
}

loginBtn.addEventListener('click', async () => {
  const password = document.getElementById('password').value;
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password }),
  });
  const data = await res.json();
  if (data.ok) {
    showAdminPanel();
  } else {
    loginMessage.textContent = 'Senha incorreta.';
    loginMessage.className = 'msg-error';
  }
});

document.getElementById('password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginBtn.click();
});

logoutBtn.addEventListener('click', async () => {
  clearInterval(liveInterval);
  await fetch('/api/admin/logout', { method: 'POST' });
  location.reload();
});

periodTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    periodTabs.forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    currentPeriod = tab.dataset.period;
    loadAdminData();
  });
});

let searchTimeout;
searchInput.addEventListener('input', () => {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => {
    currentSearch = searchInput.value.trim();
    loadAdminData();
  }, 300);
});

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function rankPrefix(index) {
  return MEDALS[index] || `${index + 1}.`;
}

async function refreshLiveStats() {
  try {
    const res = await fetch(`/api/admin/stats-live?period=${currentPeriod}`);
    if (!res.ok) return;
    const data = await res.json();
    Object.keys(data.stats).forEach((cat) => {
      const linksEl = document.getElementById(`stat-links-${cat}`);
      const peopleEl = document.getElementById(`stat-people-${cat}`);
      if (linksEl) linksEl.textContent = data.stats[cat].totalLinks;
      if (peopleEl) peopleEl.textContent = data.stats[cat].totalPeople;
    });
  } catch (e) {
    // silencioso: só é uma atualização em segundo plano
  }
}

async function loadAdminData() {
  const qs = `period=${currentPeriod}&search=${encodeURIComponent(currentSearch)}`;

  const overviewRes = await fetch(`/api/admin/overview?period=${currentPeriod}`);
  const overviewData = await overviewRes.json();

  const byPersonRes = await fetch(`/api/admin/by-person?${qs}`);
  const byPersonData = await byPersonRes.json();

  const container = document.getElementById('categories-container');
  container.innerHTML = '';

  Object.keys(overviewData.overview).forEach((cat) => {
    const { stats, ranking } = overviewData.overview[cat];
    const people = byPersonData.byPerson[cat] || [];

    const section = document.createElement('div');
    section.className = 'category-section';

    section.innerHTML = `
      <h2>${CATEGORY_LABELS[cat] || cat}</h2>
      <div class="stats">
        <div class="stat-card">
          <span id="stat-links-${cat}">${stats.totalLinks}</span>
          <small>links únicos</small>
        </div>
        <div class="stat-card">
          <span id="stat-people-${cat}">${stats.totalPeople}</span>
          <small>pessoas</small>
        </div>
      </div>

      <h3>Ranking</h3>
      ${
        ranking.length === 0
          ? '<p class="empty-state">Nenhum envio nesse período.</p>'
          : `<table>
              <thead><tr><th>#</th><th>Nome</th><th>Total</th></tr></thead>
              <tbody>
                ${ranking
                  .map(
                    (row, i) =>
                      `<tr><td class="medal">${rankPrefix(i)}</td><td>${escapeHtml(row.submitter_name)}</td><td>${row.total}</td></tr>`
                  )
                  .join('')}
              </tbody>
            </table>`
      }

      <h3>Por pessoa</h3>
      <div class="by-person-list">
        ${people.length === 0 ? '<p class="empty-state">Nada encontrado.</p>' : ''}
      </div>
    `;

    const listContainer = section.querySelector('.by-person-list');
    people.forEach((person) => {
      const card = document.createElement('div');
      card.className = 'person-card';

      const header = document.createElement('h3');
      header.textContent = `${person.submitter_name} (${person.items.length})`;
      card.appendChild(header);

      const list = document.createElement('ul');
      person.items.forEach((item) => {
        const li = document.createElement('li');

        const info = document.createElement('span');
        info.className = 'link-info';
        info.innerHTML = `<a href="${item.url}" target="_blank" rel="noopener">${escapeHtml(item.url)}</a> <span class="video-date">${item.created_at}</span>`;

        const delBtn = document.createElement('button');
        delBtn.className = 'delete-btn';
        delBtn.textContent = 'Excluir';
        delBtn.addEventListener('click', () => handleDelete(item.id, li));

        li.appendChild(info);
        li.appendChild(delBtn);
        list.appendChild(li);
      });
      card.appendChild(list);

      listContainer.appendChild(card);
    });

    container.appendChild(section);
  });
}

async function handleDelete(id, rowEl) {
  const confirmed = window.confirm('Tem certeza que deseja apagar esse link? Essa ação não pode ser desfeita.');
  if (!confirmed) return;

  try {
    const res = await fetch(`/api/admin/links/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      loadAdminData();
    } else {
      alert('Não foi possível apagar: ' + (data.error || 'erro desconhecido.'));
    }
  } catch (e) {
    alert('Erro de conexão ao tentar apagar.');
  }
}

const restoreFileInput = document.getElementById('restore-file');
const restoreMessage = document.getElementById('restore-message');

restoreFileInput.addEventListener('change', async () => {
  const file = restoreFileInput.files[0];
  if (!file) return;

  const confirmed = window.confirm(
    'Isso vai adicionar os links desse arquivo de backup ao banco atual (links repetidos são ignorados automaticamente). Quer continuar?'
  );
  if (!confirmed) {
    restoreFileInput.value = '';
    return;
  }

  restoreMessage.textContent = 'Restaurando...';
  restoreMessage.className = '';

  try {
    const text = await file.text();
    const records = JSON.parse(text);

    const res = await fetch('/api/admin/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ records }),
    });
    const data = await res.json();

    if (data.ok) {
      restoreMessage.textContent = `✅ Restaurado! ${data.inserted} link(s) adicionados, ${data.skipped} ignorados (já existiam ou inválidos).`;
      restoreMessage.className = 'msg-ok';
      loadAdminData();
    } else {
      restoreMessage.textContent = '⚠️ ' + (data.error || 'Erro ao restaurar.');
      restoreMessage.className = 'msg-error';
    }
  } catch (e) {
    restoreMessage.textContent = '❌ Arquivo inválido. Selecione um backup .json gerado pelo próprio painel.';
    restoreMessage.className = 'msg-error';
  }

  restoreFileInput.value = '';
});

const resetBtn = document.getElementById('reset-btn');

resetBtn.addEventListener('click', async () => {
  const firstConfirm = window.confirm(
    '⚠️ Isso vai APAGAR TODOS os links, de todas as pessoas e categorias, para sempre. Tem certeza?'
  );
  if (!firstConfirm) return;

  const typed = window.prompt('Pra confirmar de vez, digite ZERAR (em maiúsculas) na caixa abaixo:');
  if (typed !== 'ZERAR') {
    alert('Cancelado — nada foi apagado.');
    return;
  }

  try {
    const res = await fetch('/api/admin/reset', { method: 'DELETE' });
    const data = await res.json();
    if (data.ok) {
      alert(`Pronto! ${data.deleted} link(s) apagados. O painel está zerado.`);
      loadAdminData();
    } else {
      alert('Não foi possível zerar: ' + (data.error || 'erro desconhecido.'));
    }
  } catch (e) {
    alert('Erro de conexão ao tentar zerar o banco.');
  }
});

checkSession();
