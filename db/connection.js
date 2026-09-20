const path = require('node:path');
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'qa-agent-hub.sqlite'));

db.exec(`
  CREATE TABLE IF NOT EXISTS issues (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_id TEXT NOT NULL,
    source TEXT NOT NULL,
    area TEXT NOT NULL,
    product_name TEXT,
    user TEXT,
    issue_type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    severity TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    url TEXT,
    fingerprint TEXT NOT NULL UNIQUE,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS test_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    run_group_id TEXT NOT NULL,
    test_key TEXT NOT NULL,
    test_name TEXT NOT NULL,
    user TEXT NOT NULL,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS test_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_run_id INTEGER NOT NULL,
    step_order INTEGER NOT NULL,
    step_name TEXT NOT NULL,
    status TEXT NOT NULL,
    error TEXT,
    duration_ms INTEGER
  );
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS pins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_url TEXT NOT NULL,
    x_percent REAL NOT NULL,
    y_percent REAL NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    severity TEXT NOT NULL,
    created_at TEXT NOT NULL
  )
`);

function makeFingerprint({ source, area, product_name, issue_type, user }) {
  return [source, area, product_name || '', issue_type, user || ''].join('||');
}

// Re-running a scrape shouldn't create duplicate rows for the same issue -
// it just bumps last_seen so the Issues tab reflects "still happening".
function upsertIssue(issue) {
  const now = new Date().toISOString();
  const fingerprint = makeFingerprint(issue);
  const existing = db.prepare('SELECT id FROM issues WHERE fingerprint = ?').get(fingerprint);

  if (existing) {
    db.prepare('UPDATE issues SET last_seen = ? WHERE id = ?').run(now, existing.id);
    return existing.id;
  }

  const result = db
    .prepare(
      `INSERT INTO issues
        (run_id, source, area, product_name, user, issue_type, title, description, severity, status, url, fingerprint, first_seen, last_seen)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?, ?, ?, ?)`
    )
    .run(
      issue.run_id,
      issue.source,
      issue.area,
      issue.product_name || null,
      issue.user || null,
      issue.issue_type,
      issue.title,
      issue.description || '',
      issue.severity,
      issue.url || null,
      fingerprint,
      now,
      now
    );

  return result.lastInsertRowid;
}

function listIssues({ status } = {}) {
  if (status) {
    return db.prepare('SELECT * FROM issues WHERE status = ? ORDER BY last_seen DESC').all(status);
  }
  return db.prepare('SELECT * FROM issues ORDER BY last_seen DESC').all();
}

function getIssue(id) {
  return db.prepare('SELECT * FROM issues WHERE id = ?').get(id);
}

function updateIssueStatus(id, status) {
  db.prepare('UPDATE issues SET status = ? WHERE id = ?').run(status, id);
  return getIssue(id);
}

// Stat tiles always reflect the true totals; only the type breakdown
// (for the pie chart) is scoped to the status filter.
function getDashboardSummary({ status } = {}) {
  const all = listIssues();
  const totals = {
    total: all.length,
    open: all.filter((i) => i.status === 'open').length,
    fixed: all.filter((i) => i.status === 'fixed').length,
    resolved: all.filter((i) => i.status === 'resolved').length,
    closed: all.filter((i) => i.status === 'closed').length,
  };

  const scoped = status ? all.filter((i) => i.status === status) : all;
  const counts = {};
  scoped.forEach((issue) => {
    counts[issue.issue_type] = (counts[issue.issue_type] || 0) + 1;
  });
  const byType = Object.entries(counts).map(([issue_type, count]) => ({ issue_type, count }));

  return { totals, byType, scopedTotal: scoped.length };
}

function recordTestRun({ runGroupId, testKey, testName, user, status, startedAt, finishedAt, steps }) {
  const result = db
    .prepare(
      `INSERT INTO test_runs (run_group_id, test_key, test_name, user, status, started_at, finished_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(runGroupId, testKey, testName, user, status, startedAt, finishedAt);

  const testRunId = result.lastInsertRowid;
  const insertStep = db.prepare(
    `INSERT INTO test_steps (test_run_id, step_order, step_name, status, error, duration_ms)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  steps.forEach((step, index) => {
    insertStep.run(testRunId, index + 1, step.name, step.status, step.error || null, step.duration_ms || 0);
  });

  return testRunId;
}

function listTestRunsWithSteps({ limit = 200 } = {}) {
  const runs = db.prepare('SELECT * FROM test_runs ORDER BY id DESC LIMIT ?').all(limit);
  const stepStmt = db.prepare('SELECT * FROM test_steps WHERE test_run_id = ? ORDER BY step_order');
  return runs.map((run) => ({ ...run, steps: stepStmt.all(run.id) }));
}

function getPin(id) {
  return db.prepare('SELECT * FROM pins WHERE id = ?').get(id);
}

function createPin({ page_url, x_percent, y_percent, name, description, severity }) {
  const now = new Date().toISOString();
  const result = db
    .prepare(
      `INSERT INTO pins (page_url, x_percent, y_percent, name, description, severity, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(page_url, x_percent, y_percent, name, description || '', severity, now);
  return getPin(result.lastInsertRowid);
}

function listPinsForPage(pageUrl) {
  return db.prepare('SELECT * FROM pins WHERE page_url = ? ORDER BY id').all(pageUrl);
}

function listAllPins() {
  return db.prepare('SELECT * FROM pins ORDER BY id DESC').all();
}

function deletePin(id) {
  db.prepare('DELETE FROM pins WHERE id = ?').run(id);
}

module.exports = {
  db,
  upsertIssue,
  listIssues,
  getIssue,
  updateIssueStatus,
  recordTestRun,
  listTestRunsWithSteps,
  getDashboardSummary,
  createPin,
  listPinsForPage,
  listAllPins,
  deletePin,
};
