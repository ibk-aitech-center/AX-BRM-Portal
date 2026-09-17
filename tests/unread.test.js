import { test } from 'node:test';
import assert from 'node:assert/strict';
import { unreadState, markRead, READ_JOIN_SQL, NEW_SQL, UPDATED_SQL } from '../server/unread.js';
import { createSqlite } from '../server/db/sqlite.js';

test('unreadState — 기록 없음 new · 본 뒤 갱신 updated · 그 외 null', () => {
  const row = { updated_at: '2026-09-18T05:00:00.000Z' };
  assert.equal(unreadState(row, null), 'new');
  assert.equal(unreadState(row, '2026-09-18T04:00:00.000Z'), 'updated');
  assert.equal(unreadState(row, '2026-09-18T05:00:00.000Z'), null);
  assert.equal(unreadState(row, '2026-09-18T06:00:00.000Z'), null);
  assert.equal(unreadState(null, null), null);
});

test('markRead upsert + 목록 SQL 조각 — 다시 열면 read_at 갱신, new/updated 조건이 SQL 과 함수에서 같게 나온다', async () => {
  const conn = createSqlite(':memory:');
  await conn.exec(`
    CREATE TABLE requests (id TEXT PRIMARY KEY, status TEXT, updated_at TEXT);
    CREATE TABLE request_reads (request_id TEXT NOT NULL, employee_no TEXT NOT NULL, read_at TEXT NOT NULL, PRIMARY KEY (request_id, employee_no));
  `);
  await conn.run("INSERT INTO requests VALUES ('a','submitted','2026-09-01T00:00:00.000Z')");
  await conn.run("INSERT INTO requests VALUES ('b','reviewing','2026-09-01T00:00:00.000Z')");
  await conn.run("INSERT INTO requests VALUES ('c','draft','2026-09-01T00:00:00.000Z')");
  const me = '045345';
  const list = () => conn.all(`SELECT r.*, rr.read_at AS my_read_at FROM requests r ${READ_JOIN_SQL} WHERE r.status <> 'draft' ORDER BY r.id`, [me]);
  const countNew = async () => Number((await conn.get(`SELECT COUNT(*) AS n FROM requests r ${READ_JOIN_SQL} WHERE r.status <> 'draft' AND ${NEW_SQL}`, [me])).n);
  const countUpd = async () => Number((await conn.get(`SELECT COUNT(*) AS n FROM requests r ${READ_JOIN_SQL} WHERE r.status <> 'draft' AND ${UPDATED_SQL}`, [me])).n);

  // 처음엔 전부 신규
  assert.deepEqual((await list()).map((r) => unreadState(r, r.my_read_at)), ['new', 'new']);
  assert.equal(await countNew(), 2);

  // a 를 열면 a 만 읽음. 다른 직원의 기록은 영향 없음
  const at = await markRead(conn, ['a'], me);
  await markRead(conn, ['b'], '999999');
  assert.deepEqual((await list()).map((r) => unreadState(r, r.my_read_at)), [null, 'new']);
  assert.equal(await countNew(), 1);

  // a 가 그 뒤 갱신되면 updated — 배지(new)는 세지 않는다 (갱신 시각은 '지금' — 미래 시각을 넣으면 뒤의 전체 읽음 처리보다도 뒤가 되어 계속 updated 로 남는다)
  await new Promise((r) => setTimeout(r, 5));
  await conn.run("UPDATE requests SET updated_at = ? WHERE id = 'a'", [new Date().toISOString()]);
  assert.deepEqual((await list()).map((r) => unreadState(r, r.my_read_at)), ['updated', 'new']);
  assert.equal(await countNew(), 1);
  assert.equal(await countUpd(), 1);

  // 전체 읽음 처리(신규·업데이트 모두) → 0. upsert 라 a 의 read_at 은 갱신됐다
  await new Promise((r) => setTimeout(r, 5));
  await markRead(conn, ['a', 'b'], me);
  assert.equal(await countNew(), 0);
  assert.equal(await countUpd(), 0);
  const a = await conn.get('SELECT read_at FROM request_reads WHERE request_id = ? AND employee_no = ?', ['a', me]);
  assert.ok(a.read_at >= at);
  assert.equal(Number((await conn.get('SELECT COUNT(*) AS n FROM request_reads')).n), 3);
});
