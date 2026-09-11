import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createSqlite } from '../server/db/sqlite.js';
import { nextReqNo } from '../server/db/index.js';
import { countResetTargets, resetRequests, RESET_TABLES, RESET_CONFIRM_WORD } from '../server/resetRequests.js';

const schema = fs.readFileSync(path.resolve('server/db/schema.sql'), 'utf8');
const quiet = { warn() {}, log() {}, error() {} };

async function seededDb() {
  const conn = createSqlite(':memory:');
  await conn.exec(schema);
  await conn.run("INSERT INTO users(employee_no, name, role, created_at) VALUES ('024498', '관리자', 'admin', '2026-09-01T00:00:00Z')");
  await conn.run("INSERT INTO tbl_employee_adv(emp_no, emp_nm) VALUES ('045345', '김브름')");
  for (let i = 0; i < 3; i++) {
    const no = await nextReqNo(conn, 2026);
    await conn.run(`INSERT INTO requests(id, req_no, title, status, requester_employee_no, requester_name, questionnaire_version, answers, created_at, updated_at)
                    VALUES (?, ?, ?, 'submitted', '051234', '이현업', 'v1', '{}', '2026-09-01T00:00:00Z', '2026-09-01T00:00:00Z')`, [`r${i}`, no, `테스트 ${i}`]);
  }
  await conn.run("INSERT INTO comments(id, request_id, author_employee_no, author_name, author_role, body, created_at) VALUES ('c1', 'r0', '051234', '이현업', 'requester', '문의', '2026-09-01T00:00:00Z')");
  await conn.run("INSERT INTO status_history(id, request_id, from_status, to_status, changed_by, changed_by_name, changed_at) VALUES ('h1', 'r0', 'draft', 'submitted', '051234', '이현업', '2026-09-01T00:00:00Z')");
  return conn;
}

test('초기화: 요청 관련 테이블과 접수번호 카운터를 비우고, users·HR 미러는 남긴다 — 다음 접수번호는 0001', async () => {
  const conn = await seededDb();
  assert.equal(await nextReqNo(conn, 2026), 'BRM-2026-0004'); // 3건 발급 뒤라 4번 — 단건 삭제로는 이 값이 안 줄어든다
  const before = await countResetTargets(conn);
  assert.equal(before.requests, 3); assert.equal(before.comments, 1); assert.equal(before.status_history, 1); assert.equal(before.counters, 1);

  const r = await resetRequests({ conn, logger: quiet, by: 'test' });
  assert.equal(r.counts.requests, 3);
  assert.equal(r.nextReqNo, `BRM-${new Date().getFullYear()}-0001`);
  for (const t of RESET_TABLES) assert.equal((await conn.get(`SELECT COUNT(*) AS n FROM ${t}`)).n, 0, t);
  assert.equal((await conn.get('SELECT COUNT(*) AS n FROM users')).n, 1);
  assert.equal((await conn.get('SELECT COUNT(*) AS n FROM tbl_employee_adv')).n, 1);
  assert.equal(await nextReqNo(conn, 2026), 'BRM-2026-0001'); // 카운터가 되감겼다
  assert.equal(RESET_CONFIRM_WORD, '초기화');
  await conn.close();
});
