import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHrRow, EXCLUDED, describeMirrorGuardBreach, replaceMirrorRows, propagateToUsers,
  positionFor, syncRoles, seedInitialAdmins, MOCK_EMPLOYEES, MIRROR_TABLE, roleForNewLogin, provisionUserFromMirror,
  listAssigneeCandidates, findAssigneeCandidate, ASSIGNEE_RULE, listAdminRecipients, isHqOrg, HQ_OGZN_ATTCDS,
} from '../server/hrSync.js';
import { createSqlite } from '../server/db/sqlite.js';

// ── normalizeHrRow ──────────────────────────────────────────────
test('DU90(외주)은 미러에서 제외된다', () => {
  assert.equal(normalizeHrRow({ emp_no: '099001', ducd: 'DU90' }), EXCLUDED);
  assert.equal(normalizeHrRow({ emp_no: '099001', ducd: 'du90 ' }), EXCLUDED); // 대소문자·공백 무관
});

test('DU16(그룹장/부행장)은 미러에 포함된다 — 우리 시스템 결정(2026-09-03)', () => {
  const row = normalizeHrRow({ emp_no: '099005', emp_nm: '한그룹', abnm_jtm: '그룹장', ducd: 'DU16' });
  assert.ok(Array.isArray(row));
  assert.equal(row[0], '099005');
  assert.equal(row[2], '그룹장');
});

test('사번 6자리 형식이 아니면 건너뛴다 (제외와 구분)', () => {
  assert.equal(normalizeHrRow({ emp_no: '12345', ducd: 'DU40' }), null);
  assert.equal(normalizeHrRow({ emp_no: '', ducd: 'DU40' }), null);
  assert.equal(normalizeHrRow(null), null);
});

test('값은 트림되고 빈 문자열은 NULL 로', () => {
  const row = normalizeHrRow({ emp_no: ' 051234 ', emp_nm: ' 이현업 ', abnm_jtm: '  ', ducd: 'DU40' });
  assert.deepEqual(row, ['051234', '이현업', null, 'DU40', null, null, null, null, null, null, null]);
});

test('정렬순서(ofor_sqc·emp_rost_sqc)는 정수로, 빈 값·숫자 아님은 NULL', () => {
  const row = normalizeHrRow({ emp_no: '051234', ducd: 'DU40', ofor_sqc: ' 120 ', emp_rost_sqc: '7' });
  assert.deepEqual(row.slice(8, 10), [120, 7]);
  assert.deepEqual(normalizeHrRow({ emp_no: '051234', ducd: 'DU40', ofor_sqc: '', emp_rost_sqc: 'abc' }).slice(8, 10), [null, null]);
});

test('조직속성코드(ogzn_attcd)는 트림해서 마지막 자리에, 빈 값은 NULL', () => {
  assert.equal(normalizeHrRow({ emp_no: '051234', ducd: 'DU40', ogzn_attcd: ' 0002 ' }).at(-1), '0002');
  assert.equal(normalizeHrRow({ emp_no: '051234', ducd: 'DU40', ogzn_attcd: '' }).at(-1), null);
  assert.equal(normalizeHrRow({ emp_no: '051234', ducd: 'DU40' }).at(-1), null);
});

// ── 본부부서 판정 (요청 자격) ─────────────────────────────────────
test('본부부서 코드만 요청 자격 — 영업점·빈 값·미러 없음(null)은 false', () => {
  for (const c of HQ_OGZN_ATTCDS) assert.equal(isHqOrg(c), true, c);
  assert.equal(isHqOrg(' 0001 '), true); // 트림
  assert.equal(isHqOrg('0011'), false);
  assert.equal(isHqOrg('1'), false);     // 자리수 다른 값은 별개 코드
  assert.equal(isHqOrg(''), false);
  assert.equal(isHqOrg(null), false);
  assert.equal(isHqOrg(undefined), false);
});

test('목업 직원: 본부(1094·개인고객부·경영기획부·디지털그룹)는 자격 있음, 을지로지점은 없음', () => {
  const by = Object.fromEntries(MOCK_EMPLOYEES.map((m) => [m.emp_no, isHqOrg(m.ogzn_attcd)]));
  assert.equal(by['045345'], true);
  assert.equal(by['051234'], true);
  assert.equal(by['099005'], true);
  assert.equal(by['062211'], false);
  assert.equal(by['099001'], false); // 외주 — 코드 없음
});

// ── 급감 가드 ────────────────────────────────────────────────────
test('급감 가드: 0건·50% 미만이면 사유, 정상·최초면 null', () => {
  assert.match(describeMirrorGuardBreach(100, 0), /0건/);
  assert.match(describeMirrorGuardBreach(100, 40), /급감/);
  assert.equal(describeMirrorGuardBreach(100, 90), null);
  assert.equal(describeMirrorGuardBreach(0, 0), null); // 최초 동기화
});

// ── 미러 교체 + users 전파 (실제 SQLite) ────────────────────────
async function memoryDb() {
  const conn = createSqlite(':memory:');
  await conn.exec(`
    CREATE TABLE users (
      employee_no TEXT PRIMARY KEY, name TEXT, org_cd TEXT, org_nm TEXT, position TEXT,
      role TEXT NOT NULL DEFAULT 'requester', created_at TEXT, last_login_at TEXT);
    CREATE TABLE ${MIRROR_TABLE} (
      emp_no TEXT PRIMARY KEY, emp_nm TEXT, abnm_jtm TEXT, ducd TEXT,
      blng_brcd TEXT, blng_nm TEXT, beteam_cd TEXT, beteam_nm TEXT, ofor_sqc INTEGER, emp_rost_sqc INTEGER, ogzn_attcd TEXT, synced_at TEXT);
    CREATE TABLE app_meta (key TEXT PRIMARY KEY, value TEXT);
  `);
  return conn;
}

test('목업 시드 → 전파: 로그인한 직원의 position 이 미러 직위명으로 채워진다', async () => {
  const conn = await memoryDb();
  await conn.run("INSERT INTO users(employee_no, name, position) VALUES ('051234', '이현업', NULL)");
  await conn.run("INSERT INTO users(employee_no, name, position) VALUES ('045345', '김브름', '옛직책')");

  const rows = MOCK_EMPLOYEES.map(normalizeHrRow).filter((r) => Array.isArray(r));
  assert.equal(rows.length, 9); // 10명 중 DU90 1명 제외, DU16 포함
  await replaceMirrorRows(conn, rows);

  const updated = await propagateToUsers(conn);
  assert.equal(updated, 2);
  assert.equal((await conn.get("SELECT position FROM users WHERE employee_no='051234'")).position, '대리');
  assert.equal((await conn.get("SELECT position FROM users WHERE employee_no='045345'")).position, '팀장');

  // 미러에 없는 직원(외주 등)의 기존 position 은 건드리지 않는다
  await conn.run("INSERT INTO users(employee_no, name, position) VALUES ('099001', '강외주', '계약직')");
  await propagateToUsers(conn);
  assert.equal((await conn.get("SELECT position FROM users WHERE employee_no='099001'")).position, '계약직');
  await conn.close();
});

test('positionFor: 미러 조회 — 있으면 직위명, 없으면 null', async () => {
  const conn = await memoryDb();
  await replaceMirrorRows(conn, MOCK_EMPLOYEES.map(normalizeHrRow).filter((r) => Array.isArray(r)));
  assert.equal(await positionFor(conn, '099005'), '그룹장'); // DU16 포함 확인
  assert.equal(await positionFor(conn, '099001'), null);     // DU90 제외 확인
  assert.equal(await positionFor(conn, '000000'), null);
  await conn.close();
});

test('replaceMirrorRows 는 full-replace — 이전 행이 남지 않는다', async () => {
  const conn = await memoryDb();
  await replaceMirrorRows(conn, [['111111', '옛사람', '부장', 'DU22', null, null, null]]);
  await replaceMirrorRows(conn, [['222222', '새사람', '과장', 'DU40', null, null, null]]);
  const all = await conn.all(`SELECT emp_no FROM ${MIRROR_TABLE}`);
  assert.deepEqual(all.map((r) => r.emp_no), ['222222']);
  await conn.close();
});

// ── 담당자 지정 후보 ────────────────────────────────────────────
test('담당자 후보: 1094 전원에서 DU22(부장) 제외, ofor_sqc → emp_rost_sqc 순, NULL 은 맨 뒤', async () => {
  const conn = await memoryDb();
  await replaceMirrorRows(conn, MOCK_EMPLOYEES.map(normalizeHrRow).filter((r) => Array.isArray(r)));
  // 정렬순서가 비어 있는 1094 직원 — 맨 뒤로 가야 한다
  await replaceMirrorRows(conn, [
    ...MOCK_EMPLOYEES.map(normalizeHrRow).filter((r) => Array.isArray(r)),
    normalizeHrRow({ emp_no: '045399', emp_nm: '무순서', abnm_jtm: '대리', ducd: 'DU40', blng_brcd: '1094', blng_nm: 'AX디지털추진부' }),
  ]);
  const list = await listAssigneeCandidates(conn);
  assert.deepEqual(list.map((c) => c.employeeNo), ['045348', '045345', '045346', '045347', '045399']);
  assert.ok(!list.some((c) => c.employeeNo === '099002'), '부장(DU22)은 목록에 없다');
  assert.ok(!list.some((c) => c.employeeNo === '051234'), '다른 부서는 목록에 없다');
  assert.deepEqual(list[0], { employeeNo: '045348', name: '유기획', position: '차장', teamNm: 'AX기획팀' });
  assert.equal(ASSIGNEE_RULE.deptCode, '1094');

  assert.deepEqual(await findAssigneeCandidate(conn, '045346'), { employeeNo: '045346', name: '정담당', position: '과장' });
  assert.equal(await findAssigneeCandidate(conn, '099002'), null); // DU22
  assert.equal(await findAssigneeCandidate(conn, '051234'), null); // 타 부서
  await conn.close();
});

// ── 권한(role) 규칙 ─────────────────────────────────────────────
test('역할 갱신: 팀코드 8476 전원 + 1094 부장 → admin, 나머지 1094 → brm, 규칙 밖 brm 은 회수, admin·data_brm 은 회수 안 함', async () => {
  const conn = await memoryDb();
  await replaceMirrorRows(conn, MOCK_EMPLOYEES.map(normalizeHrRow).filter((r) => Array.isArray(r)));
  await conn.run("INSERT INTO users(employee_no, name, role) VALUES ('045345', '김브름', 'brm')");       // 8476 팀장 · brm → admin 으로 승격
  await conn.run("INSERT INTO users(employee_no, name, role) VALUES ('099002', '나부장', 'requester')"); // 1094 부장(DU22) → admin
  await conn.run("INSERT INTO users(employee_no, name, role) VALUES ('045348', '유기획', 'requester')"); // 1094 다른 팀(8470) → brm
  await conn.run("INSERT INTO users(employee_no, name, role) VALUES ('051234', '이현업', 'brm')");        // 규칙 밖 brm → 회수
  await conn.run("INSERT INTO users(employee_no, name, role) VALUES ('024498', '관리자', 'admin')");      // 미러에 없는 시드 관리자 — 회수하지 않는다
  await conn.run("INSERT INTO users(employee_no, name, role) VALUES ('081100', '정데이터', 'data_brm')"); // 수기 DATA-BRM — 규칙 밖이어도 그대로
  const r = await syncRoles(conn);
  assert.equal(r.adminGranted, 2); // 김브름(brm→admin) · 나부장(requester→admin)
  assert.equal(r.granted, 1);      // 유기획
  assert.equal(r.revoked, 1);      // 이현업
  assert.equal(r.provisioned, 5);  // 미러에 있는데 users 에 없던 전원(정담당·오담당·박영업·최기획·한그룹) — 외주(DU90)는 미러 자체에 없다
  const pre = await conn.get("SELECT name, org_nm, position, role, last_login_at FROM users WHERE employee_no='045346'");
  assert.deepEqual([pre.name, pre.org_nm, pre.position, pre.role, pre.last_login_at], ['정담당', 'AX디지털추진부', '과장', 'admin', null]); // 8476 → 사전 등록부터 admin
  assert.equal((await conn.get("SELECT role FROM users WHERE employee_no='045347'")).role, 'admin'); // 8476 대리도 admin
  const plain = await conn.get("SELECT name, org_nm, role FROM users WHERE employee_no='073322'");
  assert.deepEqual([plain.name, plain.org_nm, plain.role], ['최기획', '경영기획부', 'requester']); // 규칙 밖 → requester
  assert.equal((await conn.get('SELECT COUNT(*) AS n FROM users')).n, 11); // 기존 6 + 사전 등록 5
  const again = await syncRoles(conn);
  assert.deepEqual([again.adminGranted, again.granted, again.revoked, again.provisioned], [0, 0, 0, 0]); // 두 번째 실행은 바꿀 게 없다
  assert.equal((await conn.get("SELECT role FROM users WHERE employee_no='045345'")).role, 'admin');
  assert.equal((await conn.get("SELECT role FROM users WHERE employee_no='099002'")).role, 'admin');
  assert.equal((await conn.get("SELECT role FROM users WHERE employee_no='045348'")).role, 'brm');
  assert.equal((await conn.get("SELECT role FROM users WHERE employee_no='051234'")).role, 'requester');
  assert.equal((await conn.get("SELECT role FROM users WHERE employee_no='024498'")).role, 'admin');
  assert.equal((await conn.get("SELECT role FROM users WHERE employee_no='081100'")).role, 'data_brm');
  await conn.close();
});

test('접수 알림 수신자: 발송 시점 users 역할이 admin 인 직원만 — brm 은 담당자 지정 때만, HR 미러의 1094 소속은 기준이 아니다', async () => {
  const conn = await memoryDb();
  await replaceMirrorRows(conn, MOCK_EMPLOYEES.map(normalizeHrRow).filter((r) => Array.isArray(r)));
  await conn.run("INSERT INTO users(employee_no, name, role) VALUES ('045345', '김브름', 'admin')");    // 1094 · admin → 포함
  await conn.run("INSERT INTO users(employee_no, name, role) VALUES ('024498', '관리자', 'admin')");    // 미러엔 없는 admin → 포함
  await conn.run("INSERT INTO users(employee_no, name, role) VALUES ('045347', '오담당', 'brm')");      // 1094 · brm → 접수 알림은 제외 (담당자 지정 때 받는다)
  await conn.run("INSERT INTO users(employee_no, name, role) VALUES ('045346', '정담당', 'requester')"); // 1094 지만 관리자가 requester 로 내림 → 제외
  await conn.run("INSERT INTO users(employee_no, name, role) VALUES ('045348', '유기획', 'data_brm')");  // 1094 지만 data_brm → BRM 알림에서는 제외
  await conn.run("INSERT INTO users(employee_no, name, role) VALUES ('051234', '이현업', 'requester')"); // 요청자 → 제외
  const list = await listAdminRecipients(conn);
  assert.equal(new Set(list).size, list.length);
  assert.deepEqual(list.sort(), ['024498', '045345']);
  assert.ok(!list.includes('099002'), '미러에만 있고 users 에 없는 1094 소속은 받지 않는다');
  await conn.close();
});

test('관리자 시드는 딱 1회 — 이후 수기 변경이 유지된다', async () => {
  const conn = await memoryDb();
  const quiet = { log() {} };
  const first = await seedInitialAdmins({ conn, empNos: ['024498', '044692'], logger: quiet });
  assert.equal(first.seeded, true);
  assert.equal((await conn.get("SELECT role FROM users WHERE employee_no='024498'")).role, 'admin');
  assert.equal((await conn.get("SELECT role FROM users WHERE employee_no='044692'")).role, 'admin');
  await conn.run("UPDATE users SET role='requester' WHERE employee_no='024498'"); // 수기 강등
  const second = await seedInitialAdmins({ conn, empNos: ['024498', '044692'], logger: quiet });
  assert.equal(second.seeded, false); // 플래그가 있으니 재시드하지 않는다
  assert.equal((await conn.get("SELECT role FROM users WHERE employee_no='024498'")).role, 'requester');
  await conn.close();
});

test('첫 로그인 역할은 미러 규칙으로, 관리자는 로그인 전 직원에게도 역할을 줄 수 있다', async () => {
  const conn = await memoryDb();
  await replaceMirrorRows(conn, MOCK_EMPLOYEES.map(normalizeHrRow).filter((r) => Array.isArray(r)));
  assert.equal(await roleForNewLogin(conn, '045347'), 'admin');     // 8476 팀
  assert.equal(await roleForNewLogin(conn, '099002'), 'admin');     // 1094 부장
  assert.equal(await roleForNewLogin(conn, '045348'), 'brm');       // 1094 다른 팀
  assert.equal(await roleForNewLogin(conn, '073322'), 'requester'); // 경영기획부
  assert.equal(await roleForNewLogin(conn, '000000'), 'requester'); // 미러에 없음
  const made = await provisionUserFromMirror(conn, '073322', 'data_brm');
  assert.equal(made.role, 'data_brm');
  assert.equal(made.name, '최기획');
  assert.equal(await provisionUserFromMirror(conn, '000000', 'data_brm'), null);
  await conn.close();
});
