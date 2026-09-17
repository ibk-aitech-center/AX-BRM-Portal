import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GROUP_PLANNER_ROLE, isGroupPlanner, isGroupPlannerReadable } from '../server/groupPlanner.js';
import { canReadRequest, isDataBrm, isBrm, ROLES } from '../server/auth.js';
import { listDataBrmRecipients } from '../server/dataBrm.js';
import { createSqlite } from '../server/db/sqlite.js';

const planner = { employeeNo: '070001', role: GROUP_PLANNER_ROLE };
const brm = { employeeNo: '045345', role: 'brm' };
const dataBrm = { employeeNo: '081100', role: 'data_brm' };

test('역할 판정 — group_planner 는 AX-BRM 도 DATA-BRM 도 아니고, ROLES 에 포함된다', () => {
  assert.ok(ROLES.includes('group_planner'));
  assert.equal(isGroupPlanner(planner), true);
  assert.equal(isBrm(planner), false);
  assert.equal(isDataBrm(planner), false);
  assert.equal(isGroupPlanner(brm), false);
  assert.equal(isGroupPlanner(null), false);
});

test('canReadRequest — 그룹기획은 데이터 관련 여부와 무관하게 신청된 건 전부, 초안은 제외', () => {
  const dataRow = { requester_employee_no: '051234', status: 'submitted', answers: JSON.stringify({ q9_data: 'yes' }) };
  const calcRow = { requester_employee_no: '051234', status: 'done', answers: JSON.stringify({ q9_data: 'no' }) };
  const draftRow = { requester_employee_no: '051234', status: 'draft', answers: JSON.stringify({ q9_data: 'yes' }) };
  assert.equal(isGroupPlannerReadable(calcRow), true);
  assert.equal(isGroupPlannerReadable(draftRow), false);
  assert.equal(canReadRequest(planner, dataRow), true);
  assert.equal(canReadRequest(planner, calcRow), true);
  assert.equal(canReadRequest(planner, draftRow), false);
  // DATA-BRM 은 여전히 데이터 관련 건만 — 두 역할이 섞이지 않는다
  assert.equal(canReadRequest(dataBrm, calcRow), false);
});

test('그룹기획은 접수 알림 수신자가 아니다 (data_brm 수신자 목록에 섞이지 않음)', async () => {
  const conn = createSqlite(':memory:');
  await conn.exec(`CREATE TABLE users (employee_no TEXT PRIMARY KEY, name TEXT, role TEXT NOT NULL DEFAULT 'requester');`);
  await conn.run("INSERT INTO users(employee_no, name, role) VALUES ('070001', '김기획', 'group_planner')");
  await conn.run("INSERT INTO users(employee_no, name, role) VALUES ('081100', '정데이터', 'data_brm')");
  assert.deepEqual(await listDataBrmRecipients(conn), ['081100']);
});
