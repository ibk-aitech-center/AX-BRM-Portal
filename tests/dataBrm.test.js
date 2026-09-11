import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isDataAnswers, isDataRequestRow, DATA_REQUEST_SQL, listDataBrmRecipients, DATA_BRM_ROLE } from '../server/dataBrm.js';
import { canReadRequest, isDataBrm, isBrm, ROLES } from '../server/auth.js';
import { createSqlite } from '../server/db/sqlite.js';

const dataBrm = { employeeNo: '081100', role: DATA_BRM_ROLE };
const brm = { employeeNo: '045345', role: 'brm' };
const requester = { employeeNo: '051234', role: 'requester' };

test('DATA-BRM 조회 대상 — q9_data 가 yes 또는 unknown 인 신청 건만', () => {
  assert.equal(isDataAnswers({ q9_data: 'yes' }), true);
  assert.equal(isDataAnswers({ q9_data: 'unknown' }), true);
  assert.equal(isDataAnswers({ q9_data: 'no' }), false);
  assert.equal(isDataAnswers({}), false);
  assert.equal(isDataAnswers(null), false);
  // DB 행: answers 는 JSON 문자열, 초안은 제외
  assert.equal(isDataRequestRow({ status: 'submitted', answers: JSON.stringify({ q9_data: 'yes' }) }), true);
  assert.equal(isDataRequestRow({ status: 'draft', answers: JSON.stringify({ q9_data: 'yes' }) }), false);
  assert.equal(isDataRequestRow({ status: 'submitted', answers: '{broken' }), false);
});

test('역할 판정 — data_brm 은 AX-BRM 이 아니고, ROLES 에 포함된다', () => {
  assert.ok(ROLES.includes('data_brm'));
  assert.equal(isDataBrm(dataBrm), true);
  assert.equal(isBrm(dataBrm), false);
  assert.equal(isDataBrm(brm), false);
});

test('canReadRequest — 요청자 본인·AX-BRM 은 전부, DATA-BRM 은 데이터 관련 신청 건만', () => {
  const dataRow = { requester_employee_no: '051234', status: 'submitted', answers: JSON.stringify({ q9_data: 'unknown' }) };
  const calcRow = { requester_employee_no: '051234', status: 'submitted', answers: JSON.stringify({ q9_data: 'no' }) };
  const draftRow = { requester_employee_no: '051234', status: 'draft', answers: JSON.stringify({ q9_data: 'yes' }) };
  assert.equal(canReadRequest(requester, dataRow), true);
  assert.equal(canReadRequest({ employeeNo: '099999', role: 'requester' }, dataRow), false);
  assert.equal(canReadRequest(brm, calcRow), true);
  assert.equal(canReadRequest(dataBrm, dataRow), true);
  assert.equal(canReadRequest(dataBrm, calcRow), false);
  assert.equal(canReadRequest(dataBrm, draftRow), false);
});

test('목록 SQL 조건은 JSON.stringify 저장 형식과 맞고, 알림 수신자는 data_brm 전원', async () => {
  const conn = createSqlite(':memory:');
  await conn.exec(`
    CREATE TABLE users (employee_no TEXT PRIMARY KEY, name TEXT, role TEXT NOT NULL DEFAULT 'requester');
    CREATE TABLE requests (id TEXT PRIMARY KEY, status TEXT, answers TEXT);
  `);
  const rows = [
    ['r1', 'submitted', { q9_data: 'yes', q1_title: 'a' }],
    ['r2', 'submitted', { q9_data: 'unknown' }],
    ['r3', 'submitted', { q9_data: 'no' }],
    ['r4', 'draft', { q9_data: 'yes' }],
    ['r5', 'submitted', { q1_title: '데이터 없음' }],
  ];
  for (const [id, st, a] of rows) await conn.run('INSERT INTO requests(id, status, answers) VALUES (?,?,?)', [id, st, JSON.stringify(a)]);
  const hit = await conn.all(`SELECT id FROM requests WHERE status <> 'draft' AND ${DATA_REQUEST_SQL} ORDER BY id`);
  assert.deepEqual(hit.map((r) => r.id), ['r1', 'r2']);

  await conn.run("INSERT INTO users(employee_no, name, role) VALUES ('081100', '정데이터', 'data_brm')");
  await conn.run("INSERT INTO users(employee_no, name, role) VALUES ('045345', '김브름', 'brm')");
  await conn.run("INSERT INTO users(employee_no, name, role) VALUES ('081101', '박데이터', 'data_brm')");
  assert.deepEqual((await listDataBrmRecipients(conn)).sort(), ['081100', '081101']);
});
