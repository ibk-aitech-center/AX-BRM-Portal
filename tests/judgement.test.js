import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latestOverride, mergeJudgement, loadOverrides } from '../server/judgement.js';
import { createSqlite } from '../server/db/sqlite.js';

test('latestOverride — 가장 최근 의견의 조정이 이기고, 빈 조정·깨진 JSON 은 무시', () => {
  const reviews = [
    { judgement_override: JSON.stringify({ track: 'agent' }), created_at: '2026-09-01T00:00:00Z' },
    { judgement_override: null, created_at: '2026-09-03T00:00:00Z' },
    { judgement_override: JSON.stringify({ track: 'brm' }), created_at: '2026-09-02T00:00:00Z' },
    { judgement_override: '{broken', created_at: '2026-09-04T00:00:00Z' },
    { judgement_override: '{}', created_at: '2026-09-05T00:00:00Z' },
  ];
  assert.deepEqual(latestOverride(reviews), { track: 'brm' });
  assert.equal(latestOverride([]), null);
  assert.equal(latestOverride(undefined), null);
});

test('mergeJudgement — 조정 값만 덮고 나머지는 원 판정 유지, 원 판정이 없으면 그대로 null', () => {
  const base = { track: 'agent', dataCase: 'A', leadtime: 2 };
  assert.deepEqual(mergeJudgement(base, { track: 'brm' }), { track: 'brm', dataCase: 'A', leadtime: 2 });
  assert.equal(mergeJudgement(base, null), base);
  assert.equal(mergeJudgement(null, { track: 'brm' }), null);
});

test('loadOverrides — 요청별 최근 조정만 Map 으로', async () => {
  const conn = createSqlite(':memory:');
  await conn.exec(`CREATE TABLE request_reviews (id TEXT PRIMARY KEY, request_id TEXT, judgement_override TEXT, created_at TEXT);`);
  await conn.run("INSERT INTO request_reviews VALUES ('1','r1','{\"track\":\"agent\"}','2026-09-01')");
  await conn.run("INSERT INTO request_reviews VALUES ('2','r1','{\"track\":\"brm\"}','2026-09-02')");
  await conn.run("INSERT INTO request_reviews VALUES ('3','r2',NULL,'2026-09-02')");
  const m = await loadOverrides(conn, ['r1', 'r2', 'r3']);
  assert.deepEqual([...m.entries()], [['r1', { track: 'brm' }]]);
  assert.equal((await loadOverrides(conn, [])).size, 0);
});
