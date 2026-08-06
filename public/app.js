const form = document.getElementById('submit-form');
const messageEl = document.getElementById('message');

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
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
    } else {
      messageEl.textContent = '⚠️ ' + data.error;
      messageEl.className = 'msg-error';
    }
  } catch (err) {
    messageEl.textContent = '❌ Erro de conexão com o servidor.';
    messageEl.className = 'msg-error';
  }
});
