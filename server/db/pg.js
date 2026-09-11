// PostgreSQL 어댑터 — DATABASE_URL 설정 시 사용. `?` 플레이스홀더를 `$n` 으로 변환한다.
// ※ 이 어댑터는 스펙대로 작성했으나 로컬에 PostgreSQL 이 없어 실행 검증은 하지 못했다 (README 참고).

/** @param {string} sql */
function toPg(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

/** @returns {Promise<import('./index.js').DbAdapter>} */
export async function createPg(url) {
  const { default: pg } = await import('pg');
  const pool = new pg.Pool({ connectionString: url, max: 5 });

  /** @param {import('pg').PoolClient|import('pg').Pool} c */
  const wrap = (c) => ({
    kind: 'pg',
    async exec(sql) { await c.query(sql); },
    async all(sql, params = []) { return (await c.query(toPg(sql), params)).rows; },
    async get(sql, params = []) { return (await c.query(toPg(sql), params)).rows[0] ?? null; },
    async run(sql, params = []) { const r = await c.query(toPg(sql), params); return { changes: r.rowCount ?? 0 }; },
    async transaction(fn) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(wrap(client));
        await client.query('COMMIT');
        return out;
      } catch (e) { await client.query('ROLLBACK'); throw e; }
      finally { client.release(); }
    },
    async close() { await pool.end(); },
  });
  return wrap(pool);
}
