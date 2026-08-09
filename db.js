const { DatabaseSync } = require('node:sqlite');
const path = require('path');

const db = new DatabaseSync(path.join(__dirname, 'links.db'));

const CATEGORIES = ['video', 'clipe'];

db.exec(`
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    submitter_name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('video', 'clipe')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
`);

try {
  const columns = db.prepare(`PRAGMA table_info(submissions)`).all();
  const hasCategory = columns.some((c) => c.name === 'category');
  if (!hasCategory) {
    db.exec(`ALTER TABLE submissions ADD COLUMN category TEXT NOT NULL DEFAULT 'video'`);
  }
} catch (e) {
  // tabela nova, sem necessidade de migração
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

function insertLink(url, submitterName, category) {
  if (!CATEGORIES.includes(category)) {
    return { ok: false, reason: 'invalid_category' };
  }

  const normalized = normalizeUrl(url);
  const stmt = db.prepare(
    'INSERT INTO submissions (url, submitter_name, category) VALUES (?, ?, ?)'
  );
  try {
    const info = stmt.run(normalized, submitterName.trim(), category);
    return { ok: true, id: info.lastInsertRowid, url: normalized };
  } catch (err) {
    const isDuplicate =
      err.code === 'SQLITE_CONSTRAINT_UNIQUE' ||
      err.code === 'ERR_SQLITE_ERROR' ||
      /UNIQUE constraint failed/i.test(err.message || '');

    if (isDuplicate) {
      const existing = db
        .prepare('SELECT submitter_name, created_at, category FROM submissions WHERE url = ?')
        .get(normalized);
      return { ok: false, reason: 'duplicate', existing };
    }
    throw err;
  }
}

function deleteLink(id) {
  const info = db.prepare('DELETE FROM submissions WHERE id = ?').run(id);
  return { ok: info.changes > 0 };
}

function getRanking(category, period) {
  const clause = periodClause(period);
  return db
    .prepare(
      `SELECT submitter_name, COUNT(*) as total
       FROM submissions
       WHERE category = ? ${clause}
       GROUP BY submitter_name
       ORDER BY total DESC, submitter_name ASC`
    )
    .all(category);
}

function getAllSubmissions(category, period, search) {
  const clause = periodClause(period);
  const searchClause = search ? `AND submitter_name LIKE ?` : '';
  const sql = `SELECT id, url, submitter_name, category, created_at
               FROM submissions
               WHERE category = ? ${clause} ${searchClause}
               ORDER BY created_at DESC`;
  const params = [category];
  if (search) params.push(`%${search}%`);
  return db.prepare(sql).all(...params);
}

function getStats(category, period) {
  const clause = periodClause(period);
  const totalLinks = db
    .prepare(`SELECT COUNT(*) as c FROM submissions WHERE category = ? ${clause}`)
    .get(category).c;
  const totalPeople = db
    .prepare(
      `SELECT COUNT(DISTINCT submitter_name) as c FROM submissions WHERE category = ? ${clause}`
    )
    .get(category).c;
  return { totalLinks, totalPeople };
}

// Exporta todos os registros, sem filtro, para backup
function getBackupData() {
  return db
    .prepare(
      `SELECT id, url, submitter_name, category, created_at
       FROM submissions
       ORDER BY created_at ASC`
    )
    .all();
}

module.exports = {
  db,
  CATEGORIES,
  insertLink,
  deleteLink,
  getRanking,
  getAllSubmissions,
  getStats,
  getBackupData,
};
