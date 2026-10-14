const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'links.db'));

const CATEGORIES = ['video', 'clipe'];

// Lista de streamers. Para adicionar mais um no futuro, é só incluir aqui:
// slug = parte do endereço (ex: /brunobig), name = nome exibido.
const STREAMERS = [
  { slug: 'brunobig', name: 'Bruno Big' },
  { slug: 'birox', name: 'Birox' },
];

function findStreamer(slug) {
  if (!slug) return null;
  return STREAMERS.find((s) => s.slug === String(slug).toLowerCase()) || null;
}

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    streamer TEXT NOT NULL,
    url TEXT NOT NULL,
    submitter_name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('video', 'clipe')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (streamer, url)
  )
`;

// ---------- Criação / migração da tabela ----------
const tableExists = db
  .prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name='submissions'`)
  .get();

if (!tableExists) {
  db.exec(CREATE_TABLE_SQL);
} else {
  const columns = db.prepare(`PRAGMA table_info(submissions)`).all();
  const hasStreamer = columns.some((c) => c.name === 'streamer');
  const hasCategory = columns.some((c) => c.name === 'category');

  if (!hasStreamer) {
    // Banco de uma versão antiga (sem streamer): recria a tabela e move os dados
    // existentes para o primeiro streamer da lista.
    const defaultStreamer = STREAMERS[0].slug;
    db.exec('BEGIN');
    try {
      db.exec(`ALTER TABLE submissions RENAME TO submissions_old`);
      db.exec(CREATE_TABLE_SQL);
      db.exec(`
        INSERT INTO submissions (streamer, url, submitter_name, category, created_at)
        SELECT '${defaultStreamer}', url, submitter_name, ${hasCategory ? 'category' : "'video'"}, created_at
        FROM submissions_old
      `);
      db.exec(`DROP TABLE submissions_old`);
      db.exec('COMMIT');
    } catch (e) {
      db.exec('ROLLBACK');
      throw e;
    }
  }
}

function normalizeUrl(rawUrl) {
  let url = rawUrl.trim();
  try {
    const u = new URL(url);
    u.hostname = u.hostname.toLowerCase();
    u.pathname = u.pathname.replace(/\/+$/, '') || '/';
    return u.toString();
  } catch (e) {
    return url;
  }
}

// Monta a cláusula SQL de período: 'week', 'month' ou tudo (null/undefined/'all')
function periodClause(period) {
  if (period === 'week') return `AND created_at >= datetime('now', '-7 days')`;
  if (period === 'month') return `AND created_at >= datetime('now', '-30 days')`;
  return '';
}

function insertLink(url, submitterName, category, streamer) {
  if (!CATEGORIES.includes(category)) {
    return { ok: false, reason: 'invalid_category' };
  }
  if (!findStreamer(streamer)) {
    return { ok: false, reason: 'invalid_streamer' };
  }

  const normalized = normalizeUrl(url);
  const stmt = db.prepare(
    'INSERT INTO submissions (streamer, url, submitter_name, category) VALUES (?, ?, ?, ?)'
  );
  try {
    const info = stmt.run(streamer, normalized, submitterName.trim(), category);
    return { ok: true, id: info.lastInsertRowid, url: normalized };
  } catch (err) {
    const isDuplicate =
      err.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      err.code === 'ERR_SQLITE_ERROR' ||
      /UNIQUE constraint failed/i.test(err.message || '');

    if (isDuplicate) {
      const existing = db
        .prepare(
          'SELECT submitter_name, created_at, category FROM submissions WHERE streamer = ? AND url = ?'
        )
        .get(streamer, normalized);
      return { ok: false, reason: 'duplicate', existing };
    }
    throw err;
  }
}

function deleteLink(id) {
  const info = db.prepare('DELETE FROM submissions WHERE id = ?').run(id);
  return { ok: info.changes > 0 };
}

function getRanking(streamer, category, period) {
  const clause = periodClause(period);
  return db
    .prepare(
      `SELECT submitter_name, COUNT(*) as total
       FROM submissions
       WHERE streamer = ? AND category = ? ${clause}
       GROUP BY submitter_name
       ORDER BY total DESC, submitter_name ASC`
    )
    .all(streamer, category);
}

function getAllSubmissions(streamer, category, period, search) {
  const clause = periodClause(period);
  const searchClause = search ? `AND submitter_name LIKE ?` : '';
  const sql = `SELECT id, url, submitter_name, category, created_at
               FROM submissions
               WHERE streamer = ? AND category = ? ${clause} ${searchClause}
               ORDER BY created_at DESC`;
  const params = [streamer, category];
  if (search) params.push(`%${search}%`);
  return db.prepare(sql).all(...params);
}

function getStats(streamer, category, period) {
  const clause = periodClause(period);
  const totalLinks = db
    .prepare(
      `SELECT COUNT(*) as c FROM submissions WHERE streamer = ? AND category = ? ${clause}`
    )
    .get(streamer, category).c;
  const totalPeople = db
    .prepare(
      `SELECT COUNT(DISTINCT submitter_name) as c FROM submissions
       WHERE streamer = ? AND category = ? ${clause}`
    )
    .get(streamer, category).c;
  return { totalLinks, totalPeople };
}

// Exporta todos os registros de todos os streamers, para backup
function getBackupData() {
  return db
    .prepare(
      `SELECT id, streamer, url, submitter_name, category, created_at
       FROM submissions
       ORDER BY streamer ASC, created_at ASC`
    )
    .all();
}

// Restaura registros de um backup. Ignora links que já existem (mesmo streamer + URL).
// Registros sem "streamer" (backups antigos) vão para o streamer padrão informado.
function restoreBackup(records, defaultStreamer) {
  let inserted = 0;
  let skipped = 0;
  const stmt = db.prepare(
    'INSERT INTO submissions (streamer, url, submitter_name, category, created_at) VALUES (?, ?, ?, ?, ?)'
  );

  records.forEach((r) => {
    if (!r || !r.url || !r.submitter_name || !CATEGORIES.includes(r.category)) {
      skipped++;
      return;
    }
    const streamerSlug = findStreamer(r.streamer)
      ? String(r.streamer).toLowerCase()
      : findStreamer(defaultStreamer)
      ? defaultStreamer
      : STREAMERS[0].slug;
    try {
      stmt.run(
        streamerSlug,
        normalizeUrl(r.url),
        String(r.submitter_name).trim(),
        r.category,
        r.created_at || new Date().toISOString()
      );
      inserted++;
    } catch (err) {
      skipped++; // provavelmente já existe
    }
  });

  return { inserted, skipped };
}

// Apaga todos os registros de UM streamer
function resetStreamer(streamer) {
  const info = db.prepare('DELETE FROM submissions WHERE streamer = ?').run(streamer);
  return { deleted: info.changes };
}

module.exports = {
  db,
  CATEGORIES,
  STREAMERS,
  findStreamer,
  insertLink,
  deleteLink,
  getRanking,
  getAllSubmissions,
  getStats,
  getBackupData,
  restoreBackup,
  resetStreamer,
};
