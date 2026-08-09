require('dotenv').config();
const express = require('express');
const session = require('express-session');
const path = require('path');
const {
  CATEGORIES,
  insertLink,
  deleteLink,
  getRanking,
  getAllSubmissions,
  getStats,
  getBackupData,
} = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'troque-esta-senha';
const SESSION_SECRET = process.env.SESSION_SECRET || 'troque-este-segredo';

app.use(express.json());
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

// ---------- Rotas públicas ----------

app.post('/api/submit', (req, res) => {
  const { name, url, category } = req.body || {};

  if (!name || !name.trim()) {
    return res.status(400).json({ ok: false, error: 'Informe seu nome.' });
  }
  if (!url || !url.trim()) {
    return res.status(400).json({ ok: false, error: 'Informe um link.' });
  }
  if (!CATEGORIES.includes(category)) {
    return res.status(400).json({ ok: false, error: 'Escolha a categoria: Vídeo ou Clipe.' });
  }

  const result = insertLink(url, name, category);

  if (!result.ok && result.reason === 'duplicate') {
    return res.status(409).json({
      ok: false,
      error: `Esse link já foi enviado antes por "${result.existing.submitter_name}".`,
    });
  }

  return res.json({ ok: true });
});

// Ranking público, só com nome e contagem (sem os links), por categoria
app.get('/api/ranking', (req, res) => {
  const ranking = {};
  CATEGORIES.forEach((cat) => {
    ranking[cat] = getRanking(cat);
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

// Estatísticas e ranking, separados por categoria. Aceita ?period=week|month|all
app.get('/api/admin/overview', requireAdmin, (req, res) => {
  const period = validPeriod(req.query.period);
  const overview = {};
  CATEGORIES.forEach((cat) => {
    overview[cat] = {
      stats: getStats(cat, period),
      ranking: getRanking(cat, period),
    };
  });
  res.json({ ok: true, overview });
});

// Versão leve, só com números, para o contador "ao vivo"
app.get('/api/admin/stats-live', requireAdmin, (req, res) => {
  const period = validPeriod(req.query.period);
  const stats = {};
  CATEGORIES.forEach((cat) => {
    stats[cat] = getStats(cat, period);
  });
  res.json({ ok: true, stats });
});

// Vídeos/clipes agrupados por pessoa. Aceita ?period e ?search
app.get('/api/admin/by-person', requireAdmin, (req, res) => {
  const period = validPeriod(req.query.period);
  const search = (req.query.search || '').trim();
  const result = {};
  CATEGORIES.forEach((cat) => {
    const links = getAllSubmissions(cat, period, search);
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

// Baixar backup de todos os dados
app.get('/api/admin/backup', requireAdmin, (req, res) => {
  const format = req.query.format === 'csv' ? 'csv' : 'json';
  const data = getBackupData();
  const stamp = new Date().toISOString().slice(0, 10);

  if (format === 'csv') {
    const header = 'id,url,submitter_name,category,created_at';
    const escapeCsv = (v) => `"${String(v).replace(/"/g, '""')}"`;
    const rows = data.map((r) =>
      [r.id, escapeCsv(r.url), escapeCsv(r.submitter_name), r.category, r.created_at].join(',')
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

// Excluir um link específico
app.delete('/api/admin/links/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ ok: false, error: 'ID inválido' });
  const result = deleteLink(id);
  if (!result.ok) return res.status(404).json({ ok: false, error: 'Link não encontrado' });
  res.json({ ok: true });
});

app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`);
});
