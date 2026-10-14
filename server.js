require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const {
  CATEGORIES,
  STREAMERS,
  getStreamersWithSettings,
  setMode,
  findStreamer,
  insertLink,
  deleteLink,
  getRanking,
  getAllSubmissions,
  getStats,
  getBackupData,
  restoreBackup,
  resetStreamer,
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'troque-esta-senha';
const SESSION_SECRET = process.env.SESSION_SECRET || 'troque-este-segredo';

app.use(express.json({ limit: '5mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8,
    },
  })
);

function requireAdmin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ ok: false, error: 'Não autorizado' });
}

function validPeriod(p) {
  return ['week', 'month', 'all'].includes(p) ? p : 'all';
}

// Lê ?streamer=slug da URL; se for inválido/ausente, usa o primeiro da lista
function streamerFromQuery(req) {
  const s = findStreamer(req.query.streamer);
  return (s || STREAMERS[0]).slug;
}

// ---------- Rotas públicas ----------

// Lista de streamers (para as páginas e para as abas do admin)
app.get('/api/streamers', (req, res) => {
  res.json({ ok: true, streamers: getStreamersWithSettings() });
});

app.post('/api/submit', (req, res) => {
  const { name, url, category, streamer } = req.body || {};

  if (!findStreamer(streamer)) {
    return res.status(400).json({ ok: false, error: 'Streamer inválido.' });
  }
  if (!name || !name.trim()) {
    return res.status(400).json({ ok: false, error: 'Informe seu nome.' });
  }
  if (!url || !url.trim()) {
    return res.status(400).json({ ok: false, error: 'Informe um link.' });
  }
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ ok: false, error: 'Escolha a categoria: Vídeo ou Clipe.' });
  }

  const result = insertLink(url, name, category, String(streamer).toLowerCase());

  if (!result.ok && result.reason === 'category_closed') {
    const label = category === 'video' ? 'vídeos' : 'clipes';
    return res.status(403).json({
      ok: false,
      error: `Este streamer não está recebendo ${label} no momento.`,
    });
  }

  if (!result.ok && result.reason === 'duplicate') {
    return res.status(409).json({
      ok: false,
      error: `Esse link já foi enviado antes por "${result.existing.submitter_name}".`,
    });
  }

  return res.json({ ok: true });
});

// Ranking público de UM streamer, só com nome e contagem (sem os links)
app.get('/api/ranking', (req, res) => {
  const streamer = streamerFromQuery(req);
  const ranking = {};
  CATEGORIES.forEach((cat) => {
    ranking[cat] = getRanking(streamer, cat);
  });
  res.json({ ok: true, ranking });
});

// ---------- Autenticação de admin ----------

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password === ADMIN_PASSWORD) {
    req.session.isAdmin = true;
    return res.json({ ok: true });
  }
  return res.status(401).json({ ok: false, error: 'Senha incorreta.' });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/check', (req, res) => {
  res.json({ ok: true, isAdmin: !!(req.session && req.session.isAdmin) });
});

// ---------- Rotas de admin (protegidas) ----------

// Estatísticas e ranking de um streamer, por categoria. ?streamer=&period=
app.get('/api/admin/overview', requireAdmin, (req, res) => {
  const streamer = streamerFromQuery(req);
  const period = validPeriod(req.query.period);
  const overview = {};
  CATEGORIES.forEach((cat) => {
    overview[cat] = {
      stats: getStats(streamer, cat, period),
      ranking: getRanking(streamer, cat, period),
    };
  });
  res.json({ ok: true, overview });
});

// Versão leve, só com números, para o contador "ao vivo"
app.get('/api/admin/stats-live', requireAdmin, (req, res) => {
  const streamer = streamerFromQuery(req);
  const period = validPeriod(req.query.period);
  const stats = {};
  CATEGORIES.forEach((cat) => {
    stats[cat] = getStats(streamer, cat, period);
  });
  res.json({ ok: true, stats });
});

// Vídeos/clipes agrupados por pessoa. ?streamer=&period=&search=
app.get('/api/admin/by-person', requireAdmin, (req, res) => {
  const streamer = streamerFromQuery(req);
  const period = validPeriod(req.query.period);
  const search = (req.query.search || '').trim();
  const result = {};
  CATEGORIES.forEach((cat) => {
    const links = getAllSubmissions(streamer, cat, period, search);
    const grouped = {};
    links.forEach((link) => {
      if (!grouped[link.submitter_name]) grouped[link.submitter_name] = [];
      grouped[link.submitter_name].push({
        id: link.id,
        url: link.url,
        created_at: link.created_at,
      });
    });
    result[cat] = Object.entries(grouped)
      .map(([name, items]) => ({ submitter_name: name, items }))
      .sort((a, b) => b.items.length - a.items.length);
  });
  res.json({ ok: true, byPerson: result });
});

// Definir quais tipos de link um streamer aceita: both | video | clipe
app.put('/api/admin/streamers/:slug/mode', requireAdmin, (req, res) => {
  const { mode } = req.body || {};
  const slug = String(req.params.slug || '').toLowerCase();
  const result = setMode(slug, mode);
  if (!result.ok) {
    return res.status(400).json({ ok: false, error: 'Streamer ou opção inválida.' });
  }
  res.json({ ok: true, mode });
});

// Baixar backup de TODOS os streamers
app.get('/api/admin/backup', requireAdmin, (req, res) => {
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const allData = getBackupData();
  const data = format === 'csv' ? allData.filter((r) => r.type !== 'settings') : allData;
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    const header = 'id,streamer,url,submitter_name,category,created_at';
    const escapeCsv = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = data.map((r) =>
      [
        r.id,
        r.streamer,
        escapeCsv(r.url),
        escapeCsv(r.submitter_name),
        r.category,
        r.created_at,
      ].join(',')
    );
    const csv = [header, ...rows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="backup-links-${stamp}.csv"`);
    return res.send(csv);
  }

  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="backup-links-${stamp}.json"`);
  res.send(JSON.stringify(data, null, 2));
});

// Restaurar um backup (JSON exportado pelo botão de backup)
app.post('/api/admin/restore', requireAdmin, (req, res) => {
  const { records, defaultStreamer } = req.body || {};
  if (!Array.isArray(records)) {
    return res.status(400).json({ ok: false, error: 'Arquivo inválido: esperado um backup em JSON.' });
  }
  const result = restoreBackup(records, defaultStreamer);
  res.json({ ok: true, ...result });
});

// Zerar os dados de UM streamer (os outros não são afetados)
app.delete('/api/admin/reset', requireAdmin, (req, res) => {
  const streamer = findStreamer(req.query.streamer);
  if (!streamer) return res.status(400).json({ ok: false, error: 'Streamer inválido.' });
  const result = resetStreamer(streamer.slug);
  res.json({ ok: true, ...result });
});

// Excluir um link específico
app.delete('/api/admin/links/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido' });
  const result = deleteLink(id);
  if (!result.ok) return res.status(404).json({ ok: false, error: 'Link não encontrado' });
  res.json({ ok: true });
});

// ---------- Páginas de cada streamer: /brunobig, /birox ... ----------
app.get('/:slug', (req, res, next) => {
  if (findStreamer(req.params.slug)) {
    return res.sendFile(path.join(__dirname, 'public', 'streamer.html'));
  }
  next();
});

// Qualquer outro endereço desconhecido volta pra página inicial
app.use((req, res) => {
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ ok: false, error: 'Rota não encontrada' });
  }
  res.redirect('/');
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
