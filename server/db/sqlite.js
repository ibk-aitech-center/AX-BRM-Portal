// node:sqlite 어댑터 — 외부 의존성 0. Node ≥ 22.13 (플래그 불필요)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

/** @returns {import('./index.js').DbAdapter} */
export function createSqlite(filePath) {
  fs.mkdirSync(path.dirname(path.resolve(filePath)), { recursive: true });
  const db = new DatabaseSync(filePath);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

  return {
    kind: 'sqlite',
    async exec(sql) { db.exec(sql); },
    async all(sql, params = []) { return db.prepare(sql).all(...params); },
    async get(sql, params = []) { return db.prepare(sql).get(...params) ?? null; },
    async run(sql, params = []) {
      const r = db.prepare(sql).run(...params);
      return { changes: Number(r.changes) };
    },
    async transaction(fn) {
      db.exec('BEGIN');
      try { const out = await fn(); db.exec('COMMIT'); return out; }
      catch (e) { db.exec('ROLLBACK'); throw e; }
    },
    async close() { db.close(); },
  };
}
